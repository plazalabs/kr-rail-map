"""아파트 전세가율(전세 ÷ 매매)을 '같은 집끼리' 짝지어 역 ID 에 붙인다 → data/station-jeonse.json

왜 짝을 짓나
  법정동 전체 전세 중위 ÷ 매매 중위로 나누면 서로 다른 집을 나누게 된다 — 전세는 소형 구축, 매매는
  대형 신축이 많은 동네면 전세가율이 엉터리로 낮게 나온다. 실무(공인중개사 실무 가이드·전세가율 조회
  서비스)와 민간 분석(빅밸류 '시세매칭 → 단지매칭' 단계)이 공통으로 쓰는 방식대로, 같은 단지·같은 전용면적의
  매매와 전세를 짝지어 그 짝마다 비율을 낸다. (2026-11-11 회장님 지시: "짝 맞추기 규칙" 을 자료 조사로 정함)

짝짓기 규칙
  1. 같은 집: (시군구 코드, 법정동, 지번) 이 같고 전용면적을 1㎡ 단위로 반올림한 값이 같은 매매·전세.
     (단지명은 표기가 흔들려서(띄어쓰기·차수) 열쇠로 쓰지 않고 화면 표시에만 쓴다)
  2. 같은 기간: 둘 다 PERIOD(최근 6개월) 안 — 아파트 시세·실거래 7종과 같은 기간.
  3. 전세 = 월세 0 인 전월세 거래. 계약구분 '갱신' 은 뺀다 — 갱신은 인상 상한(5%)에 묶여 시세보다 낮다.
     계약구분이 비어 있으면(옛 신고) 넣는다. 해제 거래, 토지임대부 매매는 뺀다.
  4. 짝 하나의 비율 = 그 집의 전세 보증금 중위 ÷ 매매가 중위.
  5. 이상치: 비율 150% 초과는 뺀다(빅밸류는 200% 초과 제외 — 우리는 더 엄격히). 세기만 한다.
  6. 역 = 아파트 시세와 같은 연결 규칙(법정동 → 역). 역마다 짝이 가장 많은 법정동을 쓴다.
     짝이 MIN_PAIRS(3) 개 미만이면 비율을 내지 않고 짝 수만 적는다.
  7. 역 값 = 짝 비율들의 중위값. 함께: 짝 수, 80% 이상인 짝 수(깡통전세 위험 기준선), 짝에 쓰인 매매·전세 건수.

사용
  python data/build_station_jeonse.py            # data/_rtms 를 읽어 station-jeonse.json 을 쓴다
  python data/build_station_jeonse.py --selftest # 짝짓기 규칙만 점검 (자료 없이)
"""
import collections
import glob
import json
import pathlib
import statistics
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
RTMS = ROOT / "data" / "_rtms"
OUT = ROOT / "data" / "station-jeonse.json"
PERIOD = ("202604", "202609")
MIN_PAIRS = 3
MAX_RATIO = 1.5
RISK = 0.8


def month_files(folder):
    """'<시군구>_<YYYYMM>.json' 달 파일만 (기간 합본 '<시군구>_<시작>_<끝>.json' 은 두 번 세므로 뺀다)."""
    for f in sorted(glob.glob(str(folder / "*_??????.json"))):
        parts = pathlib.Path(f).stem.split("_")
        if len(parts) != 2:
            continue
        code, ym = parts
        if PERIOD[0] <= ym <= PERIOD[1]:
            yield code, f


def home_key(code, r):
    if not r.get("umd") or not r.get("jibun") or not r.get("area"):
        return None
    return (code, r["umd"], str(r["jibun"]).strip(), int(round(float(r["area"]))))


def pair_up(sales, rents):
    """sales: {key: [매매가]}, rents: {key: [전세 보증금]} → 짝 목록 [(key, 비율, 매매건수, 전세건수)], 뺀 짝 수."""
    pairs, outliers = [], 0
    for k in sales.keys() & rents.keys():
        s, j = statistics.median(sales[k]), statistics.median(rents[k])
        if s <= 0:
            continue
        r = j / s
        if r > MAX_RATIO:
            outliers += 1
            continue
        pairs.append((k, r, len(sales[k]), len(rents[k])))
    return pairs, outliers


def summarize(pairs):
    n = len(pairs)
    out = {"n": n}
    if n < MIN_PAIRS:
        out["few"] = True
        return out
    rs = [p[1] for p in pairs]
    out["r"] = round(statistics.median(rs), 3)
    out["hi"] = sum(1 for x in rs if x >= RISK)             # 80% 이상 짝 수
    out["sn"] = sum(p[2] for p in pairs)                    # 짝에 쓰인 매매 건수
    out["jn"] = sum(p[3] for p in pairs)                    # 짝에 쓰인 전세 건수
    return out


def load():
    sales, rents = collections.defaultdict(list), collections.defaultdict(list)
    names = {}
    cnt = collections.Counter()
    for code, f in month_files(RTMS):
        for r in json.loads(pathlib.Path(f).read_text("utf8")):
            if r.get("cancelled"):
                cnt["매매 해제"] += 1; continue
            if r.get("landLease"):
                cnt["토지임대부"] += 1; continue
            k = home_key(code, r)
            if not k or not r.get("price"):
                cnt["매매 열쇠·금액 없음"] += 1; continue
            sales[k].append(float(r["price"]))
            names.setdefault(k[:3], r.get("apt") or "")
            cnt["매매"] += 1
    for code, f in month_files(RTMS / "apt-rent"):
        for r in json.loads(pathlib.Path(f).read_text("utf8")):
            if r.get("cancelled"):
                cnt["전월세 해제"] += 1; continue
            if r.get("monthlyRent"):
                cnt["월세"] += 1; continue
            if (r.get("contractType") or "").strip() == "갱신":
                cnt["전세 갱신(뺌)"] += 1; continue
            k = home_key(code, r)
            if not k or not r.get("deposit"):
                cnt["전세 열쇠·금액 없음"] += 1; continue
            rents[k].append(float(r["deposit"]))
            names.setdefault(k[:3], r.get("name") or "")
            cnt["전세(신규·미표기)"] += 1
    return sales, rents, names, cnt


def build():
    import dong_match
    import lawd
    from build_station_market import station_index
    dong2st = station_index()
    sgg_label = {c: lawd.label_of(c) for c in lawd.codes()}
    sales, rents, names, cnt = load()
    pairs, outliers = pair_up(sales, rents)
    by_dong = collections.defaultdict(list)
    for p in pairs:
        by_dong[(p[0][0], p[0][1])].append(p)
    best = {}
    linked = unlinked = 0
    for key, ps in by_dong.items():
        sids = dong_match.stations_in(key[0], key[1], dong2st)
        if not sids:
            unlinked += len(ps); continue
        linked += len(ps)
        for sid in sids:
            if sid not in best or len(ps) > best[sid][0]:
                best[sid] = (len(ps), key)
    stations = {}
    for sid, (_n, key) in best.items():
        s = summarize(by_dong[key])
        s["d"] = key[1]
        s["sgg"] = sgg_label.get(key[0], key[0])
        stations[sid] = s
    shown = sum(1 for s in stations.values() if "r" in s)
    allr = [p[1] for p in pairs]
    report = {
        "counts": dict(cnt), "homes_sale": len(sales), "homes_jeonse": len(rents),
        "pairs": len(pairs), "outliers_over_150": outliers, "pairs_linked": linked, "pairs_unlinked": unlinked,
        "stations": len(stations), "stations_with_ratio": shown,
        "pair_ratio_median": round(statistics.median(allr), 3) if allr else None,
    }
    payload = {
        "period": [f"{PERIOD[0][:4]}-{PERIOD[0][4:]}", f"{PERIOD[1][:4]}-{PERIOD[1][4:]}"],
        "source": "국토교통부 아파트 매매·전월세 실거래가 (공공데이터포털 오픈API)",
        "method": "같은 단지(시군구·법정동·지번)·같은 전용면적(1㎡ 반올림) 매매와 전세(신규, 월세 0)를 짝지어 "
                  "짝마다 전세 중위 ÷ 매매 중위. 역 값은 그 법정동 짝들의 중위값. 짝 3개 미만은 비율 없음. "
                  "150% 초과 짝은 이상치로 뺌. hi = 80% 이상 짝 수.",
        "minPairs": MIN_PAIRS, "risk": RISK,
        "keyed_by": "station_id",
        "report": report,
        "stations": stations,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), "utf8")
    print(json.dumps(report, ensure_ascii=False, indent=1))
    print(f"저장: {OUT.relative_to(ROOT)} · 역 {len(stations)}곳 (비율 있음 {shown}) · {OUT.stat().st_size / 1024:.0f}KB")
    return 0


def selftest():
    ok = bad = 0

    def ck(name, cond, detail=""):
        nonlocal ok, bad
        ok, bad = (ok + 1, bad) if cond else (ok, bad + 1)
        print(("  ✓ " if cond else "  ✗ ") + name + (f"  [{detail}]" if detail and not cond else ""))

    a = ("11680", "역삼동", "100", 85)
    b = ("11680", "역삼동", "100", 60)
    ck("열쇠: 전용 84.6㎡ 와 85.4㎡ 는 같은 집(85)", home_key("11680", {"umd": "역삼동", "jibun": "100", "area": 84.6}) == a
       and home_key("11680", {"umd": "역삼동", "jibun": "100 ", "area": 85.4}) == a)
    ck("열쇠: 지번 없으면 짝 못 지음", home_key("11680", {"umd": "역삼동", "jibun": "", "area": 85}) is None)
    sales = {a: [100000, 120000, 110000], b: [60000]}
    rents = {a: [66000, 70000], ("11680", "역삼동", "200", 85): [50000]}
    ps, out = pair_up(sales, rents)
    ck("같은 집만 짝: 85㎡ 한 쌍 (60㎡ 는 전세 없음, 200번지는 매매 없음)", len(ps) == 1 and ps[0][0] == a, ps)
    ck("짝 비율 = 전세 중위 68,000 ÷ 매매 중위 110,000 = 0.618", abs(ps[0][1] - 68000 / 110000) < 1e-9, ps)
    ps2, out2 = pair_up({a: [10000]}, {a: [20000]})
    ck("150% 초과(200%) 짝은 이상치로 뺌", not ps2 and out2 == 1)
    s = summarize([(a, 0.5, 1, 1), (b, 0.9, 1, 1)])
    ck("짝 2개(<3) → 비율 없음, 짝 수만", s.get("few") and "r" not in s and s["n"] == 2, s)
    s = summarize([(a, 0.5, 2, 1), (b, 0.9, 1, 3), (a, 0.6, 1, 1)])
    ck("짝 3개 → 중위 0.6, 80% 이상 1쌍, 매매 4·전세 5건", s["r"] == 0.6 and s["hi"] == 1 and s["sn"] == 4 and s["jn"] == 5, s)
    print(f"\n결과: {ok} 통과 / {bad} 실패")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(selftest() if "--selftest" in sys.argv else build())
