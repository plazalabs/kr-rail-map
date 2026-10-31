"""주택인허가 건을 법정동으로 묶어 역에 붙인다 — '앞으로 들어올 세대'.

    python data/build_station_dev.py --selftest   # 받은 자료 없이 검증
    python data/build_station_dev.py              # data/station-dev.json 생성

무엇을 세는가
  건축HUB 주택인허가(getHpBasisOulnInfo)는 주택건설사업계획 승인 건마다
  세대수와 착공·사용검사 일자를 준다. 그중 **아직 사용검사(준공)를 안 받은
  건**이 '앞으로 들어올 물량'이다.

  착공 여부는 **알 수 없다.** 실제 착공일(stcnsDay)은 준공된 건의 89% 에는
  있지만 미준공 건의 2% 에만 있다 — 준공 처리할 때 같이 적는 칸이라
  공사 중인 건은 비어 있다(2026-11-01 실측 7,463건). 그래서 '착공/미착공'을
  나눠 세면 미래 물량이 전부 '미착공'으로 보여 "아무것도 확정되지 않았다"는
  잘못된 인상을 준다. 그 구분은 버리고, 대신 **착공예정일이 이미 지난 물량**을
  센다 — 예정일이 지났는데 준공도 안 됐다는 건 사실이고, 공사 중이거나 밀린 것이다.

좌표가 없다 — 입도를 솔직히 적는다
  이 API 는 위경도를 주지 않는다. 대지위치 문자열과 법정동 코드뿐이다.
  그래서 역에 붙일 때 **법정동 단위**로 붙인다. 시세(station-price)와 같은
  입도다. '이 단지가 역에서 300m' 는 이 자료로 알 수 없다.
  역이 여러 법정동에 걸치면 각 법정동 물량을 그 역에 모두 붙이므로,
  한 건이 두 역에 세어질 수 있다. 역별 값은 '그 역이 속한 동네의 물량'이다.
"""
import json
import pathlib
import re
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
ROWS = ROOT / "data" / "_dev" / "rows.json"
DONG = ROOT / "data" / "_station_dong.json"
KAPT = ROOT / "data" / "_kapt" / "list.json"
OUT = ROOT / "data" / "station-dev.json"

# 최근 몇 년 안에 준공된 것까지 '최근 입주'로 같이 낸다. 시세를 읽을 때
# '작년에 1,500세대 들어왔다'는 정보가 있어야 지금 가격이 설명된다.
RECENT_YEARS = 3

# 역 패널에 넣을 사업 목록 길이. 전부 넣으면 파일이 커진다.
LIST_MAX = 6


# ---------------------------------------------------------------- 법정동 이름

# 대지위치에서 법정동이 시작하는 토큰의 끝글자.
#   '서울특별시 강남구 역삼동 123-4'      → 역삼동
#   '경기도 남양주시 화도읍 마석우리 12'   → 화도읍 마석우리
# 시/구/군 으로 끝나는 토큰은 건너뛴다. '강남구' 를 동으로 잡으면 안 된다.
_DONG_END = ("동", "읍", "면", "가")
# 번지 토큰. 이 API 는 번지를 여러 모양으로 준다(2026-11-01 실측).
#   123-4   산12-3   605-30번지   -722번지
# 뒤의 '번지' 와 앞의 '-' 를 떼고 숫자 모양인지 본다. '-' 를 안 떼면
# '역삼동 -722번지' 가 통째로 법정동 이름이 된다.
_BUNJI = re.compile(r"^산?\d+(-\d+)?$")


def is_bunji(tok):
    return bool(_BUNJI.match(tok.replace("번지", "").lstrip("-")))


def dong_of(addr):
    """대지위치 문자열 → 법정동 이름. 못 뽑으면 ''.

    역 주소데이터의 법정동 표기와 같은 모양으로 맞춘다
    ('화도읍 마석우리' 처럼 읍면 + 리 를 붙여 쓴다).

    번지 뒤에 '외 2필지' 가 붙는 줄이 흔하다. 번지에서 끊지 않으면
    '역삼동 123-4 외 2필지' 가 법정동 이름이 되어 아무 역에도 안 붙는다.

    **법정동 이름은 낱말 하나(읍/면이면 둘)다.** 그 뒤를 계속 붙이면
    '면목동 블록' 이 된다 — 이 API 는 번지가 없을 때 대지위치를
    '서울특별시 중랑구 면목동 블록' 으로 적어 보낸다(7,347줄 중 1,011줄).
    그 이름은 어느 역과도 안 맞아서, 물량이 통째로 사라진다.
    """
    toks = str(addr or "").split()
    if len(toks) < 2:
        return ""
    for i in range(1, len(toks)):
        t = toks[i]
        if t.endswith(("시", "구", "군")):
            continue
        if t.endswith(_DONG_END):
            # '부발읍 아리미' — 읍/면 뒤의 리까지가 한 법정동이다.
            if t.endswith(("읍", "면")) and i + 1 < len(toks) \
                    and toks[i + 1].endswith("리") and not is_bunji(toks[i + 1]):
                return t + " " + toks[i + 1]
            return t
    # 읍면동 토큰이 아예 없으면 포기한다. 마지막 토큰을 쓰면 '123-4' 같은
    # 번지가 법정동 이름이 되어 엉뚱한 곳에 붙는다. 부르는 쪽이 법정동코드
    # 표로 대신한다.
    return ""


def bjd_table():
    """(시군구 5자리, 법정동 5자리) → 법정동 이름.

    대지위치가 비어 있거나 이상하게 적힌 줄을 건지기 위한 보조 표다.

    **법정동코드 전체자료를 먼저 쓴다.** K-apt 단지 목록만 쓰면 단지가 있는
    동의 이름만 알 수 있다. 그러면 인허가가 0건인 동네는 이름이 없어서
    '받았는데 0건'이 아니라 '못 받음'으로 보인다 — 화면이 거짓말을 한다.
    2026-11-01 실측: 받은 법정동 1,191곳 중 이름이 있던 것은 851곳뿐이었다.

    이름은 '읍면 리' 를 붙여 쓴다(주소데이터 표기와 같게). K-apt 는 동 이름만
    주므로 전체자료를 먼저 넣고, 빠진 것만 K-apt 로 채운다.
    """
    out = {}
    import bjd_codes                                     # noqa: E402

    for sgg, sub in (bjd_codes.load() or {}).items():
        for name, b in sub.items():
            out.setdefault((sgg, b), name)

    if KAPT.exists():
        for c in json.loads(KAPT.read_text("utf8")):
            b = c.get("bjd") or ""
            if len(b) == 10 and c.get("as3"):
                out.setdefault((b[:5], b[5:]), c["as3"])
    return out


# ---------------------------------------------------------------- 집계

def empty():
    return {"cnt": 0, "hh": 0, "overdue": 0, "byYear": {}, "list": []}


def add(bucket, rec, today):
    """한 건을 묶음에 더한다.

    **착공 여부는 이 자료로 알 수 없다.** stcnsDay(실제 착공일)는 준공된 건의
    89% 에는 있지만 아직 준공 안 된 건의 2% 에만 있다 — 준공 처리할 때 같이
    적는 칸이라, 공사 중인 건은 비어 있다(2026-11-01 실측 7,463건).
    그래서 '착공/미착공'을 나눠 세면 미래 물량이 전부 '미착공'으로 보여
    "아무것도 확정되지 않았다"는 잘못된 인상을 준다. 그 구분은 버린다.

    대신 **착공예정일이 이미 지난 물량**을 센다. 이건 사실이다 — 예정일이
    지났는데 준공도 안 됐다는 뜻이고, 공사 중이거나 밀린 것이다.
    """
    h = rec.get("h") or 0
    if h <= 0:
        return
    bucket["cnt"] += 1
    bucket["hh"] += h
    y = rec.get("y")
    if y:
        bucket["byYear"][str(y)] = bucket["byYear"].get(str(y), 0) + h
    stp = rec.get("stp")
    if stp and stp < today:
        bucket["overdue"] += h
    bucket["list"].append({"n": rec.get("n") or "", "h": h, "y": y, "stp": stp})


def finish(bucket):
    """목록을 세대수 순으로 줄이고 연도를 정렬한다."""
    bucket["list"].sort(key=lambda x: (-x["h"], x["y"] or 9999))
    bucket["list"] = bucket["list"][:LIST_MAX]
    bucket["byYear"] = dict(sorted(bucket["byYear"].items()))
    return bucket


def dedupe(rows):
    """같은 사업이 여러 승인 건으로 들어온 것을 하나로 접는다.

    이 API 는 **사업이 아니라 인허가 건**을 준다. 같은 대지·같은 연면적·같은
    세대수인데 관리번호만 다른 줄이 흔하다(2026-11-01 실측: 전체 7,463줄 중
    450그룹). 그대로 더하면 물량이 두 배가 된다.

    기준을 넓게 잡지 않는다. 이름·세대수·대지위치가 **모두 같을 때만** 같은
    건으로 본다. '쌍용2단지 919세대' 와 '쌍용2단지 203동 136세대' 는 세대수가
    달라서 다른 줄로 남긴다 — 접으면 919세대짜리 단지가 136세대가 된다.
    넓게 접는 쪽이 더 위험하다.

    연면적(totArea)은 키에 넣지 않는다. 같은 사업의 승인 건끼리 81,297 과
    81,065 처럼 0.3% 만 다른 경우가 있어서, 넣으면 중복이 그대로 남는다.

    남길 것은 **가장 최근에 만들어진 줄**(crtnDay)이다. 일정이 바뀌면 새
    승인 건이 생기므로, 최신 줄이 지금 유효한 일정이다.
    """
    best = {}
    dropped = 0
    for r in rows:
        k = (r.get("sgg"), r.get("bjd"), r.get("n"), r.get("h"),
             (r.get("a") or "").strip())
        cur = best.get(k)
        if cur is None:
            best[k] = r
            continue
        dropped += 1
        if (r.get("cd") or "") > (cur.get("cd") or ""):
            best[k] = r
    return list(best.values()), dropped


def split(rows, this_year):
    """받은 전체 행 → (앞으로 들어올 것, 최근에 들어온 것).

    앞으로: 아직 사용검사(준공)를 안 받았고, **준공예정일이 올해 이후**인 건.
    최근:   준공일이 이번 해 기준 RECENT_YEARS 안에 있는 건.

    **준공예정일이 지난 건은 빼야 한다.** 이 API 는 다 지은 건에도
    useInsptDay 를 비워 두는 경우가 많다(2026-11-01 실측: 역삼동 1,409줄 중
    2016·2020년 준공예정 건이 준공일 공백). 그걸 '미준공'으로 세면 10년 전
    건물이 '앞으로 들어올 물량'이 된다. 예정일이 이미 지났으면 준공됐거나
    사업이 죽은 것이므로 공급으로 세지 않는다. 몇 건인지 따로 보고한다.
    """
    cut = "%d-01-01" % this_year
    plan, recent, stale, undated = [], [], 0, 0
    for r in rows:
        if not (r.get("h") or 0) > 0:
            continue
        dn = r.get("dn")
        if dn:
            try:
                y = int(dn[:4])
            except ValueError:
                continue
            if y >= this_year - RECENT_YEARS:
                recent.append(r)
            continue
        dnp = r.get("dnp")
        if dnp is None:
            undated += 1
            continue
        if dnp < cut:
            stale += 1
            continue
        plan.append(r)
    return plan, recent, stale, undated


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

    # --- 대지위치 → 법정동
    cases = [
        ("서울특별시 강남구 역삼동 123-4", "역삼동"),
        ("서울특별시 강남구 역삼동 123-4 외 2필지", "역삼동"),   # 번지에서 끊는다
        ("경기도 남양주시 화도읍 마석우리 12-3", "화도읍 마석우리"),
        ("경기도 남양주시 퇴계원면 퇴계원리 45", "퇴계원면 퇴계원리"),
        ("서울특별시 종로구 종로1가 1", "종로1가"),
        ("인천광역시 중구 운남동 산12-3", "운남동"),
        ("부산광역시 해운대구 우동", "우동"),
        # 이 API 는 번지를 '번지'·'-' 붙여서도 준다. 안 떼면 통째로 이름이 된다.
        ("서울특별시 강남구 역삼동 -722번지", "역삼동"),
        ("서울특별시 강남구 역삼동 605-30번지", "역삼동"),
        ("", ""),
    ]
    for addr, want in cases:
        got = dong_of(addr)
        chk("대지위치 '%s' → %s" % (addr or "(빈값)", want), got == want, got)

    # --- 나눠 세기
    rows = [
        {"h": 500, "st": "2025-01-02", "dn": None, "dnp": "2027-06-30",
         "stp": "2025-06-01", "y": 2027, "n": "가"},                                    # 착공예정 지남
        {"h": 300, "st": None, "dn": None, "dnp": "2028-12-31",
         "stp": "2027-01-01", "y": 2028, "n": "나"},                                    # 아직 안 지남
        {"h": 200, "st": "2020-05-01", "dn": "2023-06-30", "dnp": None, "y": 2023, "n": "다"},   # 최근 준공
        {"h": 100, "st": "2010-01-01", "dn": "2012-12-31", "dnp": None, "y": 2012, "n": "라"},   # 옛날 준공
        {"h": 0, "st": None, "dn": None, "dnp": "2029-01-01", "y": 2029, "n": "마"},             # 세대수 0
        # 2016년 준공예정인데 준공일이 빈 줄 — 실제 응답에 흔하다. 빼야 한다.
        {"h": 900, "st": None, "dn": None, "dnp": "2016-03-08", "y": 2016, "n": "바"},
        # 예정일 자체가 없는 줄 — 계획으로도 최근으로도 세지 않는다.
        {"h": 700, "st": None, "dn": None, "dnp": None, "y": None, "n": "사"},
    ]
    plan, recent, stale, undated = split(rows, 2026)
    chk("미준공 + 예정일 미래만 '앞으로'", [r["n"] for r in plan] == ["가", "나"],
        [r["n"] for r in plan])
    chk("오래된 준공은 뺀다", [r["n"] for r in recent] == ["다"], [r["n"] for r in recent])
    chk("예정일이 지난 미준공은 공급이 아니다", stale, 1)
    chk("예정일 없는 줄도 공급이 아니다", undated, 1)

    b = empty()
    for r in plan:
        add(b, r, "2026-11-01")
    finish(b)
    chk("총 세대수", b["hh"] == 800, b["hh"])
    chk("연도별로 쌓는다", b["byYear"] == {"2027": 500, "2028": 300}, b["byYear"])
    chk("목록은 세대수 큰 것부터", [x["n"] for x in b["list"]] == ["가", "나"],
        [x["n"] for x in b["list"]])
    # 착공일(st)은 미준공 건에 거의 안 채워진다. 그래도 그 값으로 '확정'을
    # 판단하지 않는다 — 대신 착공예정일이 지난 물량을 센다.
    chk("착공예정일이 지난 물량을 센다", b["overdue"] == 500, b["overdue"])

    # --- 중복 승인 건 접기
    same = {"sgg": "11680", "bjd": "10100", "n": "래미안", "h": 100,
            "ta": 5000, "a": "역삼동 1", "cd": "2020-01-01", "y": 2027}
    newer = dict(same, cd="2025-01-01", y=2029)
    other = {"sgg": "11680", "bjd": "10100", "n": "래미안", "h": 60,
             "ta": 5000, "a": "역삼동 1", "cd": "2025-01-01", "y": 2028}
    # 연면적만 살짝 다른 같은 사업 — 이것도 접어야 한다(실제로 0.3% 차이였다).
    near = dict(same, ta=5020, cd="2024-01-01")
    kept, dropped = dedupe([same, newer, near, other])
    chk("같은 사업의 여러 승인 건을 접는다", dropped, 2)
    chk("가장 최근 줄을 남긴다", [r["y"] for r in kept if r["h"] == 100], [2029])
    chk("세대수가 다르면 다른 건으로 남긴다", len(kept), 2)

    # --- 목록 길이 제한
    b2 = empty()
    for i in range(10):
        add(b2, {"h": i + 1, "n": "x%d" % i, "y": 2030}, "2026-11-01")
    finish(b2)
    chk("목록은 LIST_MAX 개까지만", len(b2["list"]) == LIST_MAX, len(b2["list"]))
    chk("잘라도 총계는 그대로", b2["hh"] == 55, b2["hh"])

    # --- 이름이 비어도 세대수는 잃지 않는다
    b3 = empty()
    add(b3, {"h": 40, "n": "", "y": 2031}, "2026-11-01")
    finish(b3)
    chk("이름 없는 건도 센다", b3["hh"] == 40 and len(b3["list"]) == 1, b3)

    print("build_station_dev selftest: %d 통과 / %d 실패" % (ok, fail))
    for x in bad:
        print("  ✗ " + x)
    return 0 if fail == 0 else 1


# ---------------------------------------------------------------- main

def main():
    if "--selftest" in sys.argv:
        return selftest()

    if not ROWS.exists():
        print("받은 자료가 없다: %s" % ROWS.relative_to(ROOT))
        print("먼저 python data/fetch_dev.py --all 을 실행해야 한다.")
        return 1
    doc = json.loads(ROWS.read_text("utf8"))
    rows = doc.get("rows") or []
    if not rows:
        print("받은 줄이 0건이다. 활용신청이 승인됐는지 확인하라.")
        return 1
    if not DONG.exists():
        print("data/_station_dong.json 이 없다. build_station_dong.py 를 먼저.")
        return 1

    import bjd_codes                                     # noqa: E402
    import dong_match                                    # noqa: E402
    import station_names                                 # noqa: E402

    tab = bjd_table()

    # 역 → (시군구, 법정동). 시세 파이프라인과 같은 표를 쓴다.
    #
    # 주소데이터의 이름·코드를 법정동코드 전체자료에 맞춘다. 원본에는
    # 오타(구로구 '개보동' → 개봉동), 옛 이름(교하읍 야당리 → 야당동),
    # 분구 전 코드(인천 서구 28275 → 검단구 28290)가 섞여 있다. 맞추지
    # 않으면 인허가를 **받아 놓고도** 그 역에 안 붙는다 — 개봉·운정·
    # 검단오류가 실제로 그랬다(2026-11-01).
    dong2st = {}
    fixed = []
    for s in json.loads(DONG.read_text("utf8")):
        if not s.get("dong") or not s.get("lawd"):
            continue
        lawd, dong = s["lawd"], s["dong"]
        code = bjd_codes.code_for(lawd, dong)
        if code:
            lawd, dong = code[:5], tab.get((code[:5], code[5:]), dong)
            if (lawd, dong) != (s["lawd"], s["dong"]):
                fixed.append((s["name"], s["dong"], dong))
        names = station_names.resolve_all(s["name"])
        if names:
            dong2st.setdefault((lawd, dong), set()).update(names)

    if fixed:
        print("주소데이터의 법정동 표기를 전체자료에 맞춘 역 %d개 (예: %s)"
              % (len({f[0] for f in fixed}),
                 ", ".join("%s %s→%s" % f for f in fixed[:2])))

    this_year = time.localtime().tm_year

    rows, dup = dedupe(rows)
    print("중복 승인 건 %d줄을 접었다 → %d줄" % (dup, len(rows)))

    # 법정동마다 나눠 담는다. 이름을 못 뽑은 줄은 버리지 않고 따로 센다.
    by_dong = {}
    no_dong = 0
    for r in rows:
        dong = r.get("dong") or dong_of(r.get("a"))
        if not dong:
            dong = tab.get((r.get("sgg") or "", r.get("bjd") or ""), "")
        if not dong:
            no_dong += 1
            continue
        key = (r.get("sgg") or "", dong)
        by_dong.setdefault(key, []).append(r)

    plan, recent, stale, undated = split(rows, this_year)
    print("받은 %d건 → 앞으로 들어올 %d건 / 최근 %d년 준공 %d건"
          % (len(rows), len(plan), RECENT_YEARS, len(recent)))
    print("  뺀 것: 준공예정일이 이미 지난 미준공 %d건 · 예정일 자체가 없는 %d건"
          % (stale, undated))
    print("  법정동을 못 뽑은 줄 %d건" % no_dong)

    today = time.strftime("%Y-%m-%d")

    def group(subset):
        out = {}
        for r in subset:
            dong = r.get("dong") or dong_of(r.get("a"))
            if not dong:
                dong = tab.get((r.get("sgg") or "", r.get("bjd") or ""), "")
            if not dong:
                continue
            add(out.setdefault((r.get("sgg") or "", dong), empty()), r, today)
        return {k: finish(v) for k, v in out.items()}

    plan_d = group(plan)
    recent_d = group(recent)

    # **자료를 받은 법정동**을 따로 센다. 이게 없으면 '공급 0세대'와
    # '자료를 못 받은 동네'가 화면에서 똑같이 보인다. 전자는 정보이고
    # 후자는 결손인데, 구별하지 않으면 사이트가 거짓말을 한다.
    collected = set()
    for tag in (doc.get("done") or []):
        parts = str(tag).split("/")
        if len(parts) != 2:
            continue
        nm = tab.get((parts[0], parts[1]))
        if nm:
            collected.add((parts[0], nm))
    print("자료를 받은 법정동 %d곳 (그중 역이 있는 곳 %d곳)"
          % (len(collected), sum(1 for k in collected
                                 if dong_match.stations_in(k[0], k[1], dong2st))))

    # 법정동 → 역
    import lawd                                         # noqa: E402

    districts, stations = [], {}
    for (sgg, dong), b in sorted(plan_d.items(), key=lambda kv: -kv[1]["hh"]):
        sts = sorted(dong_match.stations_in(sgg, dong, dong2st))
        rec = {
            "lawd": sgg,
            "sgg": lawd.label_of(sgg) if sgg else "",
            "dong": dong,
            "cnt": b["cnt"], "hh": b["hh"],
            "overdue": b["overdue"],
            "byYear": b["byYear"], "list": b["list"],
            "stations": sts,
        }
        rb = recent_d.get((sgg, dong))
        if rb:
            rec["recent"] = {"cnt": rb["cnt"], "hh": rb["hh"], "byYear": rb["byYear"]}
        districts.append(rec)

    # 역별 값은 '받은 법정동 전체'를 돈다. 물량이 0인 동네도 넣어야
    # 화면이 '0세대(자료 있음)'이라고 말할 수 있다.
    for (sgg, dong) in sorted(collected | set(plan_d)):
        b = plan_d.get((sgg, dong)) or empty()
        sts = sorted(dong_match.stations_in(sgg, dong, dong2st))
        if not sts:
            continue
        rb = recent_d.get((sgg, dong))
        for name in sts:
            cur = stations.get(name)
            if cur is None:
                stations[name] = {
                    "lawd": sgg, "dong": dong,
                    "sgg": lawd.label_of(sgg) if sgg else "",
                    "cnt": b["cnt"], "hh": b["hh"],
                    "overdue": b["overdue"],
                    "byYear": dict(b["byYear"]), "list": list(b["list"]),
                    "recent": ({"cnt": rb["cnt"], "hh": rb["hh"],
                                "byYear": dict(rb["byYear"])} if rb else None),
                }
                continue
            # 역이 여러 법정동에 걸치면 물량을 더한다. 목록은 큰 것부터 다시.
            cur["cnt"] += b["cnt"]
            cur["hh"] += b["hh"]
            cur["overdue"] += b["overdue"]
            for y, v in b["byYear"].items():
                cur["byYear"][y] = cur["byYear"].get(y, 0) + v
            cur["list"] = sorted(cur["list"] + b["list"],
                                 key=lambda x: -x["h"])[:LIST_MAX]
            cur["byYear"] = dict(sorted(cur["byYear"].items()))
            if rb:
                r0 = cur.get("recent") or {"cnt": 0, "hh": 0, "byYear": {}}
                r0["cnt"] += rb["cnt"]
                r0["hh"] += rb["hh"]
                for y, v in rb["byYear"].items():
                    r0["byYear"][y] = r0["byYear"].get(y, 0) + v
                cur["recent"] = r0

    hit = sum(1 for d in districts if d["stations"])
    print("역이 붙은 법정동 %d곳 / 물량 있는 법정동 %d곳 · 역 %d개"
          % (hit, len(districts), len(stations)))
    print("\n=== 앞으로 들어올 세대가 많은 법정동 ===")
    for d in districts[:12]:
        if not d["stations"]:
            continue
        print("  %-8s %-10s %6d세대 (착공예정 지남 %5d)  %s"
              % (d["sgg"], d["dong"], d["hh"], d["overdue"],
                 ", ".join(d["stations"][:3])))

    payload = {
        "updated": time.strftime("%Y-%m-%d"),
        "source": "국토교통부 건축HUB 주택인허가정보 (공공데이터포털)",
        "basis": "법정동 단위. 대지위치 문자열만 주고 좌표는 주지 않는다.",
        "note": ("'앞으로'는 사용검사를 아직 안 받은 건이다. 착공 여부를 나눠 "
                 "센다 — 미착공은 취소·지연될 수 있다. 역이 여러 법정동에 걸치면 "
                 "같은 건이 두 역에 세어질 수 있다."),
        "thisYear": this_year,
        "districts": districts,
        "stations": stations,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), "utf8")
    kb = OUT.stat().st_size / 1024
    print("\n저장: %s (%.0fKB)" % (OUT.relative_to(ROOT), kb))
    return 0


if __name__ == "__main__":
    sys.exit(main())
