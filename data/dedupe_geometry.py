#!/usr/bin/env python3
"""노선 선형 중복 조각 제거 (겹침 기반).

OSM route relation 을 병합하면 한 노선의 선형이 여러 조각으로 쪼개지면서
서로 겹치는 경우가 있다. 예) 5호선 = 53.0 + 40.9 + 11.1 + 8.0 + 7.2 = 120.2km
(실제 63.9km) — part0 이 선형 전체이고 나머지는 일부 구간의 다른 변형이다.

기존 버전은 (길이 ±1.5% + 경계상자 ±0.002°) 로 비교해서 부분 포함은 못 잡았다.
이 버전은 조각 A 의 표본 점들이 모두 조각 B 에서 150m 이내면 겹친다고 본다.
(포함되거나 뒤집힌 중복 모두 걸러낸다. 더 자세한 조각을 남긴다.)

사용: cd data && python3 dedupe_geometry.py
"""
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
NEAR_M = 150.0
CELL = 0.01


def hav(a, b):
    R = 6371000.0
    lat1, lon1, lat2, lon2 = map(math.radians, (a[1], a[0], b[1], b[0]))
    h = (math.sin((lat2 - lat1) / 2) ** 2 +
         math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(h))


def parts(g):
    return [g["coordinates"]] if g["type"] == "LineString" else g["coordinates"]


def plen_m(p):
    return sum(hav(p[i], p[i + 1]) for i in range(len(p) - 1))


def build_index(part):
    grid = {}
    for i in range(len(part) - 1):
        a, b = part[i], part[i + 1]
        x0 = int(min(a[0], b[0]) / CELL) - 1
        x1 = int(max(a[0], b[0]) / CELL) + 1
        y0 = int(min(a[1], b[1]) / CELL) - 1
        y1 = int(max(a[1], b[1]) / CELL) + 1
        for cx in range(x0, x1 + 1):
            for cy in range(y0, y1 + 1):
                grid.setdefault((cx, cy), []).append((a, b))
    return grid


def seg_dist_m(pt, a, b):
    kx = 111320.0 * math.cos(math.radians(37.0))
    ky = 110570.0
    px, py = pt[0] * kx, pt[1] * ky
    ax, ay = a[0] * kx, a[1] * ky
    bx, by = b[0] * kx, b[1] * ky
    dx, dy = bx - ax, by - ay
    l2 = dx * dx + dy * dy
    t = 0.0 if l2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / l2))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def max_dist(pts, grid):
    """표본 점들 중 상대 조각에서 가장 먼 점의 거리(m)."""
    worst = 0.0
    for p in pts:
        cx, cy = int(p[0] / CELL), int(p[1] / CELL)
        near = None
        for ox in (0, -1, 1):
            for oy in (0, -1, 1):
                cand = grid.get((cx + ox, cy + oy))
                if cand:
                    near = cand
                    break
            if near:
                break
        if not near:
            return math.inf
        d = min(seg_dist_m(p, a, b) for a, b in near)
        if d > worst:
            worst = d
    return worst


def sample(part, step=5):
    pts = [part[0], part[-1]]
    pts.extend(part[i] for i in range(0, len(part), step))
    return pts


def contained(a, b):
    """a 의 모든 표본 점이 b 에서 NEAR_M 이내이면 a는 b 에 포함된 것으로 본다."""
    return max_dist(sample(a), build_index(b)) <= NEAR_M


def main():
    path = os.path.join(HERE, "lines.geojson")
    lines = json.load(open(path, encoding="utf-8"))
    before = after = 0.0
    dropped = 0
    report = []

    for f in lines["features"]:
        g = f["geometry"]
        ps = [p for p in parts(g) if len(p) >= 2]
        if len(ps) < 2:
            before += sum(plen_m(p) for p in ps)
            after += sum(plen_m(p) for p in ps)
            continue
        ps.sort(key=plen_m, reverse=True)
        keep = []
        for p in ps:
            # 이미 남긴 조각에 포함되면 버린다
            if any(contained(p, k) for k in keep):
                dropped += 1
                continue
            keep.append(p)
        keep.sort(key=lambda p: -len(p))
        b = sum(plen_m(p) for p in ps)
        a = sum(plen_m(p) for p in keep)
        before += b
        after += a
        if len(keep) != len(ps):
            report.append((f["properties"]["name_ko"], len(ps), len(keep), b / 1000, a / 1000))
        coords = keep
        f["geometry"] = ({"type": "LineString", "coordinates": coords[0]}
                         if len(coords) == 1
                         else {"type": "MultiLineString", "coordinates": coords})

    with open(path, "w", encoding="utf-8") as fp:
        json.dump(lines, fp, ensure_ascii=False, separators=(",", ":"))

    print(f"중복 조각 {dropped}개 제거")
    print(f"총 연장 {before / 1000:.1f}km → {after / 1000:.1f}km")
    for name, b, a, kmb, kma in report[:24]:
        print(f"  - {name}: {b}조각 → {a}조각, {kmb:.1f}km → {kma:.1f}km")


if __name__ == "__main__":
    main()
