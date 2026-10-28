"""K-apt 공동주택 단지 정보를 받아 둔다 — **세대수와 공급면적**.

## 왜 이게 시세보다 중요한가

지금 단지 카드에는 '평당 얼마'만 있다. 그런데 12세대짜리 소형 빌라와
3,000세대 대단지는 같은 평당가라도 전혀 다른 자산이다.

  - **세대수**가 없으면 '이 단지가 동네 시세를 만드는가, 따라가는가'를
    말할 수 없다. 3,000세대가 84㎡를 20억에 내놓는 것과 12세대가
    그 값을 받는 것은 시장에서 전혀 다른 사건이다.
  - **공급면적**이 없으면 전용 59㎡를 '24평'이라 부르는 관행과 숫자가
    어긋난다. 우리 평당가는 전용면적으로 계산하는데, 사람들이 보는
    시세표는 대개 공급면적 기준이다. 둘을 같이 보여줘야 대화가 된다.
  - **전용률**은 그 자체로 단지 성격을 말해 준다. 같은 84㎡라도
    전용률 68%면 복도식 구축, 79%면 최근 판상형이다.

## 어디서 받나

공공데이터포털 두 서비스. 둘 다 **활용신청이 따로 필요하다**.

  단지 목록  AptListService4/getSigunguAptList4      시군구코드 → kaptCode
  단지 기본  AptBasisInfoServiceV5/getAphusBassInfoV5  kaptCode → 세대수·면적

## 버전 번호는 짐작하지 않는다

서비스 이름 뒤의 버전은 예고 없이 올라간다. 2026-10 기준 실제로 살아
있는 것은 **V4 / V5** 인데, 흔히 도는 예제는 V2·V3 를 적고 있다. 그대로
쓰면 `NO_OPENAPI_SERVICE_ERROR(12)` 가 떨어지고, 이걸 '키가 틀렸다'로
오해하기 쉽다. 실제로 그렇게 오해해서 한참을 헤맸다.

    12 = 그런 오퍼레이션이 없다        → 버전을 올려 가며 찾는다
    30 = 오퍼레이션은 있는데 키 미등록  → 사람이 활용신청을 해야 한다

그래서 이 스크립트는 1~8 을 훑어 살아 있는 것을 찾아
`data/_kapt/_endpoints.json` 에 적어 둔다.

## 사용

    python data/fetch_kapt.py --probe     # 어떤 버전이 살아 있고 승인됐나
    python data/fetch_kapt.py --list      # 시군구별 단지 목록
    python data/fetch_kapt.py --basis     # 단지별 세대수·면적
    python data/fetch_kapt.py --all       # 위 둘을 이어서
    python data/fetch_kapt.py --selftest  # 키 없이 파서·게이트 검증 (CI)
"""
import argparse
import json
import os
import pathlib
import re
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / "data" / "_kapt"
SECRET = ROOT / "data" / ".secrets.json"
COMPLEX = ROOT / "data" / "station-complex.json"
GW = "https://apis.data.go.kr/1613000"

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import lawd as LAWD  # noqa: E402

# 살아 있는 오퍼레이션 이름을 찾을 때 훑는 버전 범위. 위쪽은 여유다.
VERSIONS = range(1, 9)

# 응답 필드 이름. 서비스 버전이 올라가면 이름이 조금씩 달라져서
# 후보를 여러 개 두고 처음 발견되는 것을 쓴다.
F_HO = ("kaptHoCnt", "hoCnt", "kaptHocnt")           # 세대수
F_SUP = ("kaptMarea", "kaptTotArea")                 # 관리비부과 총면적 ≒ 공급면적 합
F_EXC = ("kaptMparea",)                              # 관리비부과 총전용면적
F_DONG = ("kaptDongCnt", "dongCnt")                  # 동수

# 이 범위를 벗어나면 자료가 깨진 것으로 보고 면적을 버린다.
# 세대수는 남긴다 — 면적만 이상한 경우가 흔하고, 세대수 자체는 대개 맞다.
SUP_RANGE = (20.0, 400.0)      # ㎡, 1세대 평균 공급면적
PR_RANGE = (0.40, 0.95)        # 전용률


class ApiError(RuntimeError):
    """게이트웨이가 돌려준 오류. 코드를 보존해야 12 와 30 을 구분한다."""

    def __init__(self, code, msg):
        self.code = str(code)
        super().__init__("[%s] %s" % (self.code, msg))


# ---------------------------------------------------------------- 응답 파싱

def error_of(text):
    """오류 봉투면 (코드, 메시지), 정상이면 None.

    같은 게이트웨이가 JSON 과 XML 을 둘 다 돌려준다. JSON 쪽은
    `"returnReasonCode": "30"` 처럼 따옴표가 붙어 있어서, XML 태그만
    찾는 파서로는 오류를 놓친다. 실제로 그렇게 놓쳐서 '승인됨'으로
    잘못 보고한 적이 있다.
    """
    if not text:
        return None
    if "OpenAPI_ServiceResponse" not in text:
        return None
    m = re.search(r'"returnReasonCode"\s*:\s*"?([0-9]+)"?', text)
    if not m:
        m = re.search(r"<returnReasonCode>\s*([0-9]+)\s*</returnReasonCode>", text)
    code = m.group(1) if m else "?"
    m2 = re.search(r'"errMsg"\s*:\s*"([^"]*)"', text)
    if not m2:
        m2 = re.search(r"<errMsg>\s*([^<]*)</errMsg>", text)
    msg = (m2.group(1) if m2 else "").strip()
    return code, msg


def items_of(root):
    """<body> 아래 item 들을 dict 로. 단건 응답(<item>)과 목록(<items>)을 모두 받는다."""
    body = root.find(".//body")
    if body is None:
        return []
    got = body.findall("./items/item")
    if got:
        return [{c.tag: (c.text or "").strip() for c in it} for it in got]
    one = body.find("./item")
    if one is not None:
        return [{c.tag: (c.text or "").strip() for c in one}]
    return []


def total_of(root):
    t = root.find(".//totalCount")
    try:
        return int((t.text or "0").strip())
    except (AttributeError, ValueError):
        return 0


def pick(row, names):
    """후보 이름 중 처음으로 값이 있는 것."""
    for n in names:
        v = row.get(n)
        if v not in (None, ""):
            return v
    return None


def as_num(v):
    if v is None:
        return None
    try:
        return float(str(v).replace(",", "").strip())
    except ValueError:
        return None


# ---------------------------------------------------------------- 호출

def load_key():
    k = os.environ.get("DATA_GO_KR_KEY", "").strip()
    if k:
        return k
    if SECRET.exists():
        try:
            return (json.loads(SECRET.read_text("utf8")).get("data_go_kr") or "").strip()
        except Exception:                        # noqa: BLE001
            return ""
    return ""


def call(path, params, key, timeout=25):
    """게이트웨이 호출 → XML 루트. 오류면 ApiError."""
    q = dict(params)
    q["serviceKey"] = key
    url = "%s/%s?%s" % (GW, path, urllib.parse.urlencode(q, safe=""))
    req = urllib.request.Request(url, headers={"User-Agent": "kr-rail-map/1.0"})
    try:
        raw = urllib.request.urlopen(req, timeout=timeout).read()
    except urllib.error.HTTPError as e:
        raw = e.read()
    text = raw.decode("utf-8", "replace")
    err = error_of(text)
    if err:
        raise ApiError(*err)
    try:
        return ET.fromstring(raw)
    except ET.ParseError:
        raise ApiError("?", "XML 이 아님: " + text[:120])


def discover(key, folder, op_prefix, params):
    """살아 있는 오퍼레이션 이름을 찾는다.

    반환: (path, 상태). 상태는 "ok" 또는 "needs_approval".
    12(없음)면 다음 버전으로, 30(키 미등록)이면 그 자리에서 멈추고
    사람이 할 일을 알려 준다.
    """
    last = None
    for v in VERSIONS:
        path = "%s%s/%s%d" % (folder, v, op_prefix, v)
        try:
            call(path, params, key)
            return path, "ok"
        except ApiError as e:
            if e.code == "30":
                return path, "needs_approval"
            if e.code == "12":
                last = e
                continue
            raise
    raise ApiError("12", "1~%d 어느 버전에도 살아 있는 오퍼레이션이 없다 (%s)"
                   % (VERSIONS[-1], last))


ENDPOINTS = CACHE / "_endpoints.json"


def save_endpoints(list_path, basis_path):
    CACHE.mkdir(parents=True, exist_ok=True)
    ENDPOINTS.write_text(json.dumps(
        {"list": list_path, "basis": basis_path}, ensure_ascii=False, indent=2), "utf8")


def load_endpoints():
    if ENDPOINTS.exists():
        try:
            return json.loads(ENDPOINTS.read_text("utf8"))
        except Exception:                        # noqa: BLE001
            return {}
    return {}


def resolve(key, force=False):
    """(목록 경로, 기본정보 경로). 찾은 결과는 파일에 적어 두고 재사용한다."""
    cur = {} if force else load_endpoints()
    if cur.get("list") and cur.get("basis"):
        return cur["list"], cur["basis"]
    lp, ls = discover(key, "AptListService", "getSigunguAptList", {"sigunguCode": "11680"})
    if ls != "ok":
        raise ApiError("30", _approval_help("단지 목록", "AptListService"))
    bp, bs = discover(key, "AptBasisInfoServiceV", "getAphusBassInfoV", {"kaptCode": "A10027817"})
    if bs != "ok":
        raise ApiError("30", _approval_help("단지 기본 정보", "AptBasisInfoServiceV"))
    save_endpoints(lp, bp)
    return lp, bp


def _approval_help(what, folder):
    return ("%s API 에 이 키가 등록돼 있지 않다. 공공데이터포털에서 "
            "활용신청(자동승인)을 해야 한다. 서비스명 '%s'" % (what, folder))


# ---------------------------------------------------------------- 이름 정규화

_WS = re.compile(r"[\s\u00a0]+")
_SEP = re.compile(r"[·ㆍ・]")


def norm_name(n):
    """단지명 비교용. 두 자료의 표기가 조금씩 다르다.

    공백을 지우고 가운뎃점류를 하나로 모은다. 괄호는 **남긴다** —
    '래미안1단지'와 '래미안'은 다른 단지이고, '(101동)' 같은 부기는
    어차피 양쪽 다 안 붙는다.
    """
    s = str(n or "").strip()
    s = _SEP.sub(".", s)
    s = _WS.sub("", s)
    return s.lower()


# ---------------------------------------------------------------- 수집

def sigungu_codes():
    """lawd 표에 있는 시군구 코드 전부. 이미 실거래가를 받아 둔 범위와 같다."""
    return sorted(LAWD.codes())


def fetch_list(key, path, codes, sleep=0.12):
    """시군구별 단지 목록. kaptCode·단지명·법정동을 모은다."""
    out = []
    for i, code in enumerate(codes, 1):
        page, got = 1, 0
        while True:
            root = call(path, {"sigunguCode": code, "numOfRows": "500",
                               "pageNo": str(page)}, key)
            rows = items_of(root)
            for r in rows:
                out.append({
                    "kapt": (r.get("kaptCode") or "").strip(),
                    "name": (r.get("kaptName") or "").strip(),
                    "sgg": code,
                    "bjd": (r.get("bjdCode") or "").strip(),
                    "as1": (r.get("as1") or "").strip(),
                    "as2": (r.get("as2") or "").strip(),
                    "as3": (r.get("as3") or "").strip(),
                    "as4": (r.get("as4") or "").strip(),
                })
            got += len(rows)
            if not rows or got >= total_of(root) or page >= 20:
                break
            page += 1
            time.sleep(sleep)
        if i % 10 == 0:
            print("  목록 %d/%d 시군구 · 단지 %d곳" % (i, len(codes), len(out)))
        time.sleep(sleep)
    return out


def fetch_basis(key, path, codes, sleep=0.12):
    """단지별 세대수·면적. codes 는 kaptCode 목록."""
    out = {}
    for i, kc in enumerate(codes, 1):
        try:
            root = call(path, {"kaptCode": kc, "numOfRows": "10", "pageNo": "1"}, key)
        except ApiError as e:
            if e.code == "30":
                raise
            continue
        rows = items_of(root)
        if not rows:
            continue
        out[kc] = measure(rows[0])
        if i % 200 == 0:
            print("  기본정보 %d/%d" % (i, len(codes)))
        time.sleep(sleep)
    return out


def measure(row):
    """기본정보 한 건 → 세대수·평균 공급면적·전용률.

    게이트를 두는 이유: kaptMarea 는 '관리비 부과 총면적'이라 단지에 따라
    상가·주차장이 섞여 들어간다. 세대수로 나눈 값이 20㎡나 400㎡로
    나오면 그건 아파트 한 채의 면적이 아니다. 그런 값은 버리고 세대수만
    남긴다. 틀린 면적을 보여주느니 안 보여주는 게 낫다.
    """
    ho = as_num(pick(row, F_HO))
    sup = as_num(pick(row, F_SUP))
    exc = as_num(pick(row, F_EXC))
    dong = as_num(pick(row, F_DONG))

    rec = {}
    if ho and ho > 0:
        rec["h"] = int(ho)
    if dong and dong > 0:
        rec["d"] = int(dong)

    if rec.get("h") and sup and exc:
        sa = sup / rec["h"]
        ea = exc / rec["h"]
        pr = exc / sup if sup else None
        if SUP_RANGE[0] <= sa <= SUP_RANGE[1] and pr and PR_RANGE[0] <= pr <= PR_RANGE[1]:
            rec["sa"] = round(sa, 1)     # 평균 공급면적
            rec["ea"] = round(ea, 1)     # 평균 전용면적
            rec["pr"] = round(pr, 3)     # 전용률
    return rec


# ---------------------------------------------------------------- 저장

UNITS = CACHE / "units.json"


def save_units(list_rows, basis):
    """(시군구, 단지명) 으로 찾을 수 있게 적는다.

    법정동으로 잇지 않는 이유: 두 자료의 표기가 다르다. 실거래가는
    '부발읍 아리미'인데 K-apt 는 as3='부발읍', as4='아리미'로 나눠 준다.
    단지명은 한 시군구 안에서 거의 유일하므로 그쪽이 안전하다.
    """
    CACHE.mkdir(parents=True, exist_ok=True)
    units, matched = {}, 0
    for r in list_rows:
        m = basis.get(r["kapt"])
        if not m:
            continue
        k = "%s|%s" % (r["sgg"], norm_name(r["name"]))
        if k in units:
            # 같은 이름이 한 구에 둘 있으면 세대수가 큰 쪽을 남긴다
            if (m.get("h") or 0) <= (units[k].get("h") or 0):
                continue
        rec = dict(m)
        rec["k"] = r["kapt"]
        rec["n"] = r["name"]
        rec["dong"] = (r["as3"] + " " + r["as4"]).strip()
        units[k] = rec
        matched += 1

    payload = {
        "schema": "kr-rail-map/kapt-units/1",
        "updated": time.strftime("%Y-%m-%d"),
        "source": "국토교통부 공동주택 단지 목록·기본 정보 (K-apt, 공공데이터포털)",
        "basis": "세대수는 kaptHoCnt. 공급면적은 관리비부과 총면적(kaptMarea)을 "
                 "세대수로 나눈 **단지 평균**이다. 세대별 면적이 아니다.",
        "note": "kaptMarea 에 상가·주차장이 섞이는 단지가 있어, 1세대 20~400㎡ "
                "· 전용률 40~95% 를 벗어나면 면적을 버리고 세대수만 남긴다.",
        "count": len(units),
        "units": units,
    }
    UNITS.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), "utf8")
    return matched, UNITS.stat().st_size


# ---------------------------------------------------------------- 검증

def selftest():
    """키 없이 도는 검증. 게이트웨이는 부르지 않는다."""
    ok = fail = 0

    def chk(label, got, want):
        nonlocal ok, fail
        if got == want:
            ok += 1
        else:
            fail += 1
            print("  ✗ %s → %r (기대 %r)" % (label, got, want))

    # 오류 봉투: JSON 과 XML 을 둘 다 잡아야 한다
    j = '{"OpenAPI_ServiceResponse":{"cmmMsgHeader":{"errMsg":"등록되지 않은 서비스키",' \
        '"returnReasonCode":"30"}}}'
    chk("JSON 30", error_of(j), ("30", "등록되지 않은 서비스키"))
    x = "<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>없음</errMsg>" \
        "<returnReasonCode>12</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>"
    chk("XML 12", error_of(x), ("12", "없음"))
    chk("정상 응답", error_of("<response><header><resultCode>00</resultCode></header></response>"), None)
    chk("빈 응답", error_of(""), None)

    # 목록/단건 응답 모두
    multi = ET.fromstring("<r><body><items><item><kaptCode>A1</kaptCode></item>"
                          "<item><kaptCode>A2</kaptCode></item></items>"
                          "<totalCount>2</totalCount></body></r>")
    chk("목록 item 수", len(items_of(multi)), 2)
    chk("목록 totalCount", total_of(multi), 2)
    single = ET.fromstring("<r><body><item><kaptHoCnt>100</kaptHoCnt></item></body></r>")
    chk("단건 item 수", len(items_of(single)), 1)
    chk("단건 값", items_of(single)[0]["kaptHoCnt"], "100")
    empty = ET.fromstring("<r><body><items/></body></r>")
    chk("빈 items", items_of(empty), [])

    # 이름 정규화 — 공백·가운뎃점, 괄호는 보존
    chk("공백 제거", norm_name("래미안 1단지"), "래미안1단지")
    chk("가운뎃점 통일", norm_name("e편한세상·센트럴"), norm_name("e편한세상ㆍ센트럴"))
    chk("괄호 보존", norm_name("래미안(1단지)"), "래미안(1단지)")
    chk("대소문자", norm_name("SK뷰"), "sk뷰")

    # 면적 계산 — 정상
    m = measure({"kaptHoCnt": "1000", "kaptMarea": "85000", "kaptMparea": "62000",
                 "kaptDongCnt": "12"})
    chk("세대수", m.get("h"), 1000)
    chk("동수", m.get("d"), 12)
    chk("평균 공급면적", m.get("sa"), 85.0)
    chk("평균 전용면적", m.get("ea"), 62.0)
    chk("전용률", m.get("pr"), 0.729)

    # 게이트: 한 세대 400㎡ 를 넘으면 면적을 버리고 세대수만
    bad = measure({"kaptHoCnt": "10", "kaptMarea": "90000", "kaptMparea": "60000"})
    chk("이상 면적 → 세대수만", (bad.get("h"), bad.get("sa")), (10, None))

    # 게이트: 전용률이 40% 미만이면 버린다 (상가가 섞인 경우)
    bad2 = measure({"kaptHoCnt": "100", "kaptMarea": "20000", "kaptMparea": "5000"})
    chk("전용률 이상 → 면적 버림", bad2.get("sa"), None)

    # 세대수가 0이면 아무것도 남기지 않는다
    chk("세대수 0", measure({"kaptHoCnt": "0", "kaptMarea": "1000"}), {})

    # 필드 이름이 바뀌어도 찾아야 한다
    chk("필드 별칭", as_num(pick({"hoCnt": "55"}, F_HO)), 55)
    chk("없는 필드", pick({}, F_HO), None)
    chk("콤마 숫자", as_num("1,234"), 1234.0)

    # discover: 12 면 다음 버전으로 넘어가고, 30 이면 멈춘다
    seen = []

    def fake_call_12_30(path, params, key, timeout=25):
        seen.append(path)
        v = int(re.search(r"(\d+)$", path).group(1))
        if v < 3:
            raise ApiError("12", "없음")
        if v == 3:
            raise ApiError("30", "미등록")
        raise AssertionError("여기까지 오면 안 된다")

    import types
    g = globals()
    orig = g["call"]
    g["call"] = fake_call_12_30
    try:
        p, st = discover("k", "AptListService", "getSigunguAptList", {})
        chk("discover 가 V3 에서 멈춤", (p, st), ("AptListService3/getSigunguAptList3",
                                                  "needs_approval"))
        chk("discover 호출 횟수", len(seen), 3)
    finally:
        g["call"] = orig

    print("fetch_kapt selftest: %d 통과 / %d 실패" % (ok, fail))
    return 0 if fail == 0 else 1


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--probe", action="store_true", help="살아 있는 버전과 승인 여부만 확인")
    ap.add_argument("--list", action="store_true", help="시군구별 단지 목록")
    ap.add_argument("--basis", action="store_true", help="단지별 세대수·면적")
    ap.add_argument("--all", action="store_true", help="목록 + 기본정보")
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--refresh-endpoints", action="store_true", help="버전 탐색 캐시를 버린다")
    ap.add_argument("--limit", type=int, default=0, help="시군구 수 제한 (시험용)")
    args = ap.parse_args()

    if args.selftest:
        return selftest()

    key = load_key()
    if not key:
        print("키가 없습니다. data/.secrets.json 의 data_go_kr 또는 DATA_GO_KR_KEY")
        return 1

    if args.probe:
        for what, folder, op, prm in [
            ("단지 목록", "AptListService", "getSigunguAptList", {"sigunguCode": "11680"}),
            ("단지 기본", "AptBasisInfoServiceV", "getAphusBassInfoV", {"kaptCode": "A10027817"}),
        ]:
            try:
                p, st = discover(key, folder, op, prm)
                print("%-8s %-42s %s" % (what, p,
                                         "승인됨" if st == "ok" else "키 미등록(활용신청 필요)"))
            except ApiError as e:
                print("%-8s 실패: %s" % (what, e))
        return 0

    try:
        list_path, basis_path = resolve(key, force=args.refresh_endpoints)
    except ApiError as e:
        print("중단: %s" % e)
        print()
        print("공공데이터포털에서 아래 두 서비스를 활용신청(자동승인)한 뒤 다시 실행하세요.")
        print("  https://www.data.go.kr/data/15057332/openapi.do   국토교통부_공동주택 단지 목록제공 서비스")
        print("  https://www.data.go.kr/data/15058453/openapi.do   국토교통부_공동주택 기본 정보제공 서비스")
        return 2
    print("목록 %s" % list_path)
    print("기본 %s" % basis_path)

    codes = sigungu_codes()
    if args.limit:
        codes = codes[:args.limit]
    print("시군구 %d곳" % len(codes))

    CACHE.mkdir(parents=True, exist_ok=True)
    LIST = CACHE / "list.json"
    BASIS = CACHE / "basis.json"

    if args.list or args.all:
        rows = fetch_list(key, list_path, codes)
        LIST.write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")), "utf8")
        print("단지 목록 %d곳 → %s" % (len(rows), LIST.name))
    else:
        rows = json.loads(LIST.read_text("utf8")) if LIST.exists() else []
        if not rows:
            print("list.json 이 없습니다. --list 를 먼저 실행하세요.")
            return 1

    if args.basis or args.all:
        # station-complex.json 에 실제로 쓰이는 단지만 받는다. 전체를 받으면
        # 1만 건을 넘어 일일 한도에 걸린다.
        wanted = set()
        if COMPLEX.exists():
            doc = json.loads(COMPLEX.read_text("utf8"))
            for d in (doc.get("districts") or {}).values():
                for c in d.get("complexes") or []:
                    wanted.add(norm_name(c["n"]))
        todo = [r["kapt"] for r in rows if r["kapt"] and norm_name(r["name"]) in wanted]
        todo = sorted(set(todo))
        print("기본정보 대상 %d곳 (station-complex.json 이 쓰는 단지)" % len(todo))
        basis = fetch_basis(key, basis_path, todo)
        BASIS.write_text(json.dumps(basis, ensure_ascii=False, separators=(",", ":")), "utf8")
        print("기본정보 %d곳 → %s" % (len(basis), BASIS.name))
    else:
        basis = json.loads(BASIS.read_text("utf8")) if BASIS.exists() else {}
        if not basis:
            print("basis.json 이 없습니다. --basis 를 먼저 실행하세요.")
            return 1

    matched, size = save_units(rows, basis)
    print("단지 %d곳에 세대수·면적을 붙였다 (%.1f KB) → %s" % (matched, size / 1024, UNITS.name))
    return 0


if __name__ == "__main__":
    sys.exit(main())
