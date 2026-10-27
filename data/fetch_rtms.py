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
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / "data" / "_rtms"
SECRET = ROOT / "data" / ".secrets.json"
BASE = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade"

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
            return (json.loads(SECRET.read_text("utf8")).get("data_go_kr") or "").strip()
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


def fetch(lawd, ym, key, rows=1000):
    """한 달치를 페이지 끝까지 받아온다. XML 이라 ElementTree 로 판다."""
    items, page = [], 1
    while True:
        q = urllib.parse.urlencode({
            "serviceKey": key, "LAWD_CD": lawd, "DEAL_YMD": ym,
            "numOfRows": rows, "pageNo": page,
        })
        req = urllib.request.Request(BASE + "?" + q,
                                     headers={"User-Agent": "kr-rail-map/1.0"})
        with urllib.request.urlopen(req, timeout=40) as r:
            raw = r.read().decode("utf-8", "replace")

        # 키 오류는 XML 이 아니라 평문/JSON 으로 떨어질 때가 있다.
        if not raw.lstrip().startswith("<"):
            raise SystemExit("응답이 XML 이 아닙니다. 인증키를 확인하세요:\n" + raw[:400])

        root = ET.fromstring(raw)
        code = (root.findtext(".//resultCode") or "").strip()
        msg = (root.findtext(".//resultMsg") or "").strip()
        if code and code != "000":
            raise SystemExit(f"API 오류 {code}: {msg}")

        total = int((root.findtext(".//totalCount") or "0").strip() or 0)
        for it in root.iter("item"):
            rec = {c.tag: (c.text or "").strip() for c in it}
            if rec:
                items.append(rec)
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

    print(f"\n결과: {ok} 통과 / {bad} 실패")
    return 1 if bad else 0


def fetch_one(code, a, b, key, quiet=False):
    """한 시군구의 기간 거래를 모아 캐시에 쓰고 레코드를 돌려준다."""
    sd, sgg, _parent = LAWD.CODE.get(code, (None, None, ""))
    recs_all = []
    for ym in months(a, b):
        path = CACHE / f"{code}_{ym}.json"
        if path.exists():
            recs = json.loads(path.read_text("utf8"))
            if not quiet:
                print(f"  {ym}: 캐시 {len(recs)}건")
        else:
            try:
                items, total = fetch(code, ym, key)
            except SystemExit:
                raise
            except Exception as e:        # noqa: BLE001
                print(f"  {ym}: 실패 {type(e).__name__} {str(e)[:80]}")
                continue
            recs = [to_record(r) for r in items]
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
    out = CACHE / f"{code}_{a}_{b}.json"
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
