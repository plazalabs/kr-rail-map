"""실거래가를 **단지**로 묶는다. 법정동 중위값 하나로는 판단이 안 된다.

지금까지는 법정동 하나에 평당가 하나만 줬다. 그런데 같은 잠실동에서도
1979년 준공 5층과 2008년 준공 33층이 같은 값을 받을 리 없다. 역세권을
보고 투자하려는 사람에게 '잠실동 평당 4,000만원'은 아무 정보가 아니다.

실거래가 응답에는 단지명·지번·건축년도·층·전용면적이 다 들어 있다.
좌표만 없다. 그래서 좌표 대신 **단지 단위로 다시 묶고**, 평형대별로
나눠서 보여준다.

한계는 그대로다.
  단지의 좌표가 없으니 '이 단지가 역에서 300m'는 못 준다.
  역이 속한 법정동의 단지 목록까지가 우리가 말할 수 있는 범위다.
  있는 척하지 않으려고 화면에도 '법정동 기준'이라고 적는다.

집계 규칙
  - 계약해제·가격없음은 뺀다. 예전에 이 둘을 같이 세서 121건이 전부
    해제로 보고된 적이 있다.
  - 단지 1건짜리는 목록에서 뺀다. 한 건으로 평당가를 말하면 그건 그
    거래의 층·수리 상태이지 단지 시세가 아니다. 개수는 따로 센다.
  - 평형대는 전용면적 15㎡ 폭으로 끊는다. 59㎡·84㎡ 같은 국민 평형이
    경계에 걸리지 않게 5㎡ 단위로 맞춘다.
"""
import glob
import json
import pathlib
import re
import statistics
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DONG = ROOT / "data" / "_station_dong.json"
RTMS = ROOT / "data" / "_rtms"
OUT = ROOT / "data" / "station-complex.json"

# 단지 하나를 목록에 올리려면 최소 이만큼의 거래가 필요하다
MIN_DEALS = 2

# 평형대 경계(전용면적 m²). 위에서부터 내려오며 첫 경계에 넣는다.
BANDS = [45, 60, 72, 85, 100, 120, 140]


def band_label(area):
    """전용면적 → '60~72㎡' 같은 구간 이름. 평형이 아니라 면적으로 적는다.

    '24평형'은 전용 59㎡를 말할 때도 있고 공급 59㎡를 말할 때도 있다.
    부동산에서 관행적으로 쓰지만, 실거래가의 면적은 전용면적이므로
    평형으로 바꿔 적으면 오해를 만든다. 숫자를 그대로 보여준다.
    """
    if not area:
        return None
    prev = None
    for b in BANDS:
        if area < b:
            return ("~%d㎡" % b) if prev is None else ("%d~%d㎡" % (prev, b))
        prev = b
    return "%d㎡~" % BANDS[-1]


def load_sgg_name():
    sys.path.insert(0, str(ROOT / "data"))
    from fetch_rtms import SGG  # noqa: E402
    return {v: k for k, v in SGG.items()}


def norm_name(n):
    """'잠실(송파구청)' → '잠실'. 공식 주소데이터가 붙이는 부기를 뗀다."""
    return re.sub(r"\s*\(.*?\)\s*", "", n).strip()


def collect_deals(sgg_name):
    """범위 파일(_YYYYMM_YYYYMM)만 읽는다.

    구 단위 월별 파일과 범위 파일이 같이 있으면 같은 거래가 두 번 들어간다.
    범위 파일이 6개월치를 전부 담고 있으므로 이쪽만 쓴다.
    """
    deals = []
    seen_file = 0
    for f in sorted(glob.glob(str(RTMS / "*_*_*.json"))):
        name = pathlib.Path(f).name
        code = name.split("_")[0]
        if not code.isdigit():
            continue
        seen_file += 1
        sgg = sgg_name.get(code, "")
        for r in json.loads(pathlib.Path(f).read_text("utf8")):
            if r.get("cancelled") or not r.get("price") or not r.get("umd"):
                continue
            if not r.get("apt"):
                continue
            r["sgg"] = sgg
            deals.append(r)
    return deals, seen_file


def build_complexes(rows):
    """같은 단지의 거래를 묶어 요약한다."""
    bands = {}
    for r in rows:
        lbl = band_label(r.get("area"))
        if not lbl:
            continue
        bands.setdefault(lbl, []).append(r)

    def med(vals):
        vals = [v for v in vals if v]
        return round(statistics.median(vals), 1) if vals else None

    years = [r["buildYear"] for r in rows if r.get("buildYear")]
    out_bands = []
    for lbl in sorted(bands, key=lambda b: BANDS.index(int(re.match(r"(\d+)", b).group(1)))
                      if re.match(r"(\d+)", b) else 99):
        rs = bands[lbl]
        out_bands.append({
            "b": lbl,
            "n": len(rs),
            "pp": med([x.get("perPyeong") for x in rs]),
            "p": med([x.get("price") for x in rs]),
            "a": med([x.get("area") for x in rs]),
        })

    return {
        "n": rows[0]["apt"],
        "j": rows[0].get("jibun", ""),
        "y": int(statistics.median(years)) if years else 0,
        "n_deals": len(rows),
        "pp": med([r.get("perPyeong") for r in rows]),
        "p": med([r.get("price") for r in rows]),
        "a": med([r.get("area") for r in rows]),
        "fl": med([r.get("floor") for r in rows if r.get("floor")]),
        "bands": out_bands,
    }


def main():
    if not DONG.exists():
        raise SystemExit("data/_station_dong.json 이 없습니다. build_station_dong.py 를 먼저 실행하세요.")

    sgg_name = load_sgg_name()
    stations = json.loads(DONG.read_text("utf8"))

    # 공식 주소데이터는 '서울역'·'총신대입구' 처럼 부르고, 지도는 '서울'·'이수'
    # 라고 부른다. 이걸 안 맞추면 그 역은 시세가 통째로 사라진다.
    import station_names  # noqa: E402  (같은 폴더)

    dong2st = {}
    unmatched = set()
    for s in stations:
        if not s["dong"]:
            continue
        # resolve_all 을 쓴다. 이수역처럼 같은 역이 지도에 두 이름으로 들어
        # 있는 경우가 있어, 한쪽만 고르면 나머지 한쪽은 시세가 안 뜬다.
        names = station_names.resolve_all(s["name"])
        if not names:
            unmatched.add(s["name"])
            continue
        dong2st.setdefault((s["sgg"], s["dong"]), set()).update(names)
    if unmatched:
        print("이름을 못 맞춘 역 %d곳: %s" % (len(unmatched), ", ".join(sorted(unmatched)[:8])))

    deals, nfiles = collect_deals(sgg_name)
    print("실거래 %d건 · 파일 %d개 (해제·가격없음·단지명없음 제외)" % (len(deals), nfiles))
    if not deals:
        print("받은 데이터가 없습니다. fetch_rtms.py 로 먼저 받으세요.")
        return 1

    # (구, 법정동) → (단지명, 지번) → 거래들
    grouped = {}
    for r in deals:
        grouped.setdefault((r["sgg"], r["umd"]), {}).setdefault(
            (r["apt"], r.get("jibun", "")), []).append(r)

    districts = {}
    total_cx = 0
    kept = 0
    for (sgg, umd), by_cx in grouped.items():
        rows_all = [x for rs in by_cx.values() for x in rs]
        cxs = []
        for _, rs in by_cx.items():
            if len(rs) < MIN_DEALS:
                continue
            cxs.append(build_complexes(rs))
        cxs.sort(key=lambda c: -(c["pp"] or 0))
        total_cx += len(by_cx)
        kept += len(cxs)
        pers = [x.get("perPyeong") for x in rows_all if x.get("perPyeong")]
        prices = [x.get("price") for x in rows_all if x.get("price")]
        districts["%s|%s" % (sgg, umd)] = {
            "deals": len(rows_all),
            "pp": round(statistics.median(pers), 1) if pers else None,
            "p": round(statistics.median(prices), 0) if prices else None,
            "cx": len(by_cx),
            "complexes": cxs,
        }

    st_map = {}
    for key, st_names in dong2st.items():
        dk = "%s|%s" % key
        if dk not in districts:
            continue
        for nm in st_names:
            cur = st_map.get(nm)
            # 같은 이름의 역이 둘이면 거래가 많은 쪽을 쓴다 (중구 충돌 대비)
            if cur is None or districts[dk]["deals"] > districts[cur]["deals"]:
                st_map[nm] = dk

    months = sorted({"%d-%02d" % (x["year"], x["month"]) for x in deals if x.get("year")})
    payload = {
        "updated": months[-1] if months else None,
        "period": [months[0], months[-1]] if months else [],
        "source": "국토교통부 아파트 매매 실거래가 (공공데이터포털)",
        "basis": "단지·평형대별 최근 6개월 중위값. 단지 좌표가 없어 법정동 단위로 붙인다.",
        "note": "최근 1~2개월은 신고 지연(계약 후 30일)으로 건수가 적다. "
                "거래 %d건 미만 단지는 목록에서 뺀다." % MIN_DEALS,
        "districts": districts,
        "stations": st_map,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), "utf8")

    size = OUT.stat().st_size
    print("단지 %d곳 중 %d곳 채택 (거래 %d건 이상)" % (total_cx, kept, MIN_DEALS))
    print("법정동 %d곳 · 역 %d곳 연결" % (len(districts), len(st_map)))
    print("저장: data/station-complex.json  %.0fKB" % (size / 1024))

    print("\n=== 평당가 높은 단지 (역 있는 법정동) ===")
    top = []
    for dk, d in districts.items():
        if dk not in set(st_map.values()):
            continue
        for c in d["complexes"][:3]:
            if c["pp"]:
                top.append((c["pp"], dk, c))
    top.sort(reverse=True, key=lambda t: t[0])
    for pp, dk, c in top[:12]:
        print("  %-16s %-14s %s년 %6.0f만원/평 %3d건 %4.0f㎡"
              % (dk.replace("|", " "), c["n"][:14], c["y"], pp, c["n_deals"], c["a"] or 0))
    return 0


if __name__ == "__main__":
    sys.exit(main())
