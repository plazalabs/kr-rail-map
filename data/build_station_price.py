"""실거래가를 법정동으로 묶어 역에 붙인다.

실거래가에는 좌표가 없고(법정동+지번만), 지오코더 API 는 좌표 저장을 금지한다.
그래서 지번을 좌표로 바꾸지 않고, **법정동 이름으로** 역과 이어붙인다.
역의 법정동은 국가철도공단 주소데이터에서 얻는다(data/build_station_dong.py).

정밀도에 대해 솔직히 적어 둔다.
  법정동 단위 집계다. '이 단지가 역에서 300m' 같은 값은 못 준다.
  대신 '이 역이 속한 법정동의 최근 시세'를 준다. 역세권 판단에는 이걸로
  충분하고, 약관 문제가 없다. 지번 단위가 필요해지면 다른 방법을 찾아야 한다.

신고 지연 주의:
  실거래가는 계약 후 30일 내 신고라, 최근 1~2개월은 건수가 적게 보인다.
  추세를 볼 때 이걸 모르면 '거래가 급감했다'고 잘못 읽는다.
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
OUT = ROOT / "data" / "station-price.json"

# 이보다 거래가 적으면 중위값을 믿기 어렵다
MIN_DEALS = 5


def load_sgg_name():
    """법정동코드 → (짧은 시도, 시군구 이름). 표는 lawd.py 한 곳에만 둔다.

    '성남시 분당구' 처럼 시 이름을 붙인다. '분당구' 만 보여주면 어느 도시
    인지 모르고, 시도까지 붙이면 화면이 길어진다.
    """
    import lawd
    return {c: (lawd.short_sido(lawd.CODE[c][0]), lawd.label_of(c))
            for c in lawd.codes()}


def main():
    if not DONG.exists():
        raise SystemExit("data/_station_dong.json 이 없습니다. build_station_dong.py 를 먼저 실행하세요.")

    sgg_name = load_sgg_name()
    stations = json.loads(DONG.read_text("utf8"))

    # 공식 주소데이터는 '서울역'·'총신대입구' 라고 부르고 지도는 '서울'·'이수'
    # 라고 부른다. 이름을 안 맞추면 그 역은 시세가 통째로 사라진다 —
    # 실제로 서울역과 이수역이 그랬다. 데이터가 없어서가 아니라 이름이
    # 달라서 없었다.
    import station_names  # noqa: E402  (같은 폴더)
    import dong_match  # noqa: E402

    # (시군구코드, 법정동) → 역 이름들
    #
    # 예전엔 (구 이름, 법정동) 이었다. 그런데 '중구'는 서울에도 인천에도
    # 있고 '서구'는 인천·대구·광주·부산에 다 있다. 이름으로 묶으면 서울
    # 중구 아파트가 인천 중구 역에 붙는다. 경기·인천을 넣으려면 코드가
    # 필요했다.
    dong2st = {}
    unmatched = set()
    for s in stations:
        if not s["dong"] or not s.get("lawd"):
            continue
        # resolve_all 을 쓴다. 이수역처럼 같은 역이 지도에 두 이름으로 들어
        # 있는 경우가 있어, 한쪽만 고르면 나머지 한쪽은 시세가 안 뜬다.
        names = station_names.resolve_all(s["name"])
        if not names:
            unmatched.add(s["name"])
            continue
        dong2st.setdefault((s["lawd"], s["dong"]), set()).update(names)
    if unmatched:
        print("이름을 못 맞춘 역 %d곳: %s" % (len(unmatched), ", ".join(sorted(unmatched)[:8])))

    # 실거래가 모으기 — 파일명 앞 5자리가 법정동코드다
    deals = []
    for f in sorted(glob.glob(str(RTMS / "*_*_*.json"))):
        code = pathlib.Path(f).name.split("_")[0]
        if not code.isdigit():
            continue
        sido, sgg = sgg_name.get(code, ("", ""))
        for r in json.loads(pathlib.Path(f).read_text("utf8")):
            if r.get("cancelled") or not r.get("price") or not r.get("umd"):
                continue
            r["lawd"] = code
            r["sido"] = sido
            r["sgg"] = sgg
            deals.append(r)

    print(f"실거래 {len(deals)}건 (해제·가격없음 제외)")
    if not deals:
        print("받은 데이터가 없습니다. fetch_rtms.py 로 먼저 받으세요.")
        return 1

    # 법정동별 집계 — 키는 (시군구코드, 법정동)
    by_dong = {}
    for r in deals:
        key = (r["lawd"], r["umd"])
        by_dong.setdefault(key, []).append(r)

    out = []
    matched = 0
    for (code, umd), rows in by_dong.items():
        pers = [x["perPyeong"] for x in rows if x.get("perPyeong")]
        prices = [x["price"] for x in rows if x.get("price")]
        st_names = sorted(dong_match.stations_in(code, umd, dong2st))
        if st_names:
            matched += len(rows)
        out.append({
            "lawd": code,
            "sido": rows[0]["sido"],
            "sgg": rows[0]["sgg"],
            "dong": umd,
            "deals": len(rows),
            "medianPerPyeong": round(statistics.median(pers), 1) if pers else None,
            "medianPrice": round(statistics.median(prices), 0) if prices else None,
            "avgArea": round(statistics.mean([x["area"] for x in rows if x["area"]]), 1),
            "stations": st_names,
            "months": sorted({f"{x['year']}-{x['month']:02d}" for x in rows}),
        })

    out.sort(key=lambda d: -(d["medianPerPyeong"] or 0))
    print(f"법정동 {len(out)}곳 · 그중 역이 있는 곳 "
          f"{sum(1 for d in out if d['stations'])}곳 "
          f"(거래 {matched}건이 역과 연결됨)")

    print("\n=== 평당가 높은 법정동 (역 있는 곳) ===")
    n = 0
    for d in out:
        if not d["stations"] or not d["medianPerPyeong"]:
            continue
        flag = "" if d["deals"] >= MIN_DEALS else "  (거래 적음)"
        print(f"  {d['sgg']} {d['dong']:<10} {d['medianPerPyeong']:>9,.0f}만원/평 "
              f"{d['deals']:>4}건  {', '.join(d['stations'][:3])}{flag}")
        n += 1
        if n >= 12:
            break

    # 역 이름 → 시세 (앱에서 바로 쓰기 좋은 형태)
    #
    # 공식 주소데이터는 역명에 괄호 부기를 붙인다('잠실(송파구청)'). 그런데
    # 지도의 역 이름은 '잠실' 이라 그대로는 안 맞는다. 실제로 잠실역이
    # 통째로 빠졌다. 그래서 괄호를 뗀 이름으로도 함께 등록한다.
    def norm_name(n):
        return re.sub(r"\s*\(.*?\)\s*", "", n).strip()

    by_station = {}
    for d in out:
        for name in d["stations"]:
            # 이름은 이미 station_names.resolve 를 거친 지도 이름이다.
            # 예전엔 괄호 부기를 뗀 이름까지 같이 등록해서 키가 부풀었다
            # (283개로 보였지만 실제 역은 235개). 지금은 하나만 넣는다.
            cur = by_station.get(name)
            if cur is None or d["deals"] > cur["deals"]:
                by_station[name] = {
                    "lawd": d["lawd"], "sido": d["sido"], "sgg": d["sgg"],
                    "dong": d["dong"], "deals": d["deals"],
                    "medianPerPyeong": d["medianPerPyeong"],
                    "medianPrice": d["medianPrice"],
                    }
    payload = {
        "updated": sorted({m for d in out for m in d["months"]})[-1] if out else None,
        "source": "국토교통부 아파트 매매 실거래가 (공공데이터포털)",
        "note": "법정동 단위 집계. 최근 1~2개월은 신고 지연으로 건수가 적다.",
        "districts": out,
        "stations": by_station,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=1), "utf8")
    print(f"\n저장: {OUT.relative_to(ROOT)} (역 {len(by_station)}곳)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
