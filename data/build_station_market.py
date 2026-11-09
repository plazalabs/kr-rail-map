"""실거래 1단계 7종을 법정동으로 묶어 역 ID 에 붙인다 → data/station-market.json

연결 규칙은 아파트 매매 시세(build_station_price.py)와 **똑같다** (2026-11-09 회장님 결정: 규칙 재사용).
  (시군구 코드 5자리, 법정동 이름) → data/_station_dong.json(국가철도공단 주소) → station_ids.Index → 역 ID
  좌표로 바꾸지 않는다(실거래엔 좌표가 없고 지오코더는 좌표 저장 금지). 역 이름도 쓰지 않는다(동명역 문제).

원칙 (지어내기 금지)
  - 역에 붙일 근거가 없는 거래는 버리지 않고 세기만 한다 → 'unlinked'. 화면에선 그 역 = 자료 없음(항목이 아예 없음).
  - 법정동 거래가 MIN_DEALS(5) 건 미만이면 중위값을 내지 않는다 → few: true, 건수만. 화면은 '거래 적음 (N건)'.
  - 해제 거래(cdealType 'O')·가격 없는 거래는 뺀다.
  - 지분거래(토지·상업업무용 shareDealingType '지분')는 일부만 산 값이라 단가·중위가에서 빼고 건수만 센다.
  - 수익률(월세 ÷ 집값)은 계산하지 않는다 — 같은 단지·평형 짝 맞추기가 필요한 2단계 과제 (2026-11-09 결정).

역 하나가 여러 법정동에 걸치면(주소 행이 여럿) 종류마다 거래가 가장 많은 법정동을 쓴다 — 시세와 같은 방식.
그래서 종류마다 법정동이 다를 수 있고, 화면에 법정동 이름을 같이 적는다.

사용
  python data/build_station_market.py            # data/_rtms/<종류>/ 를 읽어 station-market.json 을 쓴다
  python data/build_station_market.py --selftest # 키·캐시 없이 집계 규칙만 점검
"""
import collections
import glob
import json
import pathlib
import statistics
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
DONG = ROOT / "data" / "_station_dong.json"
RTMS = ROOT / "data" / "_rtms"
OUT = ROOT / "data" / "station-market.json"
MIN_DEALS = 5
PERIOD = ("202604", "202609")   # 아파트 매매 시세와 같은 기간 — 비교가 되게

import fetch_rtms  # noqa: E402  (KINDS 표 한 곳)

KINDS = fetch_rtms.NEW7


def med(xs, nd=0):
    xs = [x for x in xs if x is not None]
    if not xs:
        return None
    v = statistics.median(xs)
    return round(v, nd) if nd else round(v)


def top(counter, n=3):
    return [[k, c] for k, c in counter.most_common(n) if k]


def summarize(kind, rows):
    """한 법정동·한 종류의 거래 → 화면용 숫자. rows 는 해제·가격없음을 이미 뺀 것."""
    n = len(rows)
    out = {"n": n}
    if kind.endswith("-rent"):
        jeonse = [r for r in rows if not r["monthlyRent"]]
        wolse = [r for r in rows if r["monthlyRent"]]
        out["jn"], out["wn"] = len(jeonse), len(wolse)
        if len(jeonse) >= MIN_DEALS:
            out["jd"] = med([r["deposit"] for r in jeonse])          # 전세 보증금 중위 (만원)
        if len(wolse) >= MIN_DEALS:
            out["wd"] = med([r["deposit"] for r in wolse])           # 월세 보증금 중위
            out["wr"] = med([r["monthlyRent"] for r in wolse])       # 월세 중위 (만원/월)
        if n < MIN_DEALS:
            out["few"] = True
        return out
    whole = [r for r in rows if not r.get("share")]
    out["sh"] = n - len(whole)                                        # 지분거래 건수 (단가에서 뺌)
    if kind == "land-trade":
        # 토지는 대지(지목 '대')만 쓴다 — 2026-11-09 회장님 결정(나안). 도로·전·답·임야가 섞이면
        # ㎡당 중위값이 끌려 내려간다(강남 역삼동 121만/㎡, 17건 중 도로 11). 지목별로 나눠 보여 주지 않는다.
        land_all = whole
        whole = [r for r in land_all if r.get("jimok") == "대"]
        out["ex"] = len(land_all) - len(whole)                        # 도로 등 대지 아닌 거래 (뺀 건수)
    out["n"] = len(whole)
    if len(whole) < MIN_DEALS:
        out["few"] = True
    else:
        out["med"] = med([r["price"] for r in whole])                 # 중위 거래금액 (만원)
        if kind == "land-trade":
            out["m2"] = med([r["perM2"] for r in whole], 1)           # ㎡당 중위 (만원/㎡)
        else:
            out["pp"] = med([r["perPyeong"] for r in whole], 1)       # 평당 중위 (만원/평)
    if kind == "nrg-trade":
        out["top"] = top(collections.Counter(r.get("buildingUse") for r in whole))
    if kind == "silv-trade":
        out["own"] = dict(collections.Counter(r.get("ownership") or "?" for r in whole))
    return out


def load_deals(kind):
    """data/_rtms/<kind>/<시군구>_<달>.json → 쓸 수 있는 거래만."""
    deals, dropped = [], collections.Counter()
    for f in sorted(glob.glob(str(RTMS / kind / "*_??????.json"))):
        name = pathlib.Path(f).stem
        parts = name.split("_")
        # '11680_202604_202609.json'(기간 합본)도 이 패턴에 걸린다 — 달 파일만 읽어야 두 번 세지 않는다
        if len(parts) != 2:
            continue
        code, ym = parts
        if not (PERIOD[0] <= ym <= PERIOD[1]):
            continue
        for r in json.loads(pathlib.Path(f).read_text("utf8")):
            if r.get("cancelled"):
                dropped["해제"] += 1
                continue
            if kind.endswith("-rent"):
                # 보증금 0원 + 월세는 정상 거래다 (2026-11-09 수집에서 아파트 584건) — 둘 다 없을 때만 뺀다
                money = r.get("deposit") is not None and (r.get("deposit") or r.get("monthlyRent"))
            else:
                money = r.get("price")
            if not money:
                dropped["금액 없음"] += 1
                continue
            if not r.get("umd"):
                dropped["법정동 없음"] += 1
                continue
            r["lawd"] = code
            deals.append(r)
    return deals, dropped


def station_index():
    """(시군구코드, 법정동) → {역 ID}. build_station_price.py 와 같은 규칙."""
    import station_ids
    stations = json.loads(DONG.read_text("utf8"))
    ix = station_ids.Index()
    dong2st = {}
    for s in stations:
        if not s["dong"] or not s.get("lawd"):
            continue
        ids = ix.ids_of_row(s)
        if ids:
            dong2st.setdefault((s["lawd"], s["dong"]), set()).update(ids)
    return dong2st


def build():
    import dong_match
    import lawd
    if not DONG.exists():
        raise SystemExit("data/_station_dong.json 이 없습니다. build_station_dong.py 를 먼저 실행하세요.")
    dong2st = station_index()
    sgg_label = {c: lawd.label_of(c) for c in lawd.codes()}
    stations = {}          # 역 ID → {kind: {...}}
    report = {}
    months = set()
    for kind in KINDS:
        deals, dropped = load_deals(kind)
        by_dong = collections.defaultdict(list)
        for r in deals:
            by_dong[(r["lawd"], r["umd"])].append(r)
            months.add(f"{r['year']}-{r['month']:02d}")
        linked = unlinked = 0
        best = {}          # 역 ID → (건수, 법정동 키)
        for key, rows in by_dong.items():
            sids = dong_match.stations_in(key[0], key[1], dong2st)
            if not sids:
                unlinked += len(rows)
                continue
            linked += len(rows)
            for sid in sids:
                if sid not in best or len(rows) > best[sid][0]:
                    best[sid] = (len(rows), key)
        few = 0
        for sid, (_n, key) in best.items():
            s = summarize(kind, by_dong[key])
            s["d"] = key[1]
            s["sgg"] = sgg_label.get(key[0], key[0])
            few += 1 if s.get("few") else 0
            stations.setdefault(sid, {})[kind] = s
        report[kind] = {"deals": len(deals), "linked": linked, "unlinked": unlinked,
                        "dropped": dict(dropped), "stations": len(best), "fewStations": few,
                        "dongs": len(by_dong)}
        print(f"{kind:11} 거래 {len(deals):>7,} · 역 연결 {linked:>7,} · 연결 근거 없음 {unlinked:>6,} · "
              f"역 {len(best):>4} (거래 적음 {few}) · 뺀 것 {dict(dropped)}")
    payload = {
        "updated": max(months) if months else None,
        "period": [f"{PERIOD[0][:4]}-{PERIOD[0][4:]}", f"{PERIOD[1][:4]}-{PERIOD[1][4:]}"],
        "source": "국토교통부 실거래가 7종 (공공데이터포털 오픈API)",
        "note": "법정동 단위 집계. 거래 5건 미만은 중위값 없이 건수만. 지분거래는 단가에서 뺌. "
                "최근 1~2개월은 신고 지연으로 건수가 적다. 수익률은 계산하지 않음.",
        "minDeals": MIN_DEALS,
        "kinds": {k: {"label": fetch_rtms.KINDS[k][1], "service": fetch_rtms.KINDS[k][0]} for k in KINDS},
        "keyed_by": "station_id",
        "report": report,
        "stations": stations,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), "utf8")
    print(f"\n저장: {OUT.relative_to(ROOT)} · 역 {len(stations)}곳 · {OUT.stat().st_size / 1024:.0f}KB")
    return 0


def selftest():
    ok = bad = 0

    def ck(name, cond, detail=""):
        nonlocal ok, bad
        ok, bad = (ok + 1, bad) if cond else (ok, bad + 1)
        print(("  ✓ " if cond else "  ✗ ") + name + (f"  [{detail}]" if detail and not cond else ""))

    print("[집계 규칙]")
    rent = [{"deposit": d, "monthlyRent": m} for d, m in
            [(30000, 0), (32000, 0), (31000, 0), (29000, 0), (35000, 0), (1000, 100), (2000, 120)]]
    s = summarize("apt-rent", rent)
    ck("전월세: 전세 5건 → 전세 중위 31,000", s.get("jd") == 31000 and s["jn"] == 5, s)
    ck("전월세: 월세 2건(<5) → 월세 중위 없음", "wr" not in s and s["wn"] == 2, s)
    ck("전월세: 전체 7건이면 거래 적음 아님", not s.get("few"))
    s = summarize("offi-trade", [{"price": 10000, "perPyeong": 1000}] * 4)
    ck("매매 4건 → 거래 적음, 중위값 없음", s.get("few") and "med" not in s and s["n"] == 4, s)
    land = [{"price": 1000, "perM2": 100.0, "share": False, "jimok": "대"}] * 5 + \
           [{"price": 50, "perM2": 5.0, "share": True, "jimok": "도로"}] * 3
    s = summarize("land-trade", land)
    ck("토지: 지분 3건은 단가에서 빠지고 따로 셈", s["sh"] == 3 and s["n"] == 5 and s["m2"] == 100.0, s)
    ck("토지: 지목별 분리 표시 없음 (결정 나안)", "top" not in s, s)
    s = summarize("land-trade", land[:4] + land[5:])
    ck("토지: 지분 빼고 4건 → 거래 적음", s.get("few") and s["n"] == 4 and "m2" not in s, s)
    mixed = [{"price": 1000, "perM2": 1000.0, "share": False, "jimok": "대"}] * 5 + \
            [{"price": 10, "perM2": 1.0, "share": False, "jimok": "도로"}] * 11
    s = summarize("land-trade", mixed)
    ck("토지: 대지만 — 도로 11건이 섞여도 ㎡당 1,000 (도로 등 제외 11)", s["m2"] == 1000.0 and s["n"] == 5 and s["ex"] == 11, s)
    s = summarize("land-trade", mixed[1:])
    ck("토지: 대지 4건 + 도로 11건 → 거래 적음 (대지 기준)", s.get("few") and s["n"] == 4 and s["ex"] == 11, s)
    s = summarize("nrg-trade", [{"price": p, "perPyeong": 1, "share": False, "buildingUse": u}
                                for p, u in [(1, "근생"), (2, "근생"), (3, "업무"), (4, "근생"), (5, "판매")]])
    ck("상업업무용: 중위 3 · 용도 상위 근생 3건", s["med"] == 3 and s["top"][0] == ["근생", 3], s)
    ck("수익률 필드 없음 (1단계 결정)", not any(k in json.dumps(s) for k in ("yield", "수익률")))
    print(f"\n결과: {ok} 통과 / {bad} 실패")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(selftest() if "--selftest" in sys.argv else build())
