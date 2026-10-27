#!/usr/bin/env python3
"""relation 이 없거나 조각뿐인 노선은 선로를 따라 최단경로로 선형을 만든다.

왜 필요한가
-----------
KTX 경부선 relation 은 way 가 1개뿐이었다(1.8km). OSM 에서 일반철도 노선은
'운행 계통' relation 으로만 있고 실제 선로는 railway=rail way 로 흩어져
있는 경우가 많다. 그래서 relation 을 이어붙이는 방식으로는 선형이 안 나온다.

대신 이렇게 한다.
  1) OSM 철도 way 전체를 정점 그래프로 만든다 (way 가 공유하는 점 = 연결).
  2) 우리 역 좌표를 그래프에 스냅한다.
  3) 역과 역 사이를 **실제 선로를 따라** 최단경로로 잇는다.

역 순서는 지금 선형에 투영해서 얻는다. 지금 선형의 모양은 문제가 있어도
'어느 역이 먼저인가'는 맞기 때문이다.

출력: data/_osm_align/graph.json — build_align_from_pbf.py 와 같은 형식
"""
import heapq
import json
import math
import sys

from osm_align import (CACHE, ROOT, chain_segments, dedupe_chains, hav,
                       length_km, pt_to_chains, score)

WAYS = ROOT / "data" / "_osm" / "rail_ways.json"
LINES = ROOT / "data" / "lines.geojson"
STATIONS = ROOT / "data" / "stations.geojson"
OUT = CACHE / "graph.json"

SNAP_KM = 1.0        # 역에서 이 안의 선로 점에 붙인다
CORRIDOR_MIN = 2.0   # 두 역을 잇는 직선에서 이만큼까지 벗어나도 된다
CORRIDOR_FRAC = 0.35 # 먼 구간은 직선거리의 이 비율까지 허용 (곡선 노선 배려)

# 경로를 못 찾았을 때 복도를 넓혀 다시 찾는 순서. 지하 구간은 선로가 크게
# 휘어서 좁은 복도로는 길이 없다 — 경의선 효창공원앞~공덕이 그랬다.
RETRY = ((CORRIDOR_FRAC, CORRIDOR_MIN), (0.9, 6.0), (2.5, 20.0))

# 측선·기지선은 본선 경로를 흐리므로 '가중치'로 누른다. 아예 빼면 안 된다 —
# 고속철도와 지상역을 잇는 연결선이 대부분 service=spur 라서, 빼버리면
# 서울~광명 경로가 아예 없어진다 (실제로 그랬다).
PENALTY_SERVICE = {"yard": 4.0, "siding": 4.0, "spur": 2.0, "crossover": 2.0}


def build_graph(ways):
    """좌표를 정점으로 하는 무방향 그래프. way 가 점을 공유하면 자동으로 연결된다.

    좌표는 이미 소수 6자리로 반올림돼 있어(약 11cm) 같은 점은 정확히 같다.
    점 id 를 따로 저장하지 않아도 되는 이유다.
    """
    adj = {}
    for w in ways.values():
        tags = w.get("tags") or {}
        mult = PENALTY_SERVICE.get(tags.get("service"), 1.0)
        c = w.get("coords") or []
        for i in range(len(c) - 1):
            a = (c[i][0], c[i][1])
            b = (c[i + 1][0], c[i + 1][1])
            if a == b:
                continue
            d = hav(a, b) * mult
            adj.setdefault(a, []).append((b, d))
            adj.setdefault(b, []).append((a, d))
    return adj


class Grid:
    """가까운 정점 찾기용 격자. 148,000개를 매번 훑으면 역 1,000쌍에 1.5억 번이다."""

    CELL = 0.005   # 약 550m

    def __init__(self, nodes):
        self.g = {}
        for n in nodes:
            self.g.setdefault((int(n[0] / self.CELL), int(n[1] / self.CELL)), []).append(n)

    def nearest(self, pt, limit, k=1):
        """가까운 점 k개. 하나만 쓰면 엉뚱한 선로에 붙는다.

        서울역처럼 노선이 여러 개 겹치는 곳에서는 가장 가까운 점이
        경부선이 아니라 공항철도 선로일 수 있다. 그 점에서 출발하면
        경부선 역까지 경로가 없다.
        """
        cx, cy = int(pt[0] / self.CELL), int(pt[1] / self.CELL)
        # limit(km) 을 칸 수로. 위도 1도 ≈ 111km 이므로 CELL 0.005 → 0.55km.
        r = int(limit / (self.CELL * 111.0)) + 2
        found = []
        for dx in range(-r, r + 1):
            for dy in range(-r, r + 1):
                for n in self.g.get((cx + dx, cy + dy), ()):
                    d = hav(n, pt)
                    if d <= limit:
                        found.append((d, n))
        found.sort()
        return [n for _, n in found[:k]]


LINK_KM = 0.015   # 이만큼 떨어진 선로 점끼리 잇는다 (약 15m)
LINK_COST = 2.0   # 잇는 데 드는 값을 비싸게 매겨 본선을 우선하게 한다

# 그래도 안 붙는 곳이 있다. 터널 입·출구나 편집 경계에서 way 가 50m 쯤
# 끊겨 있기 때문이다 — 경의선 효창공원앞~공덕이 그랬다. 15m 만 쓰면 그 구간에
# 경로가 없어서 12km 를 돌아가거나(그러면 엉뚱한 선로를 그린다) 직선을 긋게 된다.
# 넓게 잇되 값을 6배로 매긴다. 실제 선로로 갈 수 있으면 절대 쓰이지 않고,
# 갈 수 없을 때만 마지막 수단으로 쓰인다.
LINK_KM_FAR = 0.060
LINK_COST_FAR = 6.0


def link_parallel_tracks(adj):
    """상행·하행 선로를 잇는다.

    OSM 에서 상행선과 하행선은 **서로 다른 way** 이고, 역 구간에서 두 선로를
    잇는 way 가 없는 곳이 많다. 그대로 두면 A역이 상행선에, B역이 하행선에
    붙어 '경로없음' 이 된다 — 우이신설선 삼양~삼양사거리, 용인경전철
    기흥~강남대가 그랬다. 실제로는 사람이 타고 지나가는 구간이다.

    15m 안의 점끼리 양방향으로 잇되, 값을 2배로 매겨 가까운 쪽이 아니면
    쓰지 않게 한다. 60m 까지는 6배를 매겨 잇는다 (LINK_KM_FAR 설명 참고).
    """
    CELL = 0.001          # 약 110m. 3x3 칸이면 ±110m 를 다 본다.
    grid = {}
    for n in adj:
        grid.setdefault((int(n[0] / CELL), int(n[1] / CELL)), []).append(n)
    added = 0
    for n in adj:
        cx, cy = int(n[0] / CELL), int(n[1] / CELL)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for m in grid.get((cx + dx, cy + dy), ()):
                    if m == n:
                        continue
                    d = hav(n, m)
                    if d <= LINK_KM:
                        adj[n].append((m, d * LINK_COST))
                        added += 1
                    elif d <= LINK_KM_FAR:
                        adj[n].append((m, d * LINK_COST_FAR))
                        added += 1
    return added


def nearest_nodes(grid, pt, limit=SNAP_KM, k=3):
    return grid.nearest(pt, limit, k)


def seg_km_pt(p, a, b):
    lat0 = math.radians((a[1] + b[1]) / 2.0)
    kx = math.cos(lat0) * 111.320
    ky = 110.574
    px, py = p[0] * kx, p[1] * ky
    ax, ay = a[0] * kx, a[1] * ky
    bx, by = b[0] * kx, b[1] * ky
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def astar(adj, start, goal, frac=CORRIDOR_FRAC, min_km=CORRIDOR_MIN):
    """선로 그래프에서 최단경로. 두 역을 잇는 직선에서 너무 벗어나면 가지 않는다.

    복도(corridor) 제한이 없으면 경부선 역 사이를 KTX 선로로 가로지르는 식으로
    엉뚱한 길이 나온다. 직선거리에 비례해 허용폭을 준다 — 곡선 구간은 넓게,
    짧은 구간은 좁게.

    frac·min_km 을 인자로 받는 이유: 좁은 복도로 길을 못 찾았을 때 넓혀서
    다시 찾기 위해서다. 좁은 값만 쓰면 지하 구간처럼 선로가 크게 휘는 곳에서
    '경로없음' 이 나고, 그 자리에 직선을 그으면 실제와 다른 선형이 된다.
    """
    direct = hav(start, goal)
    corridor = max(min_km, direct * frac)
    openq = [(direct, 0.0, start, None)]
    came = {}
    best = {start: 0.0}
    seen = set()
    while openq:
        _, g, cur, parent = heapq.heappop(openq)
        if cur in seen:
            continue
        seen.add(cur)
        came[cur] = parent
        if cur == goal:
            path = []
            n = cur
            while n is not None:
                path.append(n)
                n = came[n]
            return path[::-1]
        for nb, d in adj.get(cur, ()):
            if nb in seen:
                continue
            if seg_km_pt(nb, start, goal) > corridor:
                continue
            ng = g + d
            if ng < best.get(nb, float("inf")):
                best[nb] = ng
                heapq.heappush(openq, (ng + hav(nb, goal), ng, nb, cur))
    return None


def order_stations(feat, named):
    """지금 선형에 투영해 역 순서를 얻는다.

    모양은 틀려도 순서는 맞다. 투영 위치의 누적거리로 정렬한다.
    """
    chains = feat["geometry"]["coordinates"]
    if feat["geometry"]["type"] == "LineString":
        chains = [chains]

    def project(pt):
        best = (float("inf"), 0.0)
        acc = 0.0
        for ch in chains:
            for i in range(len(ch) - 1):
                a, b = tuple(ch[i]), tuple(ch[i + 1])
                d = seg_km_pt(pt, a, b)
                if d < best[0]:
                    best = (d, acc + hav(a, pt))
                acc += hav(a, b)
        return best[1]

    return [nm for nm, _ in sorted(named, key=lambda x: project(x[1]))]


def main(argv):
    only = {a for a in argv[1:] if not a.startswith("--")}
    ways = json.loads(WAYS.read_text("utf8"))
    data = json.loads(LINES.read_text("utf8"))
    st = json.loads(STATIONS.read_text("utf8"))["features"]

    print("그래프 만드는 중…")
    adj = build_graph(ways)
    links = link_parallel_tracks(adj)
    grid = Grid(adj.keys())
    print(f"  정점 {len(adj):,}개 · 선로 사이 연결 {links:,}개")

    named = {}
    for f in st:
        p = f["properties"]
        c = f["geometry"]["coordinates"]
        for lid in (p.get("lines") or []):
            named.setdefault(lid, []).append((p.get("name_ko") or "?", (c[0], c[1])))

    out = {}
    for feat in data["features"]:
        lid = feat["properties"]["id"]
        if only and lid not in only:
            continue
        pts = named.get(lid, [])
        if len(pts) < 2:
            print(f"{lid:34s} 역이 {len(pts)}개 — 건너뜀")
            continue
        seq = order_stations(feat, pts)
        coords = dict((nm, co) for nm, co in pts)
        chains, fail, straight = [], [], []
        edges = {}   # 실제로 지나간 선로 구간. 길이는 '중복 없이' 세야 한다.
        for a, b in zip(seq, seq[1:]):
            cands_a = nearest_nodes(grid, coords[a])
            cands_b = nearest_nodes(grid, coords[b])
            if not cands_a or not cands_b:
                # 역에서 1km 안에 선로 점이 없다. 계획 노선의 역처럼 선로가
                # 아직 없는 경우도 있지만, 스냅 반경이 좁아 놓친 경우도 있다.
                # 반경을 넓혀 한 번 더 본다.
                cands_a = cands_a or nearest_nodes(grid, coords[a], SNAP_KM * 2.5)
                cands_b = cands_b or nearest_nodes(grid, coords[b], SNAP_KM * 2.5)
            if not cands_a or not cands_b:
                fail.append(f"{a}~{b}(스냅실패)")
                continue

            direct = hav(coords[a], coords[b])
            # 복도를 좁게 시작해 넓혀 간다. 넓힌 경로는 '직선거리의 3배' 를
            # 넘으면 엉뚱한 선로를 탄 것으로 보고 버린다.
            path, best_km = None, None
            for frac, min_km in RETRY:
                for na in cands_a:
                    for nb in cands_b:
                        if na == nb:
                            continue
                        got = astar(adj, na, nb, frac, min_km)
                        if not got:
                            continue
                        km_ = sum(hav(u, v) for u, v in zip(got, got[1:]))
                        if km_ > max(direct * 3.0, direct + 5.0):
                            continue
                        if best_km is None or km_ < best_km:
                            path, best_km = got, km_
                if path:
                    break
            if not path:
                # 선로 그래프에 길이 없으면 역 사이를 직선으로 잇는다.
                # 선이 끊겨 보이는 것보다 낫고, 우리 역 좌표끼리 이은
                # 것이라 라이선스 문제도 없다. 몇 곳을 이렇게 했는지 센다.
                fail.append(f"{a}~{b}(경로없음→직선)")
                straight.append([coords[a], coords[b]])
                continue
            chains.append([[p[0], p[1]] for p in path])
            for u, v in zip(path, path[1:]):
                edges[frozenset((u, v))] = hav(u, v)
        if not chains:
            print(f"{lid:34s} 실패 {fail[:2]}")
            continue
        merged = chain_segments(chains + straight)
        merged = dedupe_chains(merged)
        cov, mx, med = score(merged, [c for _, c in pts])
        # 지선(도라산 등)이 있으면 역 순서가 '나갔다 돌아오는' 꼴이 되어
        # 같은 선로를 두 번 지난다. 그대로 더하면 문산~지평이 192km 로 나온다
        # (실제 128km). 지나간 구간을 집합으로 모아 한 번만 센다.
        km = sum(edges.values()) + sum(hav(c[0], c[1]) for c in straight)
        # 선형은 역을 순서대로 지나는 직선보다 짧을 수 없다 (삼각부등식).
        # 짧게 나왔다면 그 선은 역을 지나지 않았다는 뜻이다 — 실제로 중부내륙선이
        # 83km(직선 합 100km)로 나왔다. 스냅이 역에서 최대 1km 떨어진 점에
        # 붙으므로 그만큼은 봐준다.
        #
        # 지선(도라산 등)은 같은 구간을 두 번 지나므로 직선 합이 부풀려진다.
        # 같은 역 쌍은 한 번만 세고, 그래도 남는 어긋남을 위해 10% 여유를 둔다.
        min_km, seen_pair = 0.0, set()
        for u, v in zip(seq, seq[1:]):
            k = frozenset((u, v))
            if k in seen_pair:
                continue
            seen_pair.add(k)
            min_km += hav(coords[u], coords[v])
        too_short = km < min_km * 0.90 - 2.0
        # 직선으로 메운 구간은 **한 곳이라도 있으면 안 된다.**
        #
        # 예전에는 '역 수의 1/8 까지' 허용했다. 그런데 직선은 그 구간의 실제
        # 선로 모양을 지어내는 것이다 — 경부선 역 사이를 20km 직선으로 가로지른
        # GTX-A 가 그렇게 '채택' 으로 통과했다. 커버율도 속는다: 직선은 양 끝
        # 역을 반드시 지나므로 그 두 역은 자동으로 '선 위에 있다' 가 된다.
        # 검증에 쓰는 숫자가 검증 대상에 의해 좋아지는 셈이라 기준으로 못 쓴다.
        ok = cov >= 0.90 and med <= 0.15 and not straight and not too_short
        if too_short:
            fail.append(f"직선합 {min_km:.0f}km 보다 짧음")
        print(f"{lid:34s} 커버 {cov*100:3.0f}% 중앙 {med*1000:4.0f}m {km:7.1f}km  "
              f"{'채택' if ok else '보류'} {' '.join(fail[:3])}")
        out[lid] = {"chains": merged, "coverage": round(cov, 4),
                    "median_km": round(med, 4), "max_km": round(mx, 4),
                    "length_km": round(km, 3), "relations": [], "accept": ok,
                    "notes": fail, "straight": len(straight), "via": "graph"}

    OUT.write_text(json.dumps(out, ensure_ascii=False), "utf8")
    print(f"\n저장: {OUT.relative_to(ROOT)} ({len(out)}개)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
