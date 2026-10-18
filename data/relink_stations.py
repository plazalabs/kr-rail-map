#!/usr/bin/env python3
"""역↔노선 연결 재계산 (기하 기반).

문제: OSM route relation 을 병합하는 과정에서 일부 환승역의 `lines` 가
비어 있거나 일부만 남는다. 예) 석계 = 1호선만(6호선 누락), 왕십리 = 동북선만.

해결: 각 역에서 60m 이내를 지나는 모든 노선을 찾아 `lines` 에 합집합한다.
(기존 값을 지우지 않고 더하기만 한다 — KTX·계획노선 표기를 보존)

사용: cd data && python3 relink_stations.py
"""
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
NEAR_M = 160.0      # 도시철도·광역 (터널 구간은 선형이 조금 어긋난다)
NEAR_TRUNK_M = 40.0 # 일반철도·KTX (같은 선로를 여러 계통이 공유하므로 엄격하게)
CELL = 0.01          # 약 1km
KX = 111320.0 * math.cos(math.radians(37.0))
KY = 110570.0


def parts(geom):
    if geom["type"] == "LineString":
        return [geom["coordinates"]]
    return [p for p in geom["coordinates"] if len(p) >= 2]


def seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    l2 = dx * dx + dy * dy
    t = 0.0 if l2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / l2))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def main():
    lines = json.load(open(os.path.join(HERE, "lines.geojson"), encoding="utf-8"))
    stations = json.load(open(os.path.join(HERE, "stations.geojson"), encoding="utf-8"))

    # 노선 선분을 격자에 등록: cell -> [(x1,y1,x2,y2,lineId)]
    cat_of = {f["properties"]["id"]: (f["properties"].get("category") or "etc")
              for f in lines["features"]}
    # 개통된 도시철도·광역 노선만 대상으로 한다.
    #  · 공사중/계획 노선은 선형이 개략도(직선 연결)라 지나가는 역이 다 붙는다
    #  · 일반철도/KTX 는 같은 선로를 여러 계통이 공유해 오탐이 생긴다
    target = {f["properties"]["id"] for f in lines["features"]
              if (f["properties"].get("category") in ("metro", "urban"))
              and (f["properties"].get("status") or "open") == "open"}
    grid = {}
    for f in lines["features"]:
        lid = f["properties"]["id"]
        if lid not in target:
            continue
        for part in parts(f["geometry"]):
            for i in range(len(part) - 1):
                a, b = part[i], part[i + 1]
                ax, ay = a[0] * KX, a[1] * KY
                bx, by = b[0] * KX, b[1] * KY
                cx0 = int(min(a[0], b[0]) / CELL) - 1
                cx1 = int(max(a[0], b[0]) / CELL) + 1
                cy0 = int(min(a[1], b[1]) / CELL) - 1
                cy1 = int(max(a[1], b[1]) / CELL) + 1
                for cx in range(cx0, cx1 + 1):
                    for cy in range(cy0, cy1 + 1):
                        grid.setdefault((cx, cy), []).append((ax, ay, bx, by, lid))

    name_of = {f["properties"]["id"]: f["properties"]["name_ko"] for f in lines["features"]}
    added = 0
    changed = []
    for s in stations["features"]:
        p = s["properties"]
        c = s["geometry"]["coordinates"]
        px, py = c[0] * KX, c[1] * KY
        near = set()
        for seg in grid.get((int(c[0] / CELL), int(c[1] / CELL)), ()):
            lid = seg[4]
            # 도시철도·광역만 넓게 인정. 일반철도/KTX 는 같은 선로를 공유해서
            # 무조건 붙이면 "신도림에 KTX" 같은 오류가 생긴다.
            lim = NEAR_M if cat_of.get(lid) in ("metro", "urban") else NEAR_TRUNK_M
            if seg_dist(px, py, seg[0], seg[1], seg[2], seg[3]) <= lim:
                near.add(lid)
        if not near:
            # 어느 노선에도 안 붙는 역은 가장 가까운 노선 하나에만 붙인다
            best = (9e9, None)
            for seg in grid.get((int(c[0] / CELL), int(c[1] / CELL)), ()):
                d = seg_dist(px, py, seg[0], seg[1], seg[2], seg[3])
                if d < best[0]:
                    best = (d, seg[4])
            if best[1] and best[0] <= 800:
                near = {best[1]}
            else:
                continue
        cur = p.get("lines") or []
        new = [l for l in cur]
        for lid in sorted(near):
            if lid not in new:
                new.append(lid)
                added += 1
                changed.append((p["name_ko"], name_of.get(lid, lid)))
        if new != cur:
            p["lines"] = new
            if not p.get("line_id"):
                p["line_id"] = new[0]

    with open(os.path.join(HERE, "stations.geojson"), "w", encoding="utf-8") as fp:
        json.dump(stations, fp, ensure_ascii=False, separators=(",", ":"))

    print(f"노선 연결 {added}건 추가 (역 {len(set(n for n, _ in changed))}곳)")
    watch = {"석계", "왕십리", "홍대입구", "강남", "서울역", "신도림", "광운대", "삼성", "청량리"}
    for s in stations["features"]:
        if s["properties"]["name_ko"] in watch:
            names = [name_of.get(l, l) for l in (s["properties"].get("lines") or [])]
            print(f"  {s['properties']['name_ko']}: {', '.join(names)}")


if __name__ == "__main__":
    main()
