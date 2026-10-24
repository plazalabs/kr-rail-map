"""국가철도공단 역위치(공식)와 현재 지도 데이터를 대조한다.

전환 판단의 근거를 만들기 위한 스크립트다. 확인하려는 것은 세 가지.
  1. 공식 데이터가 우리 역 목록을 얼마나 덮는가 (커버리지)
  2. 같은 역의 좌표가 얼마나 다른가 (오차)
  3. 공식에만 있거나 우리에게만 있는 역은 무엇인가 (차이)

오차가 크면 그냥 갈아끼울 수 없고, 어느 쪽이 맞는지 따져야 한다.
"""
import csv
import glob
import json
import math
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
GOV = ROOT / "data" / "_gov"
R = 6371.0


def hav(ax, ay, bx, by):
    r = math.pi / 180
    dlat = (by - ay) * r
    dlon = (bx - ax) * r
    h = math.sin(dlat / 2) ** 2 + math.cos(ay * r) * math.cos(by * r) * math.sin(dlon / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def norm(name):
    s = (name or "").strip()
    # '강변(동서울터미널)' 처럼 괄호 부기가 붙는다. 비교 전에 떼어낸다.
    s = re.sub(r"\(.*?\)", "", s)
    for a, b in [("·", " "), ("ㆍ", " "), ("-", " "), (".", " "), (" ", "")]:
        s = s.replace(a, b)
    if s.endswith("역") and len(s) > 2:
        s = s[:-1]
    return s


def load_gov():
    rows, bad = [], []
    for f in sorted(glob.glob(str(GOV / "*.csv"))):
        text = pathlib.Path(f).read_text(encoding="utf-8")
        rd = list(csv.DictReader(text.splitlines()))
        for r in rd:
            # 파일마다 '철도운영기관' / '철도운영기관명' 으로 헤더가 다르다
            name = (r.get("역명") or "").strip()
            lon = (r.get("경도") or "").strip()
            lat = (r.get("위도") or "").strip()
            line = (r.get("선명") or "").strip()
            if not name or not lon or not lat:
                bad.append((pathlib.Path(f).name, name))
                continue
            try:
                x, y = float(lon), float(lat)
            except ValueError:
                bad.append((pathlib.Path(f).name, name + " " + lon + "," + lat))
                continue
            rows.append({"name": name, "lon": x, "lat": y, "line": line,
                         "src": pathlib.Path(f).name})
    return rows, bad


def main():
    gov, bad = load_gov()
    print(f"공식 역위치: {len(gov)}행 (좌표 없음/오류 {len(bad)}행)")
    if bad[:5]:
        print("  예:", bad[:5])

    lines = sorted({g["line"] for g in gov})
    print(f"노선(선명): {len(lines)}종 — {', '.join(lines[:14])}{' …' if len(lines) > 14 else ''}")

    st = json.loads((ROOT / "data" / "stations.geojson").read_text("utf-8"))
    ours = [{"id": f["properties"]["id"], "name": f["properties"]["name_ko"],
             "lon": f["geometry"]["coordinates"][0],
             "lat": f["geometry"]["coordinates"][1],
             "lines": f["properties"].get("lines") or []} for f in st["features"]]

    by_name = {}
    for s in ours:
        by_name.setdefault(norm(s["name"]), []).append(s)

    dists, miss, pairs = [], [], []
    for g in gov:
        cands = by_name.get(norm(g["name"]), [])
        best = None
        for s in cands:
            d = hav(g["lon"], g["lat"], s["lon"], s["lat"])
            if best is None or d < best[0]:
                best = (d, s)
        if best and best[0] <= 1.0:
            dists.append(best[0])
            pairs.append((g["name"], best[0] * 1000, g["line"]))
        else:
            miss.append((g["name"], g["line"], best[0] * 1000 if best else None))

    dists.sort()
    print(f"\n=== 공식 {len(gov)}행 중 우리 지도에서 찾음: {len(dists)} "
          f"({len(dists) / len(gov) * 100:.1f}%) ===")
    if dists:
        print(f"좌표 차이  중앙값 {dists[len(dists) // 2] * 1000:.0f}m   "
              f"p75 {dists[int(len(dists) * .75)] * 1000:.0f}m   "
              f"p90 {dists[int(len(dists) * .90)] * 1000:.0f}m   "
              f"최대 {dists[-1] * 1000:.0f}m")
        over = [p for p in pairs if p[1] > 300]
        print(f"300m 넘게 차이 나는 역: {len(over)}개")
        for n, d, ln in sorted(over, key=lambda x: -x[1])[:15]:
            print(f"   {n:<18} {d:5.0f}m  {ln}")

    print(f"\n--- 우리 지도에 없는 공식 역 ({len(miss)}) ---")
    for n, ln, d in miss[:30]:
        print(f"   {n:<18} {ln:<10} " + ("동명 역 없음" if d is None else f"가장 가까운 동명 {d:.0f}m"))

    out = {
        "gov_rows": len(gov), "matched": len(dists),
        "median_m": round(dists[len(dists) // 2] * 1000) if dists else None,
        "p90_m": round(dists[int(len(dists) * .9)] * 1000) if dists else None,
        "max_m": round(dists[-1] * 1000) if dists else None,
        "over_300m": [{"name": n, "m": round(d), "line": ln} for n, d, ln in
                      sorted([p for p in pairs if p[1] > 300], key=lambda x: -x[1])],
        "missing": [{"name": n, "line": ln} for n, ln, _ in miss],
        "lines": lines,
    }
    (ROOT / "data" / "_gov_compare.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=1), "utf8")
    print("\n저장: data/_gov_compare.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
