"""주택인허가 건을 법정동으로 묶어 역에 붙인다 — '앞으로 들어올 세대'.

    python data/build_station_dev.py --selftest   # 받은 자료 없이 검증
    python data/build_station_dev.py              # data/station-dev.json 생성

무엇을 세는가
  건축HUB 주택인허가(getHpBasisOulnInfo)는 주택건설사업계획 승인 건마다
  세대수와 착공·사용검사 일자를 준다. 그중 **아직 사용검사(준공)를 안 받은
  건**이 '앞으로 들어올 물량'이다.

  착공 여부를 따로 센다. 이게 이 자료의 핵심이다.
    st  있음  = 이미 착공  → 공급이 확정적이다
    st  없음  = 미착공     → 인허가만 받은 상태. 취소·지연될 수 있다
  둘을 합쳐 '1,200세대 들어옵니다'라고 하면 실제보다 낙관적으로 읽힌다.
  그래서 started / planned 를 나눠서 낸다.

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
# 번지 토큰: 123, 123-4, 산12, 산12-3
_BUNJI = re.compile(r"^산?\d+(-\d+)?$")


def dong_of(addr):
    """대지위치 문자열 → 법정동 이름. 못 뽑으면 ''.

    역 주소데이터의 법정동 표기와 같은 모양으로 맞춘다
    ('화도읍 마석우리' 처럼 읍면 + 리 를 붙여 쓴다).

    번지 뒤에 '외 2필지' 가 붙는 줄이 흔하다. 번지에서 끊지 않으면
    '역삼동 123-4 외 2필지' 가 법정동 이름이 되어 아무 역에도 안 붙는다.
    """
    toks = str(addr or "").split()
    if len(toks) < 2:
        return ""
    for i in range(1, len(toks)):
        t = toks[i]
        if t.endswith(("시", "구", "군")):
            continue
        if t.endswith(_DONG_END):
            seg = []
            for t2 in toks[i:]:
                if _BUNJI.match(t2):
                    break
                seg.append(t2)
            return " ".join(seg)
    # 읍면동 토큰이 아예 없으면 포기한다. 마지막 토큰을 쓰면 '123-4' 같은
    # 번지가 법정동 이름이 되어 엉뚱한 곳에 붙는다. 부르는 쪽이 법정동코드
    # 표로 대신한다.
    return ""


def bjd_table():
    """(시군구 5자리, 법정동 5자리) → 법정동 이름.

    대지위치가 비어 있거나 이상하게 적힌 줄을 건지기 위한 보조 표다.
    K-apt 단지 목록에 10자리 법정동코드와 동 이름이 같이 있어서 만들 수 있다.
    """
    if not KAPT.exists():
        return {}
    out = {}
    for c in json.loads(KAPT.read_text("utf8")):
        b = c.get("bjd") or ""
        if len(b) == 10 and c.get("as3"):
            out.setdefault((b[:5], b[5:]), c["as3"])
    return out


# ---------------------------------------------------------------- 집계

def empty():
    return {"cnt": 0, "hh": 0, "started": 0, "planned": 0,
            "cntStarted": 0, "cntPlanned": 0, "byYear": {}, "list": []}


def add(bucket, rec):
    """한 건을 묶음에 더한다."""
    h = rec.get("h") or 0
    if h <= 0:
        return
    bucket["cnt"] += 1
    bucket["hh"] += h
    if rec.get("st"):
        bucket["started"] += h
        bucket["cntStarted"] += 1
    else:
        bucket["planned"] += h
        bucket["cntPlanned"] += 1
    y = rec.get("y")
    if y:
        bucket["byYear"][str(y)] = bucket["byYear"].get(str(y), 0) + h
    bucket["list"].append({"n": rec.get("n") or "", "h": h, "y": y,
                           "st": rec.get("st"), "dn": rec.get("dn")})


def finish(bucket):
    """목록을 세대수 순으로 줄이고 연도를 정렬한다."""
    bucket["list"].sort(key=lambda x: (-x["h"], x["y"] or 9999))
    bucket["list"] = bucket["list"][:LIST_MAX]
    bucket["byYear"] = dict(sorted(bucket["byYear"].items()))
    return bucket


def split(rows, this_year):
    """받은 전체 행 → (앞으로 들어올 것, 최근에 들어온 것).

    앞으로: 사용검사(준공)를 아직 안 받은 건. dn 이 없다.
    최근:   준공일이 이번 해 기준 RECENT_YEARS 안에 있는 건.
    그보다 오래된 준공은 '공급'이 아니라 이미 시세에 반영된 과거다. 뺀다.
    """
    plan, recent = [], []
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
        plan.append(r)
    return plan, recent


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
        ("", ""),
    ]
    for addr, want in cases:
        got = dong_of(addr)
        chk("대지위치 '%s' → %s" % (addr or "(빈값)", want), got == want, got)

    # --- 나눠 세기
    rows = [
        {"h": 500, "st": "2025-01-02", "dn": None, "y": 2027, "n": "가"},   # 착공
        {"h": 300, "st": None, "dn": None, "y": 2028, "n": "나"},           # 미착공
        {"h": 200, "st": "2020-05-01", "dn": "2023-06-30", "y": 2023, "n": "다"},  # 최근 준공
        {"h": 100, "st": "2010-01-01", "dn": "2012-12-31", "y": 2012, "n": "라"},  # 옛날 준공
        {"h": 0, "st": None, "dn": None, "y": 2029, "n": "마"},             # 세대수 0
    ]
    plan, recent = split(rows, 2026)
    chk("미준공만 '앞으로'로 센다", len(plan) == 2, len(plan))
    chk("오래된 준공은 뺀다", [r["n"] for r in recent] == ["다"], [r["n"] for r in recent])

    b = empty()
    for r in plan:
        add(b, r)
    finish(b)
    chk("총 세대수", b["hh"] == 800, b["hh"])
    chk("착공 세대수", b["started"] == 500, b["started"])
    chk("미착공 세대수", b["planned"] == 300, b["planned"])
    chk("착공/미착공 합이 총계와 같다", b["started"] + b["planned"] == b["hh"])
    chk("건수도 나눠 센다", b["cntStarted"] == 1 and b["cntPlanned"] == 1,
        (b["cntStarted"], b["cntPlanned"]))
    chk("연도별로 쌓는다", b["byYear"] == {"2027": 500, "2028": 300}, b["byYear"])
    chk("목록은 세대수 큰 것부터", [x["n"] for x in b["list"]] == ["가", "나"],
        [x["n"] for x in b["list"]])

    # --- 목록 길이 제한
    b2 = empty()
    for i in range(10):
        add(b2, {"h": i + 1, "n": "x%d" % i, "y": 2030})
    finish(b2)
    chk("목록은 LIST_MAX 개까지만", len(b2["list"]) == LIST_MAX, len(b2["list"]))
    chk("잘라도 총계는 그대로", b2["hh"] == 55, b2["hh"])

    # --- 이름이 비어도 세대수는 잃지 않는다
    b3 = empty()
    add(b3, {"h": 40, "n": "", "y": 2031})
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

    import dong_match                                    # noqa: E402
    import station_names                                 # noqa: E402

    # 역 → (시군구, 법정동). 시세 파이프라인과 같은 표를 쓴다.
    dong2st = {}
    for s in json.loads(DONG.read_text("utf8")):
        if not s.get("dong") or not s.get("lawd"):
            continue
        names = station_names.resolve_all(s["name"])
        if names:
            dong2st.setdefault((s["lawd"], s["dong"]), set()).update(names)

    tab = bjd_table()
    this_year = time.localtime().tm_year

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

    plan, recent = split(rows, this_year)
    print("받은 %d건 → 앞으로 들어올 %d건 / 최근 %d년 준공 %d건 (법정동 못 뽑음 %d건)"
          % (len(rows), len(plan), RECENT_YEARS, len(recent), no_dong))

    def group(subset):
        out = {}
        for r in subset:
            dong = r.get("dong") or dong_of(r.get("a"))
            if not dong:
                dong = tab.get((r.get("sgg") or "", r.get("bjd") or ""), "")
            if not dong:
                continue
            add(out.setdefault((r.get("sgg") or "", dong), empty()), r)
        return {k: finish(v) for k, v in out.items()}

    plan_d = group(plan)
    recent_d = group(recent)

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
            "started": b["started"], "planned": b["planned"],
            "byYear": b["byYear"], "list": b["list"],
            "stations": sts,
        }
        rb = recent_d.get((sgg, dong))
        if rb:
            rec["recent"] = {"cnt": rb["cnt"], "hh": rb["hh"], "byYear": rb["byYear"]}
        districts.append(rec)

        for name in sts:
            cur = stations.get(name)
            if cur is None:
                stations[name] = {
                    "lawd": sgg, "sgg": rec["sgg"], "dong": dong,
                    "cnt": b["cnt"], "hh": b["hh"],
                    "started": b["started"], "planned": b["planned"],
                    "byYear": b["byYear"], "list": list(b["list"]),
                    "recent": rec.get("recent"),
                }
                continue
            # 역이 여러 법정동에 걸치면 물량을 더한다. 목록은 큰 것부터 다시.
            cur["cnt"] += b["cnt"]
            cur["hh"] += b["hh"]
            cur["started"] += b["started"]
            cur["planned"] += b["planned"]
            for y, v in b["byYear"].items():
                cur["byYear"][y] = cur["byYear"].get(y, 0) + v
            cur["list"] = sorted(cur["list"] + b["list"],
                                 key=lambda x: -x["h"])[:LIST_MAX]
            cur["byYear"] = dict(sorted(cur["byYear"].items()))
            if rec.get("recent"):
                r0 = cur.get("recent") or {"cnt": 0, "hh": 0, "byYear": {}}
                r0["cnt"] += rec["recent"]["cnt"]
                r0["hh"] += rec["recent"]["hh"]
                for y, v in rec["recent"]["byYear"].items():
                    r0["byYear"][y] = r0["byYear"].get(y, 0) + v
                cur["recent"] = r0

    hit = sum(1 for d in districts if d["stations"])
    print("역이 붙은 법정동 %d곳 / 전체 %d곳 · 역 %d개"
          % (hit, len(districts), len(stations)))
    print("\n=== 앞으로 들어올 세대가 많은 법정동 ===")
    for d in districts[:12]:
        if not d["stations"]:
            continue
        print("  %-8s %-10s %6d세대 (착공 %5d / 미착공 %5d)  %s"
              % (d["sgg"], d["dong"], d["hh"], d["started"], d["planned"],
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
