"""국토교통부 아파트 매매 실거래가를 받아 역세권 분석용으로 정리한다.

API
  기본: apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade
  상세: apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev

  둘의 차이는 필드 2개뿐이다.
    기본 12개: 거래금액 건축년도 년 월 일 전용면적 층 법정동 지번 아파트
               아파트동 계약해제여부 등기일자 매도자 매수자
    상세 14개: 위 + 단지일련번호(aptSeq) + 도로명(roadNm)
  호수는 둘 다 없다(비식별화). 그래서 이 스크립트는 기본을 쓴다.

키 넣는 곳 (둘 중 하나)
  환경변수  DATA_GO_KR_KEY=...
  파일      data/.secrets.json  {"data_go_kr": "..."}
  → 이 파일은 .gitignore 에 있어 깃허브에 안 올라간다.

사용
  python data/fetch_rtms.py --lawd 11680 --from 202601 --to 202609
  python data/fetch_rtms.py --lawd 강남구 --from 202601 --to 202609
  python data/fetch_rtms.py --lawd 11680 --from 202601 --to 202609 --summary
"""
import argparse
import json
import os
import pathlib
import statistics
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / "data" / "_rtms"
SECRET = ROOT / "data" / ".secrets.json"
BASE = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade"
FIXTURES = ROOT / "tests" / "fixtures" / "rtms"

# 실거래 1단계 7종 (2026-11-09). 같은 입력(LAWD_CD·DEAL_YMD)·같은 XML 형식이다.
# 서비스 이름은 공식 상세 페이지(docs/api-survey-20261109/det.json)와 2026-11-09 실제 호출로 확인했다.
#   연립다세대는 'RTMSDataSvcRHTrade2' 다. 옛 이름 RTMSDataSvcRHTrade 는 우리 키로 403
#   (SERVICE_KEY_IS_NOT_REGISTERED — 그 서비스에 활용신청을 안 했으니 당연, 폐지 여부는 모름).
# 하루 호출(개발계정): 토지만 1,000, 나머지 10,000.
KINDS = {
    "apt-trade":  ("RTMSDataSvcAptTrade",  "아파트 매매"),
    "apt-rent":   ("RTMSDataSvcAptRent",   "아파트 전월세"),
    "silv-trade": ("RTMSDataSvcSilvTrade", "아파트 분양권전매"),
    "offi-trade": ("RTMSDataSvcOffiTrade", "오피스텔 매매"),
    "offi-rent":  ("RTMSDataSvcOffiRent",  "오피스텔 전월세"),
    "rh-trade":   ("RTMSDataSvcRHTrade2",  "연립다세대 매매"),
    "land-trade": ("RTMSDataSvcLandTrade", "토지 매매"),
    "nrg-trade":  ("RTMSDataSvcNrgTrade",  "상업업무용 매매"),
}
NEW7 = [k for k in KINDS if k != "apt-trade"]


def url_of(kind):
    svc = KINDS[kind][0]
    return f"https://apis.data.go.kr/1613000/{svc}/get{svc}"


def cache_dir(kind):
    # 아파트 매매는 예전 자리(data/_rtms/) 그대로 — build_station_price.py 가 거기를 읽는다.
    return CACHE if kind == "apt-trade" else CACHE / kind


class QuotaExceeded(SystemExit):
    """하루 호출 한도 초과(resultCode 22). 받은 달은 캐시에 있으니 다음 날 같은 명령으로 이어 받는다."""

# 시군구 코드표는 data/lawd.py 한 곳에만 둔다. 여기서 또 관리하면 반드시
# 어긋난다 — 실제로 서울 표를 따로 들고 있다가, 경기·인천을 넣으려니
# '중구'가 서울에도 인천에도 있어서 막혔다.
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import lawd as LAWD  # noqa: E402

# '강남구' 처럼 이름으로도 부를 수 있게 (서울만 — 다른 지역은 동명 구가 있다)
SGG = {n: c for (c, sd, n, _p) in LAWD.ROWS if sd == "서울특별시"}
SGG_NAME = {v: k for k, v in SGG.items()}

M2_PER_PYEONG = 3.305785


def load_key():
    k = os.environ.get("DATA_GO_KR_KEY", "").strip()
    if k:
        return k
    if SECRET.exists():
        try:
            return (json.loads(SECRET.read_text("utf-8-sig")).get("data_go_kr") or "").strip()
        except Exception:                    # noqa: BLE001
            return ""
    return ""


def months(a, b):
    y, m = int(a[:4]), int(a[4:])
    ey, em = int(b[:4]), int(b[4:])
    out = []
    while (y, m) <= (ey, em):
        out.append(f"{y}{m:02d}")
        m += 1
        if m > 12:
            y, m = y + 1, 1
    return out


def parse_xml(raw):
    """응답 한 쪽 → (items, totalCount). 오류면 SystemExit (한도 초과는 QuotaExceeded)."""
    # 키 오류는 XML 이 아니라 평문/JSON 으로 떨어질 때가 있다.
    if not raw.lstrip().startswith("<"):
        raise SystemExit("응답이 XML 이 아닙니다. 인증키를 확인하세요:\n" + raw[:400])
    root = ET.fromstring(raw)
    # 게이트웨이 오류는 <OpenAPI_ServiceResponse><cmmMsgHeader><errMsg> 로 온다 (예: 활용신청 안 한 서비스)
    gw = (root.findtext(".//errMsg") or "").strip()
    if gw and ("LIMITED_NUMBER" in gw or (root.findtext(".//returnReasonCode") or "").strip() == "22"):
        raise QuotaExceeded(f"하루 호출 한도 초과 ({gw}). 내일 같은 명령을 다시 돌리면 받은 달은 건너뛰고 이어 받는다.")
    if gw:
        raise SystemExit(f"게이트웨이 오류: {gw} {(root.findtext('.//returnAuthMsg') or '').strip()}")
    code = (root.findtext(".//resultCode") or "").strip()
    msg = (root.findtext(".//resultMsg") or "").strip()
    if code == "22":
        raise QuotaExceeded(f"하루 호출 한도 초과 ({msg}). 내일 같은 명령을 다시 돌리면 받은 달은 건너뛰고 이어 받는다.")
    if code and code != "000":
        raise SystemExit(f"API 오류 {code}: {msg}")
    total = int((root.findtext(".//totalCount") or "0").strip() or 0)
    items = []
    for it in root.iter("item"):
        rec = {c.tag: (c.text or "").strip() for c in it}
        if rec:
            items.append(rec)
    return items, total


def fetch(lawd, ym, key, rows=1000, kind="apt-trade"):
    """한 달치를 페이지 끝까지 받아온다. XML 이라 ElementTree 로 판다."""
    items, page = [], 1
    base = url_of(kind)
    while True:
        q = urllib.parse.urlencode({
            "serviceKey": key, "LAWD_CD": lawd, "DEAL_YMD": ym,
            "numOfRows": rows, "pageNo": page,
        })
        req = urllib.request.Request(base + "?" + q,
                                     headers={"User-Agent": "kr-rail-map/1.0"})
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                raw = r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:   # 403 등도 본문(errMsg)을 읽어 원인을 보여 준다
            raw = e.read().decode("utf-8", "replace")
        raw = raw.replace(key, "<KEY>")       # 혹시 응답이 키를 되돌려 줘도 화면·캐시에 남기지 않는다

        got, total = parse_xml(raw)
        items.extend(got)
        if page * rows >= total or not total:
            break
        page += 1
        time.sleep(0.12)                 # 한도(보통 1,000회/일)를 아낀다
    return items, total


def num(s):
    """' 12,500' 같은 문자열을 숫자로. 실패하면 None."""
    if s is None:
        return None
    t = str(s).replace(",", "").replace(" ", "").strip()
    if not t:
        return None
    try:
        return float(t)
    except ValueError:
        return None


def pick(r, *keys):
    """여러 후보 키 중 처음으로 값이 있는 것을 쓴다.

    실제 응답은 영어 태그(dealAmount)로 오는데, 문서의 항목 표는 한국어
    (거래금액)로 적혀 있다. 문서만 보고 만들면 전부 빈 값이 된다 —
    실제로 그렇게 만들었다가 121건이 전부 공란이었다. 둘 다 받아 둔다.
    """
    for k in keys:
        v = r.get(k)
        if v is not None and str(v).strip():
            return str(v).strip()
    return ""


def to_record(r):
    """평당가(만원/평)를 붙인다. 한국 부동산에서 가장 많이 쓰는 지표다."""
    price = num(pick(r, "dealAmount", "거래금액"))     # 만원 단위
    area = num(pick(r, "excluUseAr", "전용면적"))       # m²
    per = None
    if price and area and area > 0:
        pyeong = area / M2_PER_PYEONG
        per = round(price / pyeong, 1) if pyeong else None
    return {
        "apt": pick(r, "aptNm", "아파트"),
        "dong": pick(r, "aptDong", "아파트동"),
        "umd": pick(r, "umdNm", "법정동"),
        "jibun": pick(r, "jibun", "지번"),
        "area": area,
        "floor": int(num(pick(r, "floor", "층")) or 0),
        "buildYear": int(num(pick(r, "buildYear", "건축년도")) or 0),
        "price": price,
        "perPyeong": per,
        "year": int(num(pick(r, "dealYear", "년")) or 0),
        "month": int(num(pick(r, "dealMonth", "월")) or 0),
        "day": int(num(pick(r, "dealDay", "일")) or 0),
        # 계약해제는 'O' 일 때만 참이다. 공백(' ')이 정상값이라 strip 이 필수.
        "cancelled": pick(r, "cdealType", "계약해제여부").upper() == "O",
        # 직거래/중개거래 구분 — 직거래가 섞이면 시세가 왜곡될 수 있다
        "dealType": pick(r, "dealingGbn"),
        "seller": pick(r, "slerGbn", "매도자"),
        "buyer": pick(r, "buyerGbn", "매수자"),
        "rgstDate": pick(r, "rgstDate", "등기일자"),
        # 토지임대부 여부 — Y 면 건물만 거래된 것이라 평당가가 낮게 보인다
        "landLease": pick(r, "landLeaseholdGbn").upper() == "Y",
    }


def to_record_kind(kind, r):
    """7종 공통 레코드. 필드 이름은 2026-11-09 실제 응답(tests/fixtures/rtms/*.xml)에서 확인했다.

    매매: price(만원) + area(㎡) → perPyeong(만원/평). 토지는 perM2(만원/㎡).
    전월세: deposit·monthlyRent(만원). monthlyRent 0 = 전세. 전월세 응답에는 해제 필드(cdealType)가 없다.
    지분거래(토지·상업업무용 shareDealingType='지분')는 일부만 산 값이라 단가에서 뺀다 → share=True 로 표시.
    """
    if kind == "apt-trade":
        return to_record(r)
    area_tag = {"land-trade": "dealArea", "nrg-trade": "buildingAr"}.get(kind, "excluUseAr")
    name_tag = {"apt-rent": "aptNm", "silv-trade": "aptNm", "offi-trade": "offiNm",
                "offi-rent": "offiNm", "rh-trade": "mhouseNm"}.get(kind)
    area = num(pick(r, area_tag))
    rec = {
        "name": pick(r, name_tag) if name_tag else "",
        "umd": pick(r, "umdNm"),
        "jibun": pick(r, "jibun"),          # 토지·상업업무용은 '6**' 처럼 가려져 온다
        "area": area,
        "buildYear": int(num(pick(r, "buildYear")) or 0),
        "year": int(num(pick(r, "dealYear")) or 0),
        "month": int(num(pick(r, "dealMonth")) or 0),
        "day": int(num(pick(r, "dealDay")) or 0),
        "cancelled": pick(r, "cdealType").upper() == "O",
    }
    if kind.endswith("-rent"):
        rec["deposit"] = num(pick(r, "deposit"))
        rec["monthlyRent"] = num(pick(r, "monthlyRent")) or 0
        rec["contractType"] = pick(r, "contractType")     # 신규/갱신 (빈 값 많음)
        return rec
    price = num(pick(r, "dealAmount"))
    rec["price"] = price
    rec["dealType"] = pick(r, "dealingGbn")
    rec["share"] = pick(r, "shareDealingType") == "지분"
    if kind == "land-trade":
        rec["perM2"] = round(price / area, 2) if price and area else None
        rec["jimok"] = pick(r, "jimok")
        rec["landUse"] = pick(r, "landUse")
    else:
        rec["perPyeong"] = round(price / (area / M2_PER_PYEONG), 1) if price and area else None
        rec["floor"] = int(num(pick(r, "floor")) or 0)
    if kind == "silv-trade":
        rec["ownership"] = pick(r, "ownershipGbn")         # 실측 '입'(입주권). 분양권 쪽 값은 수집 결과로 확인
    if kind == "rh-trade":
        rec["houseType"] = pick(r, "houseType")
    if kind == "nrg-trade":
        rec["buildingUse"] = pick(r, "buildingUse")
        rec["buildingType"] = pick(r, "buildingType")      # 일반/집합
        rec["landUse"] = pick(r, "landUse")
    return rec


def summarize(recs):
    # 해제와 '가격 없음'은 다르다. 예전에 둘을 같이 세서 121건이 전부
    # 해제로 보고된 적이 있다. 따로 센다.
    cancelled = [r for r in recs if r["cancelled"]]
    noprice = [r for r in recs if not r["cancelled"] and not r["price"]]
    live = [r for r in recs if not r["cancelled"] and r["price"]]
    out = {"total": len(recs), "cancelled": len(cancelled),
           "noprice": len(noprice), "used": len(live)}
    if not live:
        return out
    prices = [r["price"] for r in live]
    pers = [r["perPyeong"] for r in live if r["perPyeong"]]
    out["medianPrice"] = round(statistics.median(prices), 0)
    out["medianPerPyeong"] = round(statistics.median(pers), 1) if pers else None
    out["avgArea"] = round(statistics.mean([r["area"] for r in live if r["area"]]), 1)
    out["direct"] = sum(1 for r in live if r.get("dealType") == "직거래")
    # 단지별 건수 상위 — 어느 단지가 활발히 거래되는지
    by_apt = {}
    for r in live:
        by_apt[r["apt"]] = by_apt.get(r["apt"], 0) + 1
    out["topApt"] = sorted(by_apt.items(), key=lambda x: -x[1])[:10]
    return out


def selftest():
    """키 없이 파서를 검증한다. 응답 형식이 바뀌면 여기서 먼저 걸린다."""
    ok = bad = 0

    def ck(name, cond, detail=""):
        nonlocal ok, bad
        if cond:
            ok += 1
            print(f"  ✓ {name}" + (f"  [{detail}]" if detail else ""))
        else:
            bad += 1
            print(f"  ✗ {name}" + (f"  [{detail}]" if detail else ""))

    print("[숫자 파싱]")
    ck("쉼표·공백 제거", num(" 12,500 ") == 12500)
    ck("빈 문자열은 None", num("") is None)
    ck("None 은 None", num(None) is None)
    ck("소수점", num("84.99") == 84.99)
    ck("쓰레기 값은 None", num("해당없음") is None)

    print("\n[계약년월 범위]")
    ck("1월~3월", months("202601", "202603") == ["202601", "202602", "202603"])
    ck("연도 넘김", months("202511", "202602") == ["202511", "202512", "202601", "202602"])
    ck("한 달", months("202606", "202606") == ["202606"])

    print("\n[XML 파싱 — 실제 응답 형식]")
    # 실제 응답을 그대로 옮긴 것. 태그가 영어다(dealAmount).
    # 처음엔 문서의 항목명(거래금액)만 보고 만들었다가 121건이 전부 공란이었다.
    xml = """<response><header><resultCode>000</resultCode>
    <resultMsg>OK</resultMsg></header><body><items>
    <item><aptDong> </aptDong><aptNm>개포주공5단지</aptNm><buildYear>1983</buildYear>
    <buyerGbn>개인</buyerGbn><cdealDay> </cdealDay><cdealType> </cdealType>
    <dealAmount>420,000</dealAmount><dealDay>29</dealDay><dealMonth>9</dealMonth>
    <dealYear>2026</dealYear><dealingGbn>중개거래</dealingGbn>
    <excluUseAr>83.17</excluUseAr><floor>13</floor><jibun>187</jibun>
    <landLeaseholdGbn>N</landLeaseholdGbn><rgstDate> </rgstDate><sggCd>11680</sggCd>
    <slerGbn>개인</slerGbn><umdNm>개포동</umdNm></item>
    <item><aptNm>역삼자이</aptNm><buildYear>2010</buildYear><cdealType>O</cdealType>
    <dealAmount>90,000</dealAmount><dealDay>3</dealDay><dealMonth>9</dealMonth>
    <dealYear>2026</dealYear><dealingGbn>직거래</dealingGbn><excluUseAr>59.9</excluUseAr>
    <floor>3</floor><jibun>16-2</jibun><landLeaseholdGbn>N</landLeaseholdGbn>
    <umdNm>역삼동</umdNm></item>
    </items><numOfRows>10</numOfRows><pageNo>1</pageNo>
    <totalCount>2</totalCount></body></response>"""
    root = ET.fromstring(xml)
    ck("resultCode", (root.findtext(".//resultCode") or "").strip() == "000")
    ck("totalCount", (root.findtext(".//totalCount") or "0") == "2")
    items = [{c.tag: (c.text or "").strip() for c in it} for it in root.iter("item")]
    ck("item 2건", len(items) == 2, f"{len(items)}건")

    recs = [to_record(r) for r in items]
    ck("거래금액 420,000", recs[0]["price"] == 420000, str(recs[0]["price"]))
    ck("아파트명", recs[0]["apt"] == "개포주공5단지")
    ck("법정동", recs[0]["umd"] == "개포동")
    ck("전용면적", recs[0]["area"] == 83.17)
    ck("층", recs[0]["floor"] == 13)
    ck("계약년월일", (recs[0]["year"], recs[0]["month"], recs[0]["day"]) == (2026, 9, 29))
    ck("공백 동은 빈 문자열", recs[0]["dong"] == "")
    ck("정상 거래는 해제 아님", recs[0]["cancelled"] is False)
    ck("계약해제 O 를 잡아낸다", recs[1]["cancelled"] is True)
    ck("직거래 구분", recs[1]["dealType"] == "직거래")
    ck("토지임대부 N", recs[0]["landLease"] is False)

    # 83.17㎡ = 25.16평. 420,000만원 / 25.16평 ≈ 16,693만원/평
    p = recs[0]["perPyeong"]
    ck("평당가 계산", p is not None and 16500 < p < 16900, f"{p}만원/평")
    ck("면적 없으면 평당가 None", to_record({"dealAmount": "1000"})["perPyeong"] is None)

    print("\n[요약]")
    s = summarize(recs)
    ck("전체 2건", s["total"] == 2)
    ck("해제 1건", s["cancelled"] == 1, f"해제 {s['cancelled']}건")
    ck("사용 1건", s["used"] == 1, f"사용 {s['used']}건")
    ck("해제 거래는 통계에서 빠짐", s["medianPrice"] == 420000)
    ck("가격 없는 거래는 해제로 세지 않는다",
       summarize([{"cancelled": False, "price": None}])["cancelled"] == 0)

    print("\n[빈 응답]")
    empty = ET.fromstring("<response><header><resultCode>000</resultCode></header>"
                          "<body><items/><totalCount>0</totalCount></body></response>")
    ck("item 0건", len(list(empty.iter("item"))) == 0)
    ck("빈 목록 요약이 터지지 않음", summarize([])["used"] == 0)

    print("\n[오류 응답]")
    err = ET.fromstring("<response><header><resultCode>30</resultCode>"
                        "<resultMsg>SERVICE KEY IS NOT REGISTERED</resultMsg></header></response>")
    ck("오류 코드 읽기", (err.findtext(".//resultCode") or "") == "30")

    print("\n[7종 — 2026-11-09 실제 응답 샘플 (tests/fixtures/rtms, 강남구 2026-09, 앞 5건)]")
    # 지어낸 XML 이 아니라 실제로 받은 응답이다. 기대값도 그 응답에서 읽은 값이다.
    def load(kind):
        return parse_xml((FIXTURES / f"{kind}.xml").read_text("utf-8"))
    exp_total = {"apt-rent": 1275, "silv-trade": 3, "offi-trade": 60, "offi-rent": 266,
                 "rh-trade": 72, "land-trade": 230, "nrg-trade": 60}
    for kind in NEW7:
        items, total = load(kind)
        recs = [to_record_kind(kind, r) for r in items]
        ck(f"{kind}: totalCount {exp_total[kind]}", total == exp_total[kind], total)
        ck(f"{kind}: 모든 건에 법정동·계약년월·면적",
           bool(recs) and all(x["umd"] and x["year"] == 2026 and x["month"] == 9 and x["area"] for x in recs))
        if kind.endswith("-rent"):
            ck(f"{kind}: 보증금 숫자", all(isinstance(x["deposit"], float) for x in recs))
        else:
            ck(f"{kind}: 거래금액 숫자", all(isinstance(x["price"], float) for x in recs))
    r = [to_record_kind("apt-rent", x) for x in load("apt-rent")[0]]
    ck("전월세: 보증금 10,000 · 월세 150 (첫 건)", r[0]["deposit"] == 10000 and r[0]["monthlyRent"] == 150)
    ck("전월세: 월세 0 = 전세 (둘째 건 보증금 160,500)", r[1]["monthlyRent"] == 0 and r[1]["deposit"] == 160500)
    r = [to_record_kind("land-trade", x) for x in load("land-trade")[0]]
    ck("토지: ㎡당 = 5,550 / 10㎡ = 555", r[0]["perM2"] == 555.0, r[0]["perM2"])
    ck("토지: 지분거래 표시", r[0]["share"] is True)
    ck("토지: 지번은 가려져 옴 (6**)", r[0]["jibun"] == "6**")
    raw_nrg = load("nrg-trade")[0]
    r = [to_record_kind("nrg-trade", x) for x in raw_nrg]
    ck("상업업무용: 건물면적 645.08 · 거래금액 580,000", r[0]["area"] == 645.08 and r[0]["price"] == 580000)
    ck("상업업무용: 해제 필드는 cdealType (k-skill 코드의 소문자 cdealtype 아님)",
       all("cdealType" in x for x in raw_nrg) and not any("cdealtype" in x for x in raw_nrg))
    r = [to_record_kind("rh-trade", x) for x in load("rh-trade")[0]]
    ck("연립다세대: 이름·주택유형 다세대", r[0]["houseType"] == "다세대" and r[0]["name"] != "")
    r = [to_record_kind("silv-trade", x) for x in load("silv-trade")[0]]
    ck("분양권: 구분 '입'(입주권) · 445,000", r[0]["ownership"] == "입" and r[0]["price"] == 445000)

    print("\n[게이트웨이 오류 · 한도 초과]")
    try:
        parse_xml("<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR"
                  "</errMsg></cmmMsgHeader></OpenAPI_ServiceResponse>")
        ck("미등록 서비스 → 멈춤", False)
    except SystemExit as e:
        ck("미등록 서비스 → 멈춤", "SERVICE_KEY_IS_NOT_REGISTERED" in str(e))
    try:
        parse_xml("<response><header><resultCode>22</resultCode>"
                  "<resultMsg>LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR</resultMsg></header></response>")
        ck("코드 22 → QuotaExceeded (이어 받기)", False)
    except QuotaExceeded:
        ck("코드 22 → QuotaExceeded (이어 받기)", True)

    print(f"\n결과: {ok} 통과 / {bad} 실패")
    return 1 if bad else 0


def fetch_one(code, a, b, key, quiet=False, kind="apt-trade"):
    """한 시군구의 기간 거래를 모아 캐시에 쓰고 레코드를 돌려준다."""
    sd, sgg, _parent = LAWD.CODE.get(code, (None, None, ""))
    recs_all = []
    cdir = cache_dir(kind)
    cdir.mkdir(parents=True, exist_ok=True)
    for ym in months(a, b):
        path = cdir / f"{code}_{ym}.json"
        if path.exists():
            recs = json.loads(path.read_text("utf8"))
            if not quiet:
                print(f"  {ym}: 캐시 {len(recs)}건")
        else:
            try:
                items, total = fetch(code, ym, key, kind=kind)
            except SystemExit:
                raise
            except Exception as e:        # noqa: BLE001
                print(f"  {ym}: 실패 {type(e).__name__} {str(e)[:80]}")
                continue
            recs = [to_record_kind(kind, r) for r in items]
            # 시군구를 붙인다. 실거래가는 법정동 이름만 주기 때문에 같은
            # 이름의 법정동(중구: 서울/인천, 서구: 인천/대구/광주/부산)을
            # 구분할 수 없다. 코드까지 넣어야 나중에 안 섞인다.
            for r in recs:
                r["lawd"] = code
                r["sido"] = sd
                r["sgg"] = sgg
            path.write_text(json.dumps(recs, ensure_ascii=False), "utf8")
            if not quiet:
                print(f"  {ym}: {len(recs)}건 (totalCount {total})")
            time.sleep(0.25)
        recs_all.extend(recs)
    out = cdir / f"{code}_{a}_{b}.json"
    out.write_text(json.dumps(recs_all, ensure_ascii=False, indent=1), "utf8")
    return recs_all


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--selftest", action="store_true", help="키 없이 파서만 검증")
    ap.add_argument("--lawd", help="법정동코드 5자리 또는 서울 구 이름")
    ap.add_argument("--metro", action="store_true",
                    help="수도권(서울·경기·인천) 시군구 전체를 받는다")
    ap.add_argument("--from", dest="a", help="시작 계약년월 YYYYMM")
    ap.add_argument("--to", dest="b", help="끝 계약년월 YYYYMM")
    ap.add_argument("--summary", action="store_true")
    ap.add_argument("--kind", default="apt-trade", choices=list(KINDS) + ["new7"],
                    help="어떤 실거래를 받을지 (new7 = 1단계 7종 전부). 기본 apt-trade")
    args = ap.parse_args()

    if args.selftest:
        return selftest()
    if not (args.a and args.b) or not (args.lawd or args.metro):
        ap.error("--lawd 또는 --metro 와 --from --to 가 필요합니다 (또는 --selftest)")

    if args.metro:
        targets = LAWD.codes()
    else:
        code = SGG.get(args.lawd, args.lawd)
        if not (code.isdigit() and len(code) == 5):
            raise SystemExit("법정동코드는 5자리 숫자이거나 서울 구 이름이어야 합니다: " + args.lawd)
        targets = [code]

    key = load_key()
    if not key:
        print("인증키가 없습니다.\n"
              "  1) data/.secrets.json 에 {\"data_go_kr\": \"발급받은키\"} 저장\n"
              "  2) 또는 환경변수 DATA_GO_KR_KEY=발급받은키\n"
              "키는 data.go.kr → 마이페이지 → 데이터활용 → Open API → 인증키 발급현황 에서\n"
              "'일반 인증키(Decoding)' 를 복사하면 됩니다.", file=sys.stderr)
        return 2

    CACHE.mkdir(parents=True, exist_ok=True)
    if args.kind != "apt-trade":
        # 7종: 시군구 × 달 단위로 캐시하므로, 한도 초과로 멈춰도 다시 돌리면 이어 받는다.
        kinds = NEW7 if args.kind == "new7" else [args.kind]
        for kind in kinds:
            n = 0
            print(f"=== {kind} {KINDS[kind][1]} ({KINDS[kind][0]}) · 시군구 {len(targets)}곳")
            try:
                for i, code in enumerate(targets, 1):
                    n += len(fetch_one(code, args.a, args.b, key, quiet=True, kind=kind))
                    if i % 10 == 0:
                        print(f"  {i}/{len(targets)} … 누적 {n:,}건")
            except QuotaExceeded as e:
                print(f"  ⚠ {kind}: {e}")
                continue
            print(f"  {kind}: 거래 {n:,}건")
        return 0
    if args.metro:
        allrecs = []
        done = 0
        for code in targets:
            sd, sgg, _p = LAWD.CODE[code]
            n_before = len(allrecs)
            print(f"[{done + 1}/{len(targets)}] {code} {sd} {sgg}")
            allrecs.extend(fetch_one(code, args.a, args.b, key, quiet=True))
            got = len(allrecs) - n_before
            if not got:
                print("  → 0건")
            done += 1
        print(f"\n수도권 {len(targets)}개 시군구 · 거래 {len(allrecs):,}건")
        return 0

    allrecs = fetch_one(targets[0], args.a, args.b, key)
    print(f"\n저장: data/_rtms/{targets[0]}_{args.a}_{args.b}.json  ({len(allrecs)}건)")

    if args.summary:
        s = summarize(allrecs)
        print(f"\n계약 {s['total']}건 · 해제 {s['cancelled']}건 · 사용 {s['used']}건")
        if s["used"]:
            print(f"거래금액 중위 {s['medianPrice']:,.0f}만원")
            if s["medianPerPyeong"]:
                print(f"평당가 중위 {s['medianPerPyeong']:,.0f}만원/평")
            print(f"평균 전용면적 {s['avgArea']}㎡")
            print("거래 많은 단지:")
            for n, c in s["topApt"]:
                print(f"  {n:<28} {c}건")
    return 0


if __name__ == "__main__":
    sys.exit(main())
