#!/usr/bin/env python3
"""역↔노선 연결 보정 스크립트.

문제: OSM route relation 을 330개 → 82개로 병합하면서, 일부 역의
`lines` 배열이 병합 전 relation 을 가리키거나 아예 비어 있어
전라선·호남선 같은 간선이 "0역"으로 표시된다.

해결: 역이 어느 노선에도 붙지 않았거나 노선의 역이 2개 미만일 때,
노선 선형에서 200m 이내에 있는 역을 찾아 그 노선을 추가한다.
(이미 연결이 잘 된 역은 건드리지 않는다 — 부작용 최소화)

사용: cd data && python3 fix_station_lines.py
"""
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SNAP_M = 80.0
R = 6371000.0


def hav(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (a[1], a[0], b[1], b[0]))
    h = (math.sin((lat2 - lat1) / 2) ** 2 +
         math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(h))


def flat_parts(geom):
    if geom["type"] == "LineString":
        return [geom["coordinates"]]
    return [p for p in geom["coordinates"] if len(p) >= 2]


def seg_dist_m(p, a, b, kx):
    """점 p 에서 선분 ab 까지의 거리(m). 경위도를 평면 근사."""
    px, py = p[0] * kx, p[1] * 110570.0
    ax, ay = a[0] * kx, a[1] * 110570.0
    bx, by = b[0] * kx, b[1] * 110570.0
    dx, dy = bx - ax, by - ay
    l2 = dx * dx + dy * dy
    t = 0.0 if l2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / l2))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def main():
    lines = json.load(open(os.path.join(HERE, "lines.geojson"), encoding="utf-8"))
    stations = json.load(open(os.path.join(HERE, "stations.geojson"), encoding="utf-8"))

    counts = {}
    for s in stations["features"]:
        for lid in s["properties"].get("lines") or []:
            counts[lid] = counts.get(lid, 0) + 1

    # 손볼 노선: 역이 2개 미만
    targets = [f for f in lines["features"] if counts.get(f["properties"]["id"], 0) < 2]
    print(f"보정 대상 노선 {len(targets)}개: " + ", ".join(f["properties"]["name_ko"] for f in targets))

    # 역 좌표를 격자에 넣어 후보를 좁힌다
    CELL = 0.02  # 약 2km
    grid = {}
    for i, s in enumerate(stations["features"]):
        c = s["geometry"]["coordinates"]
        key = (int(c[0] / CELL), int(c[1] / CELL))
        grid.setdefault(key, []).append(i)

    added = 0
    for lf in targets:
        lid = lf["properties"]["id"]
        parts = flat_parts(lf["geometry"])
        kx = 111320.0 * math.cos(math.radians(37.0))
        hit = []
        for part in parts:
            for j in range(len(part) - 1):
                a, b = part[j], part[j + 1]
                # 이 선분 근처 셀만 검사
                cx0 = int(min(a[0], b[0]) / CELL) - 1
                cx1 = int(max(a[0], b[0]) / CELL) + 1
                cy0 = int(min(a[1], b[1]) / CELL) - 1
                cy1 = int(max(a[1], b[1]) / CELL) + 1
                for cx in range(cx0, cx1 + 1):
                    for cy in range(cy0, cy1 + 1):
                        for si in grid.get((cx, cy), ()):
                            st = stations["features"][si]
                            c = st["geometry"]["coordinates"]
                            # 이미 환승역으로 잡힌 곳(2개 이상 노선)은
                            # 선형이 스쳐 지나가는 것일 뿐 정차역이 아니므로 제외
                            if len(st.get("lines") or []) >= 2:
                                continue
                            if seg_dist_m(c, a, b, kx) <= SNAP_M:
                                hit.append((si, hav(c, a)))
        # 가장 가까운 역부터, 중복 제거
        hit.sort(key=lambda t: t[1])
        picked = []
        seen = set()
        for si, _d in hit:
            if si in seen:
                continue
            seen.add(si)
            picked.append(si)
        if not picked:
            print(f"  - {lf['properties']['name_ko']}: 붙일 역 없음")
            continue
        for si in picked:
            p = stations["features"][si]["properties"]
            arr = p.setdefault("lines", [])
            if lid not in arr:
                arr.append(lid)
                added += 1
            if not p.get("line_id"):
                p["line_id"] = lid
        print(f"  + {lf['properties']['name_ko']}: 역 {len(picked)}개 연결 "
              f"({', '.join(stations['features'][i]['properties']['name_ko'] for i in picked[:8])}"
              f"{' …' if len(picked) > 8 else ''})")

    with open(os.path.join(HERE, "stations.geojson"), "w", encoding="utf-8") as f:
        json.dump(stations, f, ensure_ascii=False, separators=(",", ":"))
    print(f"완료: 연결 {added}건 추가")


if __name__ == "__main__":
    main()
