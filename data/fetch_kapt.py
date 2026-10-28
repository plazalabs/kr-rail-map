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
#
# 실제 필드명은 2026-10 확인 결과 이렇다. 예제에 흔히 적힌 kaptHoCnt 는
# 존재하지 않고 hoCnt 다 — 이름을 잘못 적으면 세대수가 통째로 빈다.
F_HO = ("hoCnt", "kaptHoCnt", "hoCntV2")             # 세대수
F_BIL = ("kaptMarea", "kaptTotArea")                 # 관리비부과면적 합
F_EXC = ("privArea", "kaptMparea")                   # 전용면적 합
F_DONG = ("kaptDongCnt", "dongCnt")                  # 동수
F_USE = ("kaptUsedate",)                             # 사용승인일 YYYYMMDD

# 면적 구간별 세대수. 이게 **평형 구성**이다. 합이 세대수와 정확히 맞는다.
#   ~60㎡ / 60~85㎡ / 85~135㎡ / 135㎡~   (전용면적 기준)
F_BANDS = (("kaptMparea60", "~60㎡"), ("kaptMparea85", "60~85㎡"),
           ("kaptMparea135", "85~135㎡"), ("kaptMparea136", "135㎡~"))

# 이 범위를 벗어나면 자료가 깨진 것으로 보고 그 값만 버린다.
# 세대수는 남긴다 — 면적만 이상한 경우가 흔하고, 세대수 자체는 대개 맞다.
EA_RANGE = (10.0, 400.0)       # ㎡, 1세대 평균 전용면적
BA_RANGE = (10.0, 500.0)       # ㎡, 1세대 평균 관리비부과면적
PR_RANGE = (0.50, 0.98)        # 전용률


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


def parse_payload(text):
    """JSON 이든 XML 이든 {"items": [...], "total": n} 로 맞춘다.

    이 두 서비스는 `_type=xml` 을 보내도 **JSON 만** 돌려준다(2026-10 확인).
    처음에 XML 파서만 두었더니 정상 응답을 'XML 이 아님'으로 판정해서
    승인됐는데도 실패로 보고했다. 그래서 둘 다 받는다.
    """
    t = (text or "").lstrip()
    if t.startswith("{"):
        try:
            o = json.loads(t)
        except ValueError:
            raise ApiError("?", "JSON 파싱 실패: " + t[:120])
        body = ((o.get("response") or {}).get("body")) or {}
        items = body.get("items")
        if isinstance(items, dict):                 # {"item": [...]} 형태
            items = items.get("item")
        if items is None:                           # 단건 응답
            one = body.get("item")
            items = [one] if one else []
        if isinstance(items, dict):                 # 단건이 리스트가 아닌 dict
            items = [items]
        rows = [dict(x) for x in items if isinstance(x, dict)]
        total = body.get("totalCount")
        try:
            total = int(total)
        except (TypeError, ValueError):
            total = len(rows)
        return {"items": rows, "total": total}

    root = ET.fromstring(t)
    return {"items": items_of(root), "total": total_of(root)}


# 일시적인 게이트웨이 오류. 기다렸다 다시 부르면 대개 넘어간다.
#
# 04 는 실패율이 **30~70%** 로 높다(2026-10 실측). 간격을 벌려도 나아지지
# 않는다 — 우리가 몰아서 불러서가 아니라 K-apt 쪽이 산발적으로 실패하는
# 것이다. 그런데 실패 응답은 0.1초 만에 돌아온다. 그래서 오래 기다리는
# 것보다 **짧게 여러 번** 부르는 쪽이 훨씬 빠르다.
#
#   3회 · 1.5초 대기  → 성공률 87%, 실패 1건당 4.5초
#   6회 · 0.25초 대기 → 성공률 98%, 실패 1건당 0.6초
RETRY_CODES = ("01", "02", "04", "05")
TRIES = 6
BACKOFF = 0.25

# 22 = 일일 요청 한도 초과(HTTP 429). 이건 **재시도해도 오늘은 안 풀린다.**
# 그리고 절대 '이 단지가 없다'로 취급하면 안 된다 — 그렇게 넘기면 1,009곳이
# 0.2초 만에 '없음'으로 처리되어 basis.json 이 완성된 것처럼 보인다.
# 실제로 2026-10-28 에 그렇게 1,963곳을 통째로 잃었다. 그래서 즉시 멈춘다.
QUOTA_CODES = ("22",)


def call(path, params, key, timeout=25, tries=TRIES):
    """게이트웨이 호출 → {"items": [...], "total": n}. 오류면 ApiError."""
    q = dict(params)
    q["serviceKey"] = key
    url = "%s/%s?%s" % (GW, path, urllib.parse.urlencode(q, safe=""))
    last = None
    for attempt in range(tries):
        req = urllib.request.Request(url, headers={"User-Agent": "kr-rail-map/1.0"})
        try:
            raw = urllib.request.urlopen(req, timeout=timeout).read()
        except urllib.error.HTTPError as e:
            raw = e.read()
        except (urllib.error.URLError, TimeoutError) as e:
            last = ApiError("net", "%s: %s" % (path, e))
            time.sleep(BACKOFF * 4 * (attempt + 1))   # 네트워크는 조금 더 기다린다
            continue
        text = raw.decode("utf-8", "replace")
        err = error_of(text)
        if err:
            last = ApiError(*err)
            if last.code in QUOTA_CODES:
                raise ApiError("22", "일일 요청 한도 초과 — 오늘은 더 부를 수 없다. "
                                     "받은 것까지는 캐시에 남아 있으니 내일 이어서 받는다.")
            if last.code in RETRY_CODES and attempt < tries - 1:
                time.sleep(BACKOFF * (attempt + 1))
                continue
            raise last
        try:
            return parse_payload(text)
        except ET.ParseError:
            last = ApiError("?", "JSON 도 XML 도 아님: " + text[:120])
            time.sleep(BACKOFF * (attempt + 1))
    raise last


def discover(key, folder, op_prefix, params):
    """살아 있는 오퍼레이션 이름을 찾는다.

    반환: (path, 상태). 상태는 "ok" 또는 "needs_approval".
    12(없음)면 다음 버전으로, 30(키 미등록)이면 그 자리에서 멈추고
    사람이 할 일을 알려 준다.

    **응답이 비어 있으면 살아 있는 것으로 치지 않는다.** 폐기된 V1 이
    오류 대신 빈 목록을 돌려주는 경우가 있어서, '오류가 없다'만 보면
    빈 응답을 받고 성공으로 착각한다. 실제로 그렇게 V1 에 붙어
    totalCount 0 을 받아 두고 '승인됐는데 데이터가 없다'로 오해했다.
    """
    last = None
    for v in VERSIONS:
        path = "%s%s/%s%d" % (folder, v, op_prefix, v)
        try:
            got = call(path, params, key)
        except ApiError as e:
            if e.code == "30":
                return path, "needs_approval"
            if e.code == "12":
                last = e
                continue
            raise
        if got["items"]:
            return path, "ok"
        last = ApiError("empty", "응답은 오지만 값이 비었다")
    raise ApiError("12", "1~%d 어느 버전도 값을 주지 않는다 (%s)"
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
    # 탐색에도 numOfRows·pageNo 를 붙인다. 빼면 목록 API 가 빈 응답을
    # 돌려줘서 '살아 있는 버전이 없다'로 잘못 판정한다.
    lp, ls = discover(key, "AptListService", "getSigunguAptList",
                      {"sigunguCode": "11680", "numOfRows": "3", "pageNo": "1"})
    if ls != "ok":
        raise ApiError("30", _approval_help("단지 목록", "AptListService"))
    bp, bs = discover(key, "AptBasisInfoServiceV", "getAphusBassInfoV",
                      {"kaptCode": "A10019883", "numOfRows": "3", "pageNo": "1"})
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


# 괄호 문자만 지운다. 안의 내용은 남긴다 — '경희궁자이(3단지)' 와
# '경희궁자이3단지' 는 같은 단지이고, 이 둘을 못 맞추면 세대수가 빈다.
_BRACKET = re.compile(r"[()\[\]{}]")
# 이름 끝에 붙는 장식. '(분양)'·'임대'·'아파트' 는 단지 이름이 아니다.
# 끝에서만 지운다 — '아파트' 가 중간에 있는 이름을 망가뜨리면 안 된다.
_TAIL_NOISE = re.compile(r"(분양|임대|아파트|주상복합|단지)$")


def match_key(name, dong=""):
    """K-apt 이름과 실거래가 이름을 잇는 키. **양쪽에 같은 함수를 쓴다.**

    K-apt 는 단지명 앞에 법정동 이름을 붙이는 습관이 있다.

        K-apt   신당남산타운(분양)   신당약수하이츠   신당KCC스위첸아파트
        실거래  남산타운             약수하이츠       신당KCC스위첸

    이걸 안 걷어내면 매칭률이 16% 에서 멈춘다. 걷어내면 43% 가 된다
    (2026-10 실측: 3,456곳 중 561 → 1,484).

    남은 57% 는 대부분 **K-apt 에 없는 단지**다. K-apt 는 의무관리대상
    (300세대 이상 등)만 담는다. '블루빌'·'동대문맨션' 같은 소규모는
    애초에 목록에 없다. 억지로 맞추면 옆 단지 세대수를 붙이게 되므로
    맞히지 못한 채로 둔다.
    """
    s = _BRACKET.sub("", norm_name(name))
    s = re.sub(r"\d+단지$", "", s)          # '래미안1단지' → '래미안'
    prev = None
    while prev != s:                        # '아파트(분양)' 처럼 겹겹이 붙은 것
        prev = s
        s = _TAIL_NOISE.sub("", s)
    d = re.sub(r"(동\d*가?|가)$", "", dong or "")
    if d and len(d) >= 2 and s.startswith(d) and len(s) > len(d) + 1:
        s = s[len(d):]
    return s


# ---------------------------------------------------------------- 수집

def sigungu_codes():
    """lawd 표에 있는 시군구 코드 전부. 이미 실거래가를 받아 둔 범위와 같다."""
    return sorted(LAWD.codes())


PART = CACHE / "list_by_sgg.json"


def save_part(doc):
    CACHE.mkdir(parents=True, exist_ok=True)
    PART.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), "utf8")


def fetch_list(key, path, codes, sleep=0.05, partial=None):
    """시군구별 단지 목록. kaptCode·단지명·법정동을 모은다.

    partial: 이미 받아 둔 {시군구코드: [행,...]}. 있으면 그 시군구는 건너뛴다.
    수집이 중간에 끊겨도 다음 실행이 이어서 하도록 매 시군구마다 저장한다.
    """
    out = []
    for i, code in enumerate(codes, 1):
        if partial is not None and code in partial:
            out.extend(partial[code])
            continue
        page, got, rows_here = 1, 0, []
        ok = True
        while True:
            try:
                res = call(path, {"sigunguCode": code, "numOfRows": "999",
                                  "pageNo": str(page)}, key)
            except ApiError as e:
                # 30(미승인)·22(한도)는 그 시군구에 단지가 없다는 뜻이 아니다.
                # 이걸 '건너뜀'으로 처리하면 빈 목록이 캐시에 박혀서
                # 다음 실행이 그 시군구를 영영 안 받는다(실제로 그랬다).
                if e.code in ("30", "22"):
                    if partial is not None:
                        save_part(partial)
                    raise
                print("  ! %s 시군구 %s — 건너뜀 (%s)" % (code, page, e))
                ok = False
                break
            rows = res["items"]
            for r in rows:
                rows_here.append({
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
            if not rows or got >= res["total"] or page >= 20:
                break
            page += 1
            time.sleep(sleep)
        out.extend(rows_here)
        # **실패한 시군구는 캐시에 넣지 않는다.** 빈 목록으로 넣으면
        # 다음 실행이 '이미 받았다'고 건너뛰어 그 구가 통째로 사라진다.
        # 실제로 그렇게 강남구(235곳)가 날아갔다.
        if partial is not None and ok:
            partial[code] = rows_here
            if i % 5 == 0:                       # 중간에 끊겨도 여기까지는 남는다
                save_part(partial)
        if i % 10 == 0:
            print("  목록 %d/%d 시군구 · 단지 %d곳" % (i, len(codes), len(out)))
        time.sleep(sleep)
    if partial is not None:
        save_part(partial)
    return out


BASIS = CACHE / "basis.json"


def save_basis(doc):
    CACHE.mkdir(parents=True, exist_ok=True)
    BASIS.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), "utf8")


def fetch_basis(key, path, codes, sleep=0.05, partial=None, save_every=100):
    """단지별 세대수·면적. codes 는 kaptCode 목록.

    partial: 이미 받아 둔 {kaptCode: 레코드}. 매 100건마다 저장해서
    중간에 끊겨도 처음부터 다시 받지 않는다.

    마지막에 **한 번 더 훑는다.** 6회 재시도로도 2%쯤은 실패하는데,
    그 2%가 하필 대단지일 수 있다. 이미 받은 것은 건너뛰므로 추가 비용이
    거의 없다.
    """
    out = {} if partial is None else partial
    for round_no in (1, 2):
        todo = [c for c in codes if c not in out]
        if not todo:
            break
        if round_no == 2:
            print("  한 번 더 훑는다 — 남은 %d곳" % len(todo))
        for i, kc in enumerate(todo, 1):
            try:
                rows = call(path, {"kaptCode": kc, "numOfRows": "10", "pageNo": "1"},
                            key)["items"]
            except ApiError as e:
                # 30(미승인)·22(한도)는 '이 단지가 없다'가 아니다. 멈춘다.
                if e.code in ("30", "22"):
                    if partial is not None:
                        save_basis(out)
                    raise
                continue
            if rows:
                out[kc] = measure(rows[0])
            if i % save_every == 0:
                print("  기본정보 %d/%d (누적 %d)" % (i, len(todo), len(out)))
                if partial is not None:
                    save_basis(out)
            time.sleep(sleep)
    return out


def used_year(row):
    """사용승인일 YYYYMMDD → 연도. 실거래가의 '건축년도'보다 정확하다."""
    v = str(pick(row, F_USE) or "").strip()
    if len(v) >= 4 and v[:4].isdigit():
        y = int(v[:4])
        if 1950 <= y <= 2100:
            return y
    return None


def bands_of(row):
    """면적 구간별 세대수 [~60, 60~85, 85~135, 135~]. 없으면 None.

    이게 **평형 구성**이다. 3,000세대라도 전부 59㎡면 성격이 전혀 다르고,
    전부 135㎡면 또 다르다. 평균 하나로는 그 차이가 안 보인다.
    합은 세대수와 정확히 일치한다 — 표본 단지 8곳에서 전부 확인했다.
    """
    out = []
    for key, _ in F_BANDS:
        v = as_num(row.get(key))
        out.append(int(v) if v and v > 0 else 0)
    return out if sum(out) else None


def measure(row):
    """기본정보 한 건 → 세대수·면적·평형 구성.

    ## 공급면적은 이 API 에 없다

    K-apt 가 주는 면적은 셋뿐이다.

      privArea    전용면적 합
      kaptMarea   **관리비부과면적** 합
      kaptTarea   연면적 (계단·복도·지하주차장까지 포함, 세대 면적이 아님)

    공급면적(전용+주거공용)을 따로 주지는 않는다. 관리비를 공급면적에
    부과하는 단지가 대부분이라 kaptMarea/세대수 가 사실상 공급면적과
    같아지지만, 전용면적에 부과하는 단지도 있다(관리비부과=전용).
    그래서 이름을 바꾸지 않고 **관리비부과면적**이라고 그대로 적는다.
    전용률도 privArea/kaptMarea 로 계산한 **추정**이라 따로 표시한다.

    ## 게이트

    세대수로 나눈 값이 10㎡나 500㎡로 나오면 그건 아파트 한 채의 면적이
    아니다. 그런 값은 버리고 나머지만 남긴다. 틀린 면적을 보여주느니
    안 보여주는 게 낫다. 세대수는 대개 맞으므로 살린다.
    """
    ho = as_num(pick(row, F_HO))
    bil = as_num(pick(row, F_BIL))
    exc = as_num(pick(row, F_EXC))
    dong = as_num(pick(row, F_DONG))

    rec = {}
    if ho and ho > 0:
        rec["h"] = int(ho)
    if dong and dong > 0:
        rec["d"] = int(dong)
    y = used_year(row)
    if y:
        rec["y"] = y

    if rec.get("h") and exc:
        ea = exc / rec["h"]
        if EA_RANGE[0] <= ea <= EA_RANGE[1]:
            rec["ea"] = round(ea, 1)          # 평균 전용면적

    if rec.get("h") and bil:
        ba = bil / rec["h"]
        if BA_RANGE[0] <= ba <= BA_RANGE[1]:
            rec["ba"] = round(ba, 1)          # 평균 관리비부과면적
            if rec.get("ea"):
                pr = rec["ea"] / ba
                if PR_RANGE[0] <= pr <= PR_RANGE[1]:
                    rec["pr"] = round(pr, 3)  # 전용률(추정)

    bd = bands_of(row)
    if bd:
        rec["bd"] = bd
    return plausible(rec)


def plausible(rec):
    """서로 모순되는 면적을 버린다. measure() 와 save_units() 가 같이 쓴다.

    관리비를 **전용면적에** 부과하는 단지는 kaptMarea 가 전용면적과 같아진다
    (2026-10 실측: 1,219곳 중 114곳). 그대로 두면 '전용 93㎡ · 공급 92㎡'
    라는 줄이 나오는데, 공급면적은 전용면적보다 작을 수 없다.

    저장 직전에 한 번 더 보는 이유: basis.json 은 measure() 결과를 그대로
    담고 있어서, 규칙을 나중에 고치면 옛 캐시에는 적용되지 않는다.
    """
    ea, ba = rec.get("ea"), rec.get("ba")
    if ea and ba and ba <= ea * 1.02:
        rec.pop("ba", None)
        rec.pop("pr", None)

    # 평형 구성 합은 세대수와 같아야 한다 — 같은 단지의 같은 세대를 두 방식으로
    # 센 값이기 때문이다. 대개 ±1~3 안에서 맞는데(반올림·임대 포함 여부),
    # 20% 넘게 어긋나는 단지가 있다(광진코지웰 296 vs 364). 그건 둘 중 하나가
    # 틀렸다는 뜻이고 어느 쪽인지 알 수 없으므로 구성을 버린다.
    h, bd = rec.get("h"), rec.get("bd")
    if h and isinstance(bd, list) and abs(sum(bd) - h) > max(2, h * 0.02):
        rec.pop("bd", None)
    elif not h:
        rec.pop("bd", None)      # 세대수 없이 '구성'만 보여 줄 수는 없다
    return rec


# ---------------------------------------------------------------- 저장

UNITS = CACHE / "units.json"


def save_units(list_rows, basis):
    """(시군구, match_key) 로 찾을 수 있게 적는다.

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
        k = "%s|%s" % (r["sgg"], match_key(r["name"], r.get("as3")))
        if k in units:
            # 같은 키로 겹치는 경우가 실제로 있다 — '신당남산타운(분양)' 과
            # '신당남산타운임대'. 부동산에서 보는 것은 분양(개인 소유) 쪽이라
            # 임대를 뒤로 미루고, 그다음에 세대수가 큰 쪽을 남긴다.
            cur = units[k]
            new_rank = (0 if "임대" in r["name"] else 1, m.get("h") or 0)
            old_rank = (0 if "임대" in cur.get("n", "") else 1, cur.get("h") or 0)
            if new_rank <= old_rank:
                continue
        rec = dict(plausible(dict(m)))
        rec["k"] = r["kapt"]
        rec["n"] = r["name"]
        rec["dong"] = (r["as3"] + " " + r["as4"]).strip()
        units[k] = rec
        matched += 1

    payload = {
        "schema": "kr-rail-map/kapt-units/1",
        "updated": time.strftime("%Y-%m-%d"),
        "source": "국토교통부 공동주택 단지 목록·기본 정보 (K-apt, 공공데이터포털)",
        "basis": "세대수는 hoCnt(사용승인 기준). ea 는 privArea÷세대수(평균 전용면적), "
                 "ba 는 kaptMarea÷세대수(평균 관리비부과면적)로 둘 다 **단지 평균**이며 "
                 "세대별 면적이 아니다. pr 은 ea÷ba 로 계산한 전용률 추정값. "
                 "bd 는 전용면적 구간별 세대수 [~60, 60~85, 85~135, 135~] 이고 합이 세대수와 같다.",
        "note": "K-apt 는 **공급면적을 주지 않는다.** 관리비부과면적(kaptMarea)이 공급면적과 "
                "같은 단지가 대부분이지만 전용면적에 부과하는 단지도 있어 이름을 바꾸지 않았다. "
                "1세대 전용 10~400㎡ · 관리비부과 10~500㎡ · 전용률 50~98% 를 벗어나면 "
                "그 값만 버리고 세대수는 남긴다.",
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

    # JSON 응답 — 이 서비스들은 실제로 이 모양으로 준다
    jl = '{"response":{"body":{"items":[{"kaptCode":"A1"},{"kaptCode":"A2"}],' \
         '"numOfRows":2,"pageNo":1,"totalCount":235},' \
         '"header":{"resultCode":"00","resultMsg":"NORMAL SERVICE."}}}'
    g1 = parse_payload(jl)
    chk("JSON 목록 수", len(g1["items"]), 2)
    chk("JSON totalCount", g1["total"], 235)
    js = '{"response":{"body":{"item":{"kaptCode":"A9","hoCnt":93}},' \
         '"header":{"resultCode":"00"}}}'
    chk("JSON 단건", parse_payload(js)["items"][0]["hoCnt"], 93)
    jw = '{"response":{"body":{"items":{"item":[{"kaptCode":"B1"}]}},' \
         '"header":{"resultCode":"00"}}}'
    chk("JSON items.item 래핑", len(parse_payload(jw)["items"]), 1)
    je = '{"response":{"body":{"items":[],"numOfRows":0,"pageNo":0,"totalCount":0},' \
         '"header":{"resultCode":"00"}}}'
    chk("JSON 빈 목록", parse_payload(je)["items"], [])

    # XML 응답도 계속 받는다
    multi = ET.fromstring("<r><body><items><item><kaptCode>A1</kaptCode></item>"
                          "<item><kaptCode>A2</kaptCode></item></items>"
                          "<totalCount>2</totalCount></body></r>")
    chk("목록 item 수", len(items_of(multi)), 2)
    chk("목록 totalCount", total_of(multi), 2)
    chk("XML 경유", len(parse_payload("<r><body><item><hoCnt>5</hoCnt></item></body></r>")
                       ["items"]), 1)
    empty = ET.fromstring("<r><body><items/></body></r>")
    chk("빈 items", items_of(empty), [])

    # 이름 정규화 — 공백·가운뎃점, 괄호는 보존
    chk("공백 제거", norm_name("래미안 1단지"), "래미안1단지")
    chk("가운뎃점 통일", norm_name("e편한세상·센트럴"), norm_name("e편한세상ㆍ센트럴"))
    chk("괄호 보존", norm_name("래미안(1단지)"), "래미안(1단지)")
    chk("대소문자", norm_name("SK뷰"), "sk뷰")

    # 매칭 키 — K-apt 쪽 장식을 걷어내고 실거래가 이름과 만나야 한다.
    # 이 네 줄이 16% 를 43% 로 만든다. 하나라도 빠지면 그만큼 세대수가 빈다.
    chk("괄호만 제거", match_key("경희궁자이(3단지)"), "경희궁자이")
    chk("동 접두사 제거", match_key("신당남산타운(분양)", "신당동"), "남산타운")
    chk("아파트 꼬리", match_key("신당KCC스위첸아파트", "신당동"), "kcc스위첸")
    chk("임대 꼬리", match_key("약수하이츠아파트(임대)", "약수동"), "하이츠")
    # 실거래가 이름은 동 접두사가 없다. 같은 함수로 같은 키가 나와야 한다.
    chk("양쪽이 같은 키", match_key("남산타운"), match_key("신당남산타운(분양)", "신당동"))
    # 동 이름이 단지명 앞부분과 우연히 같아도, 통째로 지워 없애면 안 된다
    chk("이름이 동 이름뿐이면 남긴다", match_key("신당", "신당동"), "신당")

    # 실제 응답 필드명으로 계산 — 개포자이프레지던스 값
    m = measure({"hoCnt": "3375", "kaptDongCnt": "84",
                 "kaptMarea": "347744", "privArea": "263529",
                 "kaptMparea60": "1068", "kaptMparea85": "1848",
                 "kaptMparea135": "457", "kaptMparea136": "2",
                 "kaptUsedate": "20151127"})
    chk("세대수", m.get("h"), 3375)
    chk("동수", m.get("d"), 84)
    chk("평균 전용면적", m.get("ea"), 78.1)
    chk("평균 관리비부과면적", m.get("ba"), 103.0)
    chk("전용률", m.get("pr"), 0.758)
    chk("평형 구성", m.get("bd"), [1068, 1848, 457, 2])
    chk("평형 구성 합 = 세대수", sum(m["bd"]), m["h"])
    chk("사용승인 연도", m.get("y"), 2015)

    # 게이트: 한 세대 전용면적이 400㎡ 를 넘으면 면적만 버리고 세대수는 살린다
    bad = measure({"hoCnt": "10", "kaptMarea": "90000", "privArea": "60000"})
    chk("이상 면적 → 세대수만", (bad.get("h"), bad.get("ea"), bad.get("ba")),
        (10, None, None))

    # 게이트: 전용률이 50% 미만이면(상가·주차장이 섞인 경우) 전용률을 안 적는다
    bad2 = measure({"hoCnt": "100", "kaptMarea": "20000", "privArea": "5000"})
    chk("전용률 이상 → pr 없음", bad2.get("pr"), None)

    # 세대수가 0이면 아무것도 남기지 않는다
    chk("세대수 0", measure({"hoCnt": "0", "kaptMarea": "1000"}), {})

    # 관리비를 전용면적으로 부과하는 단지 — kaptMarea == privArea.
    # 이걸 '공급면적'이라 적으면 '전용 93㎡ · 공급 92㎡' 가 나온다.
    same = measure({"hoCnt": "100", "kaptMarea": "9300", "privArea": "9300"})
    chk("부과=전용 이면 공급면적 버림", (same.get("ea"), same.get("ba"), same.get("pr")),
        (93.0, None, None))
    # 정상적인 공급면적은 남아야 한다 (전용률 76%)
    ok2 = measure({"hoCnt": "100", "kaptMarea": "12200", "privArea": "9300"})
    chk("정상 공급면적 유지", (ok2.get("ea"), ok2.get("ba"), ok2.get("pr")),
        (93.0, 122.0, 0.762))
    # 옛 캐시에 이미 들어 있던 모순도 저장 직전에 걸러야 한다
    chk("옛 캐시 정리", plausible({"ea": 93.0, "ba": 92.4, "pr": 1.0, "h": 10}),
        {"ea": 93.0, "h": 10})
    # 평형 구성 합이 세대수와 크게 어긋나면 구성만 버린다 (세대수는 남긴다)
    chk("평형구성 합 불일치 → 구성만 버림",
        plausible({"h": 296, "bd": [339, 7, 16, 2]}), {"h": 296})
    chk("±1 차이는 그대로", plausible({"h": 177, "bd": [75, 101, 0, 0]}),
        {"h": 177, "bd": [75, 101, 0, 0]})

    # 사용승인일 형식이 깨져도 버틴다
    chk("사용승인일 이상", used_year({"kaptUsedate": "00000000"}), None)
    chk("사용승인일 없음", used_year({}), None)

    # 필드 이름이 바뀌어도 찾아야 한다
    chk("필드 별칭", as_num(pick({"hoCnt": "55"}, F_HO)), 55)
    chk("옛 이름도 인식", as_num(pick({"kaptHoCnt": "55"}, F_HO)), 55)
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

    # discover: 오류는 없는데 값이 비면 그 버전을 고르면 안 된다
    seen2 = []

    def fake_call_empty(path, params, key, timeout=25):
        seen2.append(path)
        v = int(re.search(r"(\d+)$", path).group(1))
        if v < 4:
            return {"items": [], "total": 0}
        return {"items": [{"kaptCode": "A1"}], "total": 1}

    g["call"] = fake_call_empty
    try:
        p, st = discover("k", "AptListService", "getSigunguAptList", {})
        chk("빈 응답 버전은 건너뜀", (p, st), ("AptListService4/getSigunguAptList4", "ok"))
        chk("빈 응답 건너뛴 횟수", len(seen2), 4)
    finally:
        g["call"] = orig

    # 일일 한도(22)는 '이 단지가 없다'가 아니다. 조용히 넘기면 1,963곳을
    # 잃는다(2026-10-28 실제 발생). fetch_basis 는 22 를 만나면 멈춰야 하고,
    # 이미 받은 것은 그대로 남아야 한다.
    got = {}

    def fake_call_quota(path, params, key, timeout=25):
        kc = params.get("kaptCode")
        if kc == "A3":
            raise ApiError("22", "한도 초과")
        got[kc] = measure({"hoCnt": "100", "kaptMarea": "8500", "privArea": "6200",
                           "kaptDongCnt": "2"})
        return {"items": [{"hoCnt": "100", "kaptMarea": "8500", "privArea": "6200",
                           "kaptDongCnt": "2"}], "total": 1}

    g["call"] = fake_call_quota
    try:
        try:
            fetch_basis("k", "p", ["A1", "A2", "A3", "A4"], sleep=0)
            chk("한도에서 멈춤", False, True)
        except ApiError as e:
            chk("한도에서 멈춤", e.code, "22")
        chk("멈추기 전 받은 것은 남음", sorted(got), ["A1", "A2"])
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
    ap.add_argument("--refresh-list", action="store_true", help="시군구 목록 캐시를 버린다")
    ap.add_argument("--refresh-basis", action="store_true", help="단지 기본정보 캐시를 버린다")
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
            ("단지 목록", "AptListService", "getSigunguAptList",
             {"sigunguCode": "11680", "numOfRows": "3", "pageNo": "1"}),
            ("단지 기본", "AptBasisInfoServiceV", "getAphusBassInfoV",
             {"kaptCode": "A10019883", "numOfRows": "3", "pageNo": "1"}),
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
    stopped = False          # 한도·미승인으로 멈췄는지. 마지막에 안내를 바꾼다.

    if args.list or args.all:
        # 시군구 단위 캐시. 수집이 중간에 끊겨도 다음 실행이 이어서 한다.
        partial = {}
        if PART.exists() and not args.refresh_list:
            try:
                partial = json.loads(PART.read_text("utf8"))
            except Exception:                    # noqa: BLE001
                partial = {}
        if partial:
            # 빈 목록은 '받았는데 단지가 없다'가 아니라 '받다가 실패했다'다.
            # 옛 버그가 실패를 빈 목록으로 저장했으므로 여기서 걸러낸다.
            empty = [k for k, v in partial.items() if not v]
            for k in empty:
                del partial[k]
            if empty:
                print("빈 캐시 %d곳을 버린다: %s" % (len(empty), ", ".join(empty[:8])))
            print("이미 받은 시군구 %d곳은 건너뛴다" % len(partial))
        try:
            rows = fetch_list(key, list_path, codes, partial=partial)
        except ApiError as e:
            # 한도(22)·미승인(30)으로 멈췄다. 받은 것까지는 살린다 —
            # 여기서 그냥 죽으면 1만 곳을 받아 둔 것도 못 쓰게 된다.
            print("중단: %s" % e)
            rows = [r for v in partial.values() for r in v]
            stopped = True
        LIST.write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")), "utf8")
        PART.write_text(json.dumps(partial, ensure_ascii=False, separators=(",", ":")), "utf8")
        print("단지 목록 %d곳 → %s" % (len(rows), LIST.name))
        missing = [c for c in codes if c not in partial]
        if missing:
            print("! 못 받은 시군구 %d곳: %s" % (len(missing), ", ".join(missing[:10])))
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
            # 법정동까지 같이 넣는다. 키를 만들 때 동을 떼어내므로
            # (sgg, dong, key) 세 부분이 맞아야 같은 단지로 볼 수 있다.
            for dk, d in (doc.get("districts") or {}).items():
                sgg, dong = (dk.split("|") + [""])[:2]
                for c in d.get("complexes") or []:
                    wanted.add((sgg, match_key(c["n"], dong)))
        todo = [r["kapt"] for r in rows
                if r["kapt"] and (r["sgg"], match_key(r["name"], r.get("as3"))) in wanted]
        todo = sorted(set(todo))
        print("기본정보 대상 %d곳 (station-complex.json 이 쓰는 단지)" % len(todo))
        prior = {}
        if BASIS.exists() and not args.refresh_basis:
            try:
                prior = json.loads(BASIS.read_text("utf8"))
            except Exception:                    # noqa: BLE001
                prior = {}
        if prior:
            print("이미 받은 단지 %d곳은 건너뛴다" % len(prior))
        try:
            basis = fetch_basis(key, basis_path, todo, partial=prior)
        except ApiError as e:
            print("중단: %s" % e)
            basis = prior
            stopped = True
        save_basis(basis)
        print("기본정보 %d곳 → %s" % (len(basis), BASIS.name))
        if len(basis) < len(todo):
            print("! 아직 못 받은 단지 %d곳 — 다시 실행하면 이어서 받는다"
                  % (len(todo) - len(basis)))
    else:
        basis = json.loads(BASIS.read_text("utf8")) if BASIS.exists() else {}
        if not basis:
            print("basis.json 이 없습니다. --basis 를 먼저 실행하세요.")
            return 1

    matched, size = save_units(rows, basis)
    print("단지 %d곳에 세대수·면적을 붙였다 (%.1f KB) → %s" % (matched, size / 1024, UNITS.name))
    if stopped:
        print()
        print("※ 중간에 멈췄다. 받은 것만 저장했으니 내일 같은 명령을 다시 실행하면")
        print("  이미 받은 단지는 건너뛰고 나머지만 이어서 받는다.")
        return 3
    return 0


if __name__ == "__main__":
    sys.exit(main())
