"""주택건설사업계획승인(=앞으로 들어올 세대) 수집 — 국토교통부 건축HUB.

    python data/fetch_dev.py --selftest      # 키 없이 파서·집계 검증
    python data/fetch_dev.py --probe 11680   # 한 시군구만 받아 원본을 보여준다
    python data/fetch_dev.py --dongs         # 받을 법정동 목록과 규모
    python data/fetch_dev.py --all           # 전부 받는다 (이어받기)

왜 이 자료인가
  부동산에서 '앞으로 이 동네에 몇 세대가 들어오나'는 공급 물량이다.
  건축HUB 의 주택인허가 기본개요(getHpBasisOulnInfo)는 주택건설사업계획
  승인 건마다 대지위치·세대수·사업주체·착공/사용검사 예정일을 준다.
  즉 '아직 준공되지 않은 세대'를 셀 수 있는 몇 안 되는 공개 자료다.

서비스
  https://apis.data.go.kr/1613000/HsPmsHubService/getHpBasisOulnInfo
  국토교통부_건축HUB_주택인허가정보 서비스 (data.go.kr/data/15136560)

  **활용신청을 해야 한다.** 안 하면 returnReasonCode 30 이 온다.
  30 은 '자료 없음'이 아니라 '이 서비스에 이 키가 등록되지 않음'이다.
  22 는 일일 한도 초과다. 둘 다 절대 '없음'으로 넘기면 안 된다.

좌표가 없다
  이 API 는 위경도를 주지 않는다(대지위치 문자열과 시군구/법정동 코드만).
  그래서 개발계획을 역에 붙일 때 **법정동 단위**로 붙인다. 시세와 같은
  입도다. 역에서 몇 m 인지는 알 수 없고, 그렇게 적는다.
"""
import argparse
import json
import os
import pathlib
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from xml.etree import ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / "data" / "_dev"
SECRET = ROOT / "data" / ".secrets.json"
GW = "https://apis.data.go.kr/1613000"
OP = "HsPmsHubService/getHpBasisOulnInfo"

# 이 서비스는 1613000 게이트웨이를 쓴다(K-apt 와 같다). 키는 같지만
# **활용신청은 서비스별로 따로**다. 그래서 30 이 오면 아래 안내를 띄운다.
APPLY_URL = "https://www.data.go.kr/data/15136560/openapi.do"

# 응답 필드 이름. 문서(2026-10 확인) 기준이지만 버전이 올라가면 달라질 수
# 있어서 후보를 여러 개 둔다. 이름을 잘못 적으면 세대수가 통째로 빈다.
F_KEY = ("mgmHsrgstPk",)                       # 건별 고유키
F_NAME = ("bldNm", "cmplxNm")                  # 건물(단지)명
F_ADDR = ("platPlc", "relJibunNm")              # 대지위치
F_HOUSE = ("hhldCnt", "totHhldCnt")             # 세대수
F_PURPS = ("mainPurpsCdNm", "etcPurps")         # 주용도
F_BIZ = ("bizBodyNm",)                          # 사업주체
F_APPROV = ("bizApprvDay", "apprvDay")          # 사업승인일 / 건축허가일
# 착공·준공은 **실제**와 **예정**을 절대 합치지 않는다.
#   실제 착공일이 있다 = 이미 삽을 떴다 = 공급이 확정적이다
#   예정일만 있다   = 아직 인허가 단계다 = 취소·지연될 수 있다
# 이 구분이 부동산에서 제일 쓸모 있는 신호라서 필드를 따로 둔다.
F_START = ("stcnsDay",)                         # 실제 착공일
F_STARTP = ("stcnsSchedDay",)                   # 착공예정일
F_DONE = ("useInsptDay",)                       # 실제 사용검사일(=준공)
F_DONEP = ("useInsptSchedDay",)                 # 사용검사예정일
F_PLAT = ("platArea",)                          # 대지면적
F_TOT = ("totArea",)                            # 연면적
F_CRTN = ("crtnDay",)                           # 생성일자

# 세대수로 인정하는 범위. 이 밖이면 자료가 깨진 것으로 보고 그 건을 버린다.
# (주상복합·기숙사처럼 '세대' 개념이 아닌 건은 세대수가 0 이거나 비어 있다.)
HOUSE_MAX = 20000

# 단지명 자리에 들어오는 '이름이 아닌 것'. 이 API 는 이름을 모를 때 '미정'을 준다.
BAD_NAMES = ("미정", "없음", "없슴", "-", "--", "0",
             "아파트", "공동주택", "주상복합", "주택", "연립주택", "다세대주택")

RETRY_CODES = ("01", "02", "04", "05")
QUOTA_CODES = ("22",)
NEED_APPROVAL = ("30",)
TRIES = 5
BACKOFF = 0.3


class ApiError(RuntimeError):
    def __init__(self, code, msg):
        self.code = str(code)
        super().__init__("[%s] %s" % (self.code, msg))


# ---------------------------------------------------------------- 파싱

def error_of(text):
    """오류 봉투면 (코드, 메시지). 정상이면 None.

    같은 게이트웨이가 JSON 과 XML 을 둘 다 돌려준다. JSON 쪽은
    `"returnReasonCode": "30"` 처럼 따옴표가 붙어 있어서 XML 태그만 찾는
    파서로는 오류를 놓친다 — K-apt 에서 그렇게 '승인됨'으로 잘못 보고했다.
    """
    if not text or "OpenAPI_ServiceResponse" not in text:
        return None
    m = re.search(r'"returnReasonCode"\s*:\s*"?([0-9]+)"?', text)
    if not m:
        m = re.search(r"<returnReasonCode>\s*([0-9]+)\s*</returnReasonCode>", text)
    code = m.group(1) if m else "?"
    m2 = re.search(r'"errMsg"\s*:\s*"([^"]*)"', text)
    if not m2:
        m2 = re.search(r"<errMsg>\s*([^<]*)</errMsg>", text)
    return code, (m2.group(1) if m2 else "").strip()


def parse_payload(text):
    """JSON 이든 XML 이든 {"items": [...], "total": n} 로 맞춘다.

    **빈 본문은 0건이다.** 이 게이트웨이는 데이터가 없는 법정동에 대해
    HTTP 200 + 본문 0바이트를 준다(2026-11-01 실측). 그걸 파서에 그대로
    넣으면 ParseError 로 845곳 순회가 통째로 죽는다 — 한 곳이 비었다고
    전체를 잃으면 안 된다.
    """
    t = (text or "").strip()
    if not t:
        return {"items": [], "total": 0}
    if t.startswith("{"):
        try:
            o = json.loads(t)
        except ValueError:
            raise ApiError("?", "JSON 파싱 실패: " + t[:120])
        body = ((o.get("response") or {}).get("body")) or {}
        items = body.get("items")
        if isinstance(items, dict):
            items = items.get("item")
        if items is None:
            one = body.get("item")
            items = [one] if one else []
        if isinstance(items, dict):
            items = [items]
        rows = [dict(x) for x in items if isinstance(x, dict)]
        try:
            total = int(body.get("totalCount"))
        except (TypeError, ValueError):
            total = len(rows)
        return {"items": rows, "total": total}

    try:
        root = ET.fromstring(t)
    except ET.ParseError:
        # 깨진 본문도 0건으로 본다. 여기서 죽으면 남은 법정동을 다 잃는다.
        return {"items": [], "total": 0}
    body = root.find(".//body")
    if body is None:
        return {"items": [], "total": 0}
    got = body.findall("./items/item")
    if not got:
        one = body.find("./item")
        got = [one] if one is not None else []
    rows = [{c.tag: (c.text or "").strip() for c in it} for it in got]
    t2 = body.find("./totalCount")
    try:
        total = int((t2.text or "0").strip())
    except (AttributeError, ValueError):
        total = len(rows)
    return {"items": rows, "total": total}


def pick(row, names):
    """후보 필드명을 차례로 보고 첫 값을 준다.

    **공백만 있는 값은 없는 것으로 본다.** 이 API 는 빈 칸을 "" 가 아니라
    " " 로 준다(2026-11-01 실측). 그대로 쓰면 단지명이 " " 이 되고,
    날짜가 " " 이 되어 `if not v` 검사가 전부 통과해 버린다.
    """
    for n in names:
        v = row.get(n)
        if v is None:
            continue
        s = str(v).strip()
        if s:
            return s
    return None


def as_int(v):
    if v in (None, ""):
        return None
    try:
        return int(float(str(v).replace(",", "").strip()))
    except ValueError:
        return None


def ymd(v):
    """YYYYMMDD → YYYY-MM-DD. 형식이 아니면 None.

    **9999 같은 값은 날짜가 아니라 '미정' 표기다.** 이 API 는 준공예정일을
    모를 때 99991201 로 준다(2026-11-01 실측). 그대로 쓰면 9,999년 입주
    물량이 생긴다. 1900~2100 밖은 버린다.
    """
    s = (v or "").strip()
    if not re.fullmatch(r"\d{8}", s):
        return None
    if not (1900 <= int(s[:4]) <= 2100):
        return None
    return "%s-%s-%s" % (s[:4], s[4:6], s[6:])


def name_of(name, addr):
    """단지명. 이름이 없거나 '미정' 이면 대지위치에서 만든다.

    이름 없는 줄을 버리면 세대수를 잃는다. 시도·시군구를 떼고 '동 + 번지' 만
    남긴다 — 어느 땅인지는 알아야 쓸모가 있다.
    """
    n = (name or "").strip()
    if n and n not in BAD_NAMES:
        return n
    parts = (addr or "").split()
    if len(parts) > 2:
        return " ".join(parts[2:])
    return parts[-1] if parts else "(이름 없음)"


def measure(row, sgg="", bjd="", dong=""):
    """응답 한 줄 → 저장용 레코드. 쓸 수 없는 줄이면 None."""
    h = as_int(pick(row, F_HOUSE))
    if h is None or h <= 0 or h > HOUSE_MAX:
        return None
    addr = pick(row, F_ADDR) or ""
    done = ymd(pick(row, F_DONE))
    donep = ymd(pick(row, F_DONEP))
    rec = {
        "k": pick(row, F_KEY) or "",
        "n": (pick(row, F_NAME) or "").strip(),
        "a": addr.strip(),
        "h": h,
        "u": pick(row, F_PURPS) or "",
        "b": pick(row, F_BIZ) or "",
        "ap": ymd(pick(row, F_APPROV)),
        "st": ymd(pick(row, F_START)),          # None = 아직 미착공
        "stp": ymd(pick(row, F_STARTP)),
        "dn": done,                              # None = 아직 미준공
        "dnp": donep,
        "pa": as_int(pick(row, F_PLAT)),
        "ta": as_int(pick(row, F_TOT)),
        "cd": ymd(pick(row, F_CRTN)),
        # 입주 연도. 실제 준공일이 있으면 그것, 없으면 예정일.
        # 연도별 공급 곡선을 그릴 때 쓰는 값이라 여기서 한 번만 정한다.
        "y": int((done or donep)[:4]) if (done or donep) else None,
        "sgg": sgg,
        "bjd": bjd,
        "dong": dong,
    }
    rec["n"] = name_of(rec["n"], addr)
    return rec


# ---------------------------------------------------------------- 호출

def load_key():
    """이 서비스 전용 키. 없으면 공용 키로 넘어간다.

    공공데이터포털은 **서비스마다 활용신청을 따로** 받고, 계정마다 승인된
    서비스가 다르다. 주택인허가를 받은 계정과 실거래가를 받은 계정이
    다를 수 있어서 키를 따로 둔다. 공용 키를 덮어쓰면 실거래가 파이프라인이
    조용히 죽는다.
    """
    k = os.environ.get("DATA_GO_KR_KEY_DEV", "").strip()
    if k:
        return k
    if SECRET.exists():
        try:
            d = json.loads(SECRET.read_text("utf8"))
        except Exception:                        # noqa: BLE001
            return ""
        return ((d.get("data_go_kr_dev") or d.get("data_go_kr") or "").strip())
    return ""


def call(params, key, timeout=30, tries=TRIES):
    q = dict(params)
    q["serviceKey"] = key
    url = "%s/%s?%s" % (GW, OP, urllib.parse.urlencode(q, safe=""))
    last = None
    for attempt in range(tries):
        req = urllib.request.Request(url, headers={"User-Agent": "kr-rail-map/1.0"})
        try:
            raw = urllib.request.urlopen(req, timeout=timeout).read()
        except urllib.error.HTTPError as e:
            raw = e.read()
        except (urllib.error.URLError, TimeoutError) as e:
            last = ApiError("net", "%s" % e)
            time.sleep(BACKOFF * 4 * (attempt + 1))
            continue
        text = raw.decode("utf-8", "replace")
        err = error_of(text)
        if err:
            last = ApiError(*err)
            if last.code in QUOTA_CODES:
                raise ApiError("22", "일일 요청 한도 초과 — 오늘은 더 부를 수 없다. "
                                     "받은 것은 캐시에 남아 있으니 내일 이어서 받는다.")
            if last.code in NEED_APPROVAL:
                raise ApiError("30", "이 서비스에 키가 등록돼 있지 않다. %s 에서 "
                                     "'활용신청'을 하고 승인을 받아야 한다." % APPLY_URL)
            if last.code in RETRY_CODES and attempt < tries - 1:
                time.sleep(BACKOFF * (attempt + 1))
                continue
            raise last
        return parse_payload(text)
    raise last


def fetch_sgg(sigungu, key, bjdong=None, rows_per=100, sleep=0.08):
    """한 시군구(또는 한 법정동)의 승인 건을 모두 받는다."""
    out, page, total = [], 1, None
    while True:
        params = {"sigunguCd": sigungu, "numOfRows": rows_per, "pageNo": page,
                  "_type": "json"}
        if bjdong:
            params["bjdongCd"] = bjdong
        got = call(params, key)
        items = got["items"]
        if total is None:
            total = got["total"]
        out.extend(items)
        if not items or len(out) >= total:
            break
        page += 1
        time.sleep(sleep)
        if page > 200:                 # 안전장치. total 이 이상해도 멈춘다.
            break
    return out, (total or 0)


# ---------------------------------------------------------------- 대상 법정동

def load_json(p, default=None):
    p = pathlib.Path(p)
    if not p.exists():
        return default
    return json.loads(p.read_text("utf8"))


def station_sgg():
    """우리 역이 있는 시군구 5자리 코드 목록 (정렬)."""
    sd = load_json(ROOT / "data" / "_station_dong.json", [])
    sgg = sorted({s["lawd"] for s in sd if s.get("lawd")})
    return sgg


def bjdongs_of():
    """시군구 5자리 → 그 안의 법정동 5자리 목록.

    시군구 단위로 한 번에 받는 것이 기본이지만, 이 서비스가 bjdongCd 를
    요구할 수도 있다. 승인 전에는 확인할 방법이 없어서 양쪽 다 버티게 둔다.
    법정동 코드는 K-apt 단지 목록(10자리 = 시군구 5 + 법정동 5)에서 얻는다.
    """
    lst = load_json(ROOT / "data" / "_kapt" / "list.json", []) or []
    out = {}
    for c in lst:
        b = (c.get("bjd") or "").strip()
        if len(b) == 10 and b.isdigit():
            out.setdefault(b[:5], set()).add(b[5:])
    return {k: sorted(v) for k, v in out.items()}


# ---------------------------------------------------------------- 저장

def save(doc):
    CACHE.mkdir(parents=True, exist_ok=True)
    p = CACHE / "rows.json"
    p.write_text(json.dumps(doc, ensure_ascii=False), "utf8")
    return p


def load_saved():
    return load_json(CACHE / "rows.json", None)


# ---------------------------------------------------------------- 자체 점검

def selftest():
    ok = fail = 0
    bad = []

    def chk(name, cond, detail=""):
        nonlocal ok, fail
        if cond:
            ok += 1
        else:
            fail += 1
            bad.append(name + (("  (" + str(detail) + ")") if detail else ""))

    # --- 오류 봉투
    e = error_of('{"OpenAPI_ServiceResponse":{"cmmMsgHeader":'
                 '{"errMsg":"등록되지 않은 서비스키","returnReasonCode":"30"}}}')
    chk("30 을 오류로 읽는다", e and e[0] == "30", e)
    chk("30 은 승인 안내로 이어진다", e and e[0] in NEED_APPROVAL)
    e2 = error_of("<OpenAPI_ServiceResponse><cmmMsgHeader>"
                  "<returnReasonCode>22</returnReasonCode></cmmMsgHeader>"
                  "</OpenAPI_ServiceResponse>")
    chk("XML 오류도 읽는다", e2 and e2[0] == "22", e2)
    chk("정상 응답은 오류가 아니다", error_of('{"response":{"body":{}}}') is None)
    chk("22 는 재시도 금지", "22" in QUOTA_CODES)

    # --- 정상 응답 (문서 스키마 그대로)
    sample = json.dumps({"response": {"header": {"resultCode": "00", "resultMsg": "NORMAL SERVICE."},
                                      "body": {"items": {"item": [
                                          {"mgmHsrgstPk": "A1", "bldNm": "행복아파트",
                                           "platPlc": "서울특별시 강남구 역삼동 123-4",
                                           "hhldCnt": "450", "totHhldCnt": "450",
                                           "mainPurpsCdNm": "공동주택", "bizBodyNm": "○○건설",
                                           "bizApprvDay": "20250310", "stcnsDay": "",
                                           "stcnsSchedDay": "20260401",
                                           "useInsptDay": "", "useInsptSchedDay": "20281231",
                                           "platArea": "12345", "totArea": "67890",
                                           "crtnDay": "20250311"}
                                      ]}, "totalCount": 1}}}, ensure_ascii=False)
    got = parse_payload(sample)
    chk("JSON 목록을 읽는다", len(got["items"]) == 1 and got["total"] == 1, got["total"])

    rec = measure(got["items"][0], "11680", "1168010100", "역삼동")
    chk("세대수를 읽는다", rec and rec["h"] == 450, rec and rec["h"])
    chk("이름을 읽는다", rec and rec["n"] == "행복아파트", rec and rec["n"])
    chk("날짜를 YYYY-MM-DD 로 바꾼다", rec and rec["ap"] == "2025-03-10", rec and rec["ap"])
    # 실제와 예정을 섞으면 '미착공'과 '착공'이 구별되지 않는다. 섞지 않는다.
    chk("빈 착공일은 None", rec and rec["st"] is None, rec and rec["st"])
    chk("착공예정일은 따로 담는다", rec and rec["stp"] == "2026-04-01", rec and rec["stp"])
    chk("빈 준공일은 None", rec and rec["dn"] is None, rec and rec["dn"])
    chk("준공예정일은 따로 담는다", rec and rec["dnp"] == "2028-12-31", rec and rec["dnp"])
    chk("입주연도는 준공예정일에서 뽑는다", rec and rec["y"] == 2028, rec and rec["y"])
    chk("법정동 코드를 실어 보낸다", rec and rec["bjd"] == "1168010100")

    # --- 단건 응답 (item 이 dict)
    one = json.dumps({"response": {"body": {"item": {"bldNm": "한건", "hhldCnt": "10",
                                                     "platPlc": "어딘가"},
                                            "totalCount": 1}}}, ensure_ascii=False)
    g2 = parse_payload(one)
    chk("단건 응답도 목록으로 만든다", len(g2["items"]) == 1, g2)

    # --- XML 응답
    xml = ("<response><body><items><item><bldNm>엑스</bldNm><hhldCnt>77</hhldCnt>"
           "<platPlc>어딘가</platPlc></item></items><totalCount>1</totalCount>"
           "</body></response>")
    g3 = parse_payload(xml)
    chk("XML 도 읽는다", g3["items"] and g3["items"][0]["hhldCnt"] == "77", g3)

    # --- 쓸 수 없는 줄
    chk("세대수 0 은 버린다", measure({"bldNm": "x", "hhldCnt": "0"}) is None)
    chk("세대수 없음은 버린다", measure({"bldNm": "x"}) is None)
    chk("세대수 과대는 버린다", measure({"bldNm": "x", "hhldCnt": "99999"}) is None)
    chk("이름이 없으면 대지위치로 채운다",
        measure({"hhldCnt": "5", "platPlc": "부산 해운대구 우동 1-1"})["n"] == "우동 1-1",
        measure({"hhldCnt": "5", "platPlc": "부산 해운대구 우동 1-1"})["n"])
    # '미정' 은 이름이 아니다. 그대로 두면 화면에 '미정 1,499세대' 가 뜬다.
    chk("'미정' 은 대지위치로 바꾼다",
        measure({"hhldCnt": "5", "bldNm": "미정",
                 "platPlc": "서울특별시 동작구 노량진동 294-220번지"})["n"]
        == "노량진동 294-220번지",
        measure({"hhldCnt": "5", "bldNm": "미정",
                 "platPlc": "서울특별시 동작구 노량진동 294-220번지"})["n"])

    # --- 빈 본문·깨진 본문 (한 곳이 비었다고 전체를 잃으면 안 된다)
    chk("빈 본문은 0건", parse_payload("") == {"items": [], "total": 0})
    chk("공백 본문도 0건", parse_payload("  \n ") == {"items": [], "total": 0})
    chk("깨진 XML 도 0건", parse_payload("<response><body>")["items"] == [])

    # --- 날짜 파서
    chk("날짜 형식이 아니면 None", ymd("2025-03-10") is None)
    chk("여덟 자리는 통과", ymd("20250310") == "2025-03-10")
    chk("빈 값은 None", ymd("") is None)
    # 이 API 는 '미정'을 9999 로 준다. 그대로 쓰면 9,999년 입주가 생긴다.
    chk("9999 는 날짜가 아니다", ymd("99991201") is None)
    chk("1900년 이전도 버린다", ymd("18991231") is None)

    print("fetch_dev selftest: %d 통과 / %d 실패" % (ok, fail))
    for b in bad:
        print("  ✗ " + b)
    return 0 if fail == 0 else 1


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--probe", metavar="SIGUNGU", help="한 시군구만 받아 원본 일부를 보여준다")
    ap.add_argument("--bjdong", metavar="BJDONG", help="--probe 와 함께 쓸 법정동 5자리")
    ap.add_argument("--dongs", action="store_true", help="받을 시군구 목록과 규모")
    ap.add_argument("--all", action="store_true", help="전부 받는다 (이어받기)")
    ap.add_argument("--status", action="store_true", help="지금까지 받은 양")
    args = ap.parse_args()

    if args.selftest:
        return selftest()

    key = load_key()
    if not key:
        print("키가 없다. data/.secrets.json 의 data_go_kr 또는 DATA_GO_KR_KEY.")
        return 2

    if args.dongs:
        sggs = station_sgg()
        bj = bjdongs_of()
        n_dong = sum(len(bj.get(s, [])) for s in sggs)
        print("역이 있는 시군구 %d곳: %s" % (len(sggs), ", ".join(sggs[:12]) + (" ..." if len(sggs) > 12 else "")))
        print("시군구 단위로 받으면 호출 %d번이면 끝난다." % len(sggs))
        print("법정동 단위로 내려가면 호출 %d번 (시군구 단위가 0건일 때만)." % n_dong)
        return 0

    if args.status:
        doc = load_saved()
        if not doc:
            print("받은 것이 없다.")
            return 0
        print("저장: %d건 / 마지막 갱신 %s" % (len(doc.get("rows", [])), doc.get("updated", "?")))
        print("받은 시군구 %d / %d" % (len(doc.get("done", [])), len(station_sgg())))
        return 0

    if args.probe:
        params = {"sigunguCd": args.probe, "numOfRows": 3, "pageNo": 1, "_type": "json"}
        if args.bjdong:
            params["bjdongCd"] = args.bjdong
        try:
            got = call(params, key)
        except ApiError as e:
            print("실패:", e)
            if e.code == "30":
                print("\n%s 에서 활용신청을 하고 승인된 뒤 다시 실행한다." % APPLY_URL)
            return 1
        print("total=%d, 받은 줄=%d" % (got["total"], len(got["items"])))
        for it in got["items"]:
            print(json.dumps(it, ensure_ascii=False)[:600])
        if not got["items"]:
            print("\n빈 응답이다. bjdongCd 를 지정하지 않으면 목록을 안 주는 서비스일 수 있다.")
            print("  --probe %s --bjdong 10100  처럼 법정동을 붙여 보라." % args.probe)
        return 0

    if args.all:
        sggs = station_sgg()
        bj = bjdongs_of()
        # 법정동 코드 없이는 아무것도 안 준다(2026-11-01 실측: sigunguCd 만
        # 주면 {"body":{}} 가 온다). 그래서 시군구 단위로 먼저 찔러보지 않고
        # 처음부터 법정동 단위로 간다. 84 × 1회를 아낀다.
        targets = [(s, b) for s in sggs for b in bj.get(s, [])]
        doc = load_saved() or {"updated": None, "rows": [], "done": [], "total": 0}
        done = set(doc.get("done", []))
        rows = doc.get("rows", [])
        seen = {r["k"] for r in rows if r.get("k")}
        print("시군구 %d곳 · 법정동 %d곳 (역이 있는 법정동 코드를 아는 만큼)"
              % (len(sggs), len(targets)))
        if not targets:
            print("법정동 코드표가 비었다. data/_kapt/list.json 이 필요하다.")
            return 1
        for i, (sgg, bjd) in enumerate(targets, 1):
            tag = "%s/%s" % (sgg, bjd)
            if tag in done:
                continue
            try:
                raw, total = fetch_sgg(sgg, key, bjdong=bjd)
            except ApiError as e:
                print("[%d/%d] %s 실패: %s" % (i, len(targets), tag, e))
                if e.code in QUOTA_CODES or e.code in NEED_APPROVAL:
                    save({"updated": time.strftime("%Y-%m-%d %H:%M"),
                          "rows": rows, "done": sorted(done), "total": len(rows)})
                    print("  받은 것까지 저장했다. 이어서 받으려면 같은 명령을 다시.")
                    return 1
                continue
            added = 0
            for it in raw:
                rec = measure(it, sgg, (it.get("bjdongCd") or bjd).strip(), "")
                if not rec:
                    continue
                if rec["k"] and rec["k"] in seen:
                    continue
                if rec["k"]:
                    seen.add(rec["k"])
                rows.append(rec)
                added += 1
            done.add(tag)
            if added:
                print("[%d/%d] %s: 원본 %d줄 → 저장 %d건 (누적 %d)"
                      % (i, len(targets), tag, len(raw), added, len(rows)))
            # 845곳을 한 곳마다 저장하면 파일을 4GB쯤 다시 쓴다. 10곳마다.
            if i % 10 == 0 or i == len(targets):
                save({"updated": time.strftime("%Y-%m-%d %H:%M"),
                      "rows": rows, "done": sorted(done), "total": len(rows)})
        print("\n완료: %d건" % len(rows))
        print("다음: python data/build_station_dev.py")
        return 0

    ap.print_help()
    return 0


if __name__ == "__main__":
    sys.exit(main())
