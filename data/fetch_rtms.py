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

# 서울 25개 구. 다른 지역은 법정동코드 5자리를 직접 넣으면 된다.
SGG = {
    "종로구": "11110", "중구": "11140", "용산구": "11170", "성동구": "11200",
    "광진구": "11215", "동대문구": "11230", "중랑구": "11260", "성북구": "11290",
    "강북구": "11305", "도봉구": "11320", "노원구": "11350", "은평구": "11380",
    "서대문구": "11410", "마포구": "11440", "양천구": "11470", "강서구": "11500",
    "구로구": "11530", "금천구": "11545", "영등포구": "11560", "동작구": "11590",
    "관악구": "11620", "서초구": "11650", "강남구": "11680", "송파구": "11710",
    "강동구": "11740",
}

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


def to_record(r):
    """평당가(만원/평)를 붙인다. 한국 부동산에서 가장 많이 쓰는 지표다."""
    price = num(r.get("거래금액"))          # 만원 단위
    area = num(r.get("전용면적"))           # m²
    per = None
    if price and area and area > 0:
        pyeong = area / M2_PER_PYEONG
        per = round(price / pyeong, 1) if pyeong else None
    return {
        "apt": r.get("아파트", ""),
        "dong": r.get("아파트동", ""),
        "umd": r.get("법정동", ""),
        "jibun": r.get("지번", ""),
        "area": area,
        "floor": int(num(r.get("층")) or 0),
        "buildYear": int(num(r.get("건축년도")) or 0),
        "price": price,
        "perPyeong": per,
        "year": int(num(r.get("년")) or 0),
        "month": int(num(r.get("월")) or 0),
        "day": int(num(r.get("일")) or 0),
        "cancelled": (r.get("계약해제여부") or "").strip() == "O",
        "seller": r.get("매도자", ""),
        "buyer": r.get("매수자", ""),
        "rgstDate": r.get("등기일자", ""),
    }


def summarize(recs):
    live = [r for r in recs if not r["cancelled"] and r["price"]]
    out = {"total": len(recs), "cancelled": len(recs) - len(live), "used": len(live)}
    if not live:
        return out
    prices = [r["price"] for r in live]
    pers = [r["perPyeong"] for r in live if r["perPyeong"]]
    out["medianPrice"] = round(statistics.median(prices), 0)
    out["medianPerPyeong"] = round(statistics.median(pers), 1) if pers else None
    out["avgArea"] = round(statistics.mean([r["area"] for r in live if r["area"]]), 1)
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

    print("\n[XML 파싱]")
    xml = """<response><header><resultCode>000</resultCode>
    <resultMsg>OK</resultMsg></header><body><items>
    <item><거래금액> 120,000</거래금액><건축년도>2015</건축년도><년>2026</년>
    <월>9</월><일>12</일><전용면적>84.99</전용면적><층>12</층>
    <법정동>역삼동</법정동><지번>123-45</지번><아파트>래미안역삼</아파트>
    <아파트동>101</아파트동><계약해제여부></계약해제여부></item>
    <item><거래금액> 90,000</거래금액><년>2026</년><월>9</월><일>3</일>
    <전용면적>59.9</전용면적><층>3</층><법정동>역삼동</법정동>
    <아파트>역삼자이</아파트><계약해제여부>O</계약해제여부></item>
    </items><numOfRows>10</numOfRows><pageNo>1</pageNo>
    <totalCount>2</totalCount></body></response>"""
    root = ET.fromstring(xml)
    ck("resultCode", (root.findtext(".//resultCode") or "").strip() == "000")
    ck("totalCount", (root.findtext(".//totalCount") or "0") == "2")
    items = [{c.tag: (c.text or "").strip() for c in it} for it in root.iter("item")]
    ck("item 2건", len(items) == 2, f"{len(items)}건")

    recs = [to_record(r) for r in items]
    ck("거래금액 120,000", recs[0]["price"] == 120000)
    ck("아파트명", recs[0]["apt"] == "래미안역삼")
    ck("동(aptDong)", recs[0]["dong"] == "101")
    ck("정상 거래는 해제 아님", recs[0]["cancelled"] is False)
    ck("계약해제 O 를 잡아낸다", recs[1]["cancelled"] is True)

    # 84.99㎡ = 25.71평. 120,000만원 / 25.71평 ≈ 4,667만원/평
    p = recs[0]["perPyeong"]
    ck("평당가 계산", p is not None and 4600 < p < 4740, f"{p}만원/평")
    ck("면적 없으면 평당가 None", to_record({"거래금액": "1000"})["perPyeong"] is None)

    print("\n[요약]")
    s = summarize(recs)
    ck("전체 2건", s["total"] == 2)
    ck("해제 1건 제외", s["cancelled"] == 1 and s["used"] == 1, f"사용 {s['used']}건")
    ck("해제 거래는 통계에서 빠짐", s["medianPrice"] == 120000)

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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--selftest", action="store_true", help="키 없이 파서만 검증")
    ap.add_argument("--lawd", help="법정동코드 5자리 또는 서울 구 이름")
    ap.add_argument("--from", dest="a", help="시작 계약년월 YYYYMM")
    ap.add_argument("--to", dest="b", help="끝 계약년월 YYYYMM")
    ap.add_argument("--summary", action="store_true")
    args = ap.parse_args()

    if args.selftest:
        return selftest()
    if not (args.lawd and args.a and args.b):
        ap.error("--lawd --from --to 가 필요합니다 (또는 --selftest)")

    lawd = SGG.get(args.lawd, args.lawd)
    if not (lawd.isdigit() and len(lawd) == 5):
        raise SystemExit("법정동코드는 5자리 숫자이거나 서울 구 이름이어야 합니다: " + args.lawd)

    key = load_key()
    if not key:
        print("인증키가 없습니다.\n"
              "  1) data/.secrets.json 에 {\"data_go_kr\": \"발급받은키\"} 저장\n"
              "  2) 또는 환경변수 DATA_GO_KR_KEY=발급받은키\n"
              "키는 data.go.kr → 마이페이지 → 데이터활용 → Open API → 인증키 발급현황 에서\n"
              "'일반 인증키(Decoding)' 를 복사하면 됩니다.", file=sys.stderr)
        return 2

    CACHE.mkdir(parents=True, exist_ok=True)
    allrecs = []
    for ym in months(args.a, args.b):
        path = CACHE / f"{lawd}_{ym}.json"
        if path.exists():
            recs = json.loads(path.read_text("utf8"))
            print(f"{ym}: 캐시 {len(recs)}건")
        else:
            try:
                items, total = fetch(lawd, ym, key)
            except SystemExit:
                raise
            except Exception as e:        # noqa: BLE001
                print(f"{ym}: 실패 {type(e).__name__} {str(e)[:100]}")
                continue
            recs = [to_record(r) for r in items]
            path.write_text(json.dumps(recs, ensure_ascii=False), "utf8")
            print(f"{ym}: {len(recs)}건 (totalCount {total})")
            time.sleep(0.25)
        allrecs.extend(recs)

    out = CACHE / f"{lawd}_{args.a}_{args.b}.json"
    out.write_text(json.dumps(allrecs, ensure_ascii=False, indent=1), "utf8")
    print(f"\n저장: {out.relative_to(ROOT)}  ({len(allrecs)}건)")

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
