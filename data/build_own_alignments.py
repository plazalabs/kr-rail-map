#!/usr/bin/env python3
"""독자 선형 만들기 — 남의 지도 화면을 따라 그린 선을 걷어내고 우리 선을 만든다.

원칙
----
1. 선로가 있는 곳은 OpenStreetMap(ODbL) 선로를 따라간다. 역 순서는 own_align_config.py 에
   우리가 직접 적은 표를 쓴다 (예전 선형에 투영해서 얻지 않는다 — 그 선형이 걷어낼 대상이다).
2. 선로가 없는 계획·구상 노선은 역과 역을 부드럽게 이은 '개략선'을 직접 그린다.
   개략선은 실제 선로 모양이 아니다 → 노선 note 에 '개략선'이라고 적는다.
3. track 모드에서 길을 못 찾으면 직선으로 메우지 않고 실패로 보고한다.

실행
----
  python data/build_own_alignments.py                  # 전부 미리보기
  python data/build_own_alignments.py yeongdong-line   # 고른 노선만
  python data/build_own_alignments.py --apply [노선…]  # lines.geojson 에 반영
"""
import heapq
import json
import math
import sys

from osm_align import ROOT, hav
from own_align_config import LINES, OPEN_RAIL

WAYS = ROOT / "data" / "_osm" / "rail_ways.json"
LINES_PATH = ROOT / "data" / "lines.geojson"
STATIONS = ROOT / "data" / "stations.geojson"

SNAP_KM = 1.2
SNAP_W = 10.0
# 관광·보존 선로(옛 스위치백, 레일바이크)와 기지 선로는 본선 경로에서 뺀다.
SKIP_USAGE = {"tourism", "military", "test"}
PENALTY_SERVICE = {"yard": 6.0, "siding": 3.0, "spur": 2.0, "crossover": 2.0}
LINK_KM, LINK_COST = 0.015, 2.0
LINK_KM_FAR, LINK_COST_FAR = 0.060, 6.0
MAX_DETOUR = 2.6          # 선로 길이가 직선거리의 이 배수를 넘으면 엉뚱한 길로 본다
MAX_DETOUR_ADD = 4.0      # 짧은 구간 여유(km)


def build_graph(ways, allow):
    adj = {}
    ends = set()      # way 의 양 끝점
    tunnel = set()    # 터널 안의 점 — 먼 거리 잇기는 끝점끼리만 한다
    for w in ways.values():
        t = w.get("tags") or {}
        if t.get("railway") not in allow:
            continue
        if t.get("usage") in SKIP_USAGE:
            continue
        mult = PENALTY_SERVICE.get(t.get("service"), 1.0)
        c = w.get("coords") or []
        if len(c) >= 2:
            ends.add((c[0][0], c[0][1]))
            ends.add((c[-1][0], c[-1][1]))
        if t.get("tunnel") == "yes":
            tunnel.update((x[0], x[1]) for x in c)
        for i in range(len(c) - 1):
            a, b = (c[i][0], c[i][1]), (c[i + 1][0], c[i + 1][1])
            if a == b:
                continue
            d = hav(a, b) * mult
            adj.setdefault(a, []).append((b, d))
            adj.setdefault(b, []).append((a, d))
    # 상·하행 선로, 터널 입구에서 끊긴 way 를 잇는다 (값은 비싸게).
    cell = 0.001
    grid = {}
    for n in adj:
        grid.setdefault((int(n[0] / cell), int(n[1] / cell)), []).append(n)
    for n in list(adj):
        cx, cy = int(n[0] / cell), int(n[1] / cell)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for m in grid.get((cx + dx, cy + dy), ()):
                    if m == n:
                        continue
                    d = hav(n, m)
                    if d <= LINK_KM:
                        adj[n].append((m, d * LINK_COST))
                    elif d <= LINK_KM_FAR and ((n in ends and m in ends) or
                                               (n not in tunnel and m not in tunnel)):
                        # 끊긴 way·역 구내의 나란한 선로를 잇는 용도다. 터널 안에서 아무 점이나 이으면 솔안터널(똬리굴)처럼
                        # 위아래로 엇갈리는 선로를 가로질러 16km 를 8km 로 질러간다.
                        adj[n].append((m, d * LINK_COST_FAR))
    return adj


class Grid:
    CELL = 0.005

    def __init__(self, nodes):
        self.g = {}
        for n in nodes:
            self.g.setdefault((int(n[0] / self.CELL), int(n[1] / self.CELL)), []).append(n)

    def nearest(self, pt, limit, k=12):
        cx, cy = int(pt[0] / self.CELL), int(pt[1] / self.CELL)
        r = int(limit / (self.CELL * 88.0)) + 2
        found = []
        for dx in range(-r, r + 1):
            for dy in range(-r, r + 1):
                for n in self.g.get((cx + dx, cy + dy), ()):
                    d = hav(n, pt)
                    if d <= limit:
                        found.append((d, n))
        found.sort()
        return found[:k]


def shortest(adj, starts, goals, limit_km):
    """여러 출발 후보 → 여러 도착 후보 가운데 가장 짧은 선로 경로. starts/goals = [(스냅거리, 점)]."""
    goalset = {n: d for d, n in goals}
    best = {}
    pq = []
    for d, n in starts:
        # 스냅 거리는 값에 SNAP_W 배로 넣는다 — 역에서 먼 선로에 붙는 것을 꺼리게.
        # 3배였을 때 영동선이 신기역을 440m 비켜 가는 지름길을 골랐다.
        best[n] = d * SNAP_W
        heapq.heappush(pq, (d * SNAP_W, n, None))
    came = {}
    done = set()
    win, win_cost = None, float("inf")
    while pq:
        g, cur, par = heapq.heappop(pq)
        if cur in done:
            continue
        done.add(cur)
        came[cur] = par
        if g > limit_km * 1.5 + 6 + SNAP_KM * SNAP_W or g >= win_cost:
            break
        if cur in goalset:
            tot = g + goalset[cur] * SNAP_W
            if tot < win_cost:
                win, win_cost = cur, tot
        for nb, d in adj.get(cur, ()):
            if nb in done:
                continue
            ng = g + d
            if ng < best.get(nb, float("inf")):
                best[nb] = ng
                heapq.heappush(pq, (ng, nb, cur))
    if win is None:
        return None
    path, n = [], win
    while n is not None:
        path.append(n)
        n = came[n]
    return path[::-1]


def path_km(p):
    return sum(hav(a, b) for a, b in zip(p, p[1:]))


def spline(points, per_km=1.2):
    """역을 지나는 부드러운 곡선(Catmull-Rom). 계획 노선의 개략선에 쓴다."""
    pts = [tuple(p) for p in points]
    if len(pts) < 3:
        return [list(p) for p in pts]
    out = []
    ext = [pts[0]] + pts + [pts[-1]]
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
        n = max(2, int(hav(p1, p2) * per_km))
        for s in range(n):
            t = s / n
            t2, t3 = t * t, t * t * t
            x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2
                       + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3)
            y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2
                       + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
            out.append([round(x, 6), round(y, 6)])
    out.append([round(pts[-1][0], 6), round(pts[-1][1], 6)])
    return out


def simplify(coords, tol_km=0.004):
    """Douglas-Peucker. 선로 점이 촘촘해서 파일이 커지는 것을 막는다 (기본 4m)."""
    if len(coords) < 3:
        return coords
    lat0 = math.radians(coords[0][1])
    kx, ky = math.cos(lat0) * 111.320, 110.574
    P = [(c[0] * kx, c[1] * ky) for c in coords]
    keep = [False] * len(P)
    keep[0] = keep[-1] = True
    stack = [(0, len(P) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = P[a]
        bx, by = P[b]
        dx, dy = bx - ax, by - ay
        L2 = dx * dx + dy * dy
        worst, wi = 0.0, None
        for i in range(a + 1, b):
            px, py = P[i]
            if L2 == 0:
                d = math.hypot(px - ax, py - ay)
            else:
                t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L2))
                d = math.hypot(px - (ax + t * dx), py - (ay + t * dy))
            if d > worst:
                worst, wi = d, i
        if wi is not None and worst > tol_km:
            keep[wi] = True
            stack.append((a, wi))
            stack.append((wi, b))
    return [c for c, k in zip(coords, keep) if k]


def pt_seg_km(p, a, b):
    lat0 = math.radians((a[1] + b[1]) / 2.0)
    kx, ky = math.cos(lat0) * 111.320, 110.574
    px, py, ax, ay, bx, by = p[0] * kx, p[1] * ky, a[0] * kx, a[1] * ky, b[0] * kx, b[1] * ky
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def pt_chain_km(p, chain):
    return min(pt_seg_km(p, chain[i], chain[i + 1]) for i in range(len(chain) - 1))


def load_station_coords(lid, st):
    """이 노선에 속한 역 이름 → 좌표. 같은 이름이 둘이면 그 노선에 속한 것을 쓴다."""
    on, anyname = {}, {}
    for f in st:
        p = f["properties"]
        c = tuple(f["geometry"]["coordinates"][:2])
        anyname.setdefault(p["name_ko"], []).append(c)
        if lid in (p.get("lines") or []):
            on[p["name_ko"]] = c
    return on, anyname


def named_chains(ways, names, railway=None):
    """OSM 선로 가운데 이름이 names 인 것만 모아 잇는다 (공사 중 노선·화물선용).

    OSM 은 상행·하행을 따로 그린다. 이으면 '갔다가 돌아오는' 닫힌 선이나 '두 바퀴 도는' 순환선이
    되므로 절반만 쓴다. 따로 떨어진 나란한 선은 dedupe_chains 가 하나만 남긴다.
    """
    from osm_align import chain_segments, dedupe_chains
    segs = []
    for w in ways.values():
        t = w.get("tags") or {}
        if t.get("name") not in names or t.get("service") in ("yard", "siding", "crossover"):
            continue
        if railway and t.get("railway") not in railway:
            continue
        segs.append(w["coords"])
    out = []
    for c in (chain_segments(segs) if segs else []):
        L = path_km(c)
        if L < 0.3:
            continue
        acc = [0.0]
        for u, v in zip(c, c[1:]):
            acc.append(acc[-1] + hav(u, v))

        def idx(fr):
            for i, x in enumerate(acc):
                if x >= fr * L:
                    return i
            return len(c) - 1
        if hav(c[0], c[-1]) < 0.15:
            double_loop = hav(c[idx(0.5)], c[0]) < 0.3
            out_back = hav(c[idx(0.25)], c[idx(0.75)]) < 0.6
            if double_loop:
                c = c[:idx(0.5) + 1]
                if hav(c[0], c[-1]) > 0.0005:
                    c = c + [c[0]]
            elif out_back:
                c = c[:idx(0.5) + 1]
        out.append([[q[0], q[1]] for q in c])
    out = dedupe_chains(out) if len(out) > 1 else out
    return out


def build_line(lid, cfg, ways, st, graphs, verbose=True):
    allow = tuple(cfg.get("allow") or OPEN_RAIL)
    mode = cfg.get("mode", "track")
    if mode == "named":
        chains = [simplify(c) for c in named_chains(ways, cfg["names"], cfg.get("name_railway"))]
        on, _ = load_station_coords(lid, st)
        # 공사 구간 선로가 역 앞에서 끝나면(운행 선로와 맞닿는 곳) 역까지 이어 준다.
        for nm in cfg.get("attach", ()):
            if nm in on and chains:
                c = min(chains, key=lambda ch: min(hav(on[nm], ch[0]), hav(on[nm], ch[-1])))
                if hav(on[nm], c[0]) <= hav(on[nm], c[-1]):
                    if 0.02 < hav(on[nm], c[0]) <= 1.0:
                        c.insert(0, [on[nm][0], on[nm][1]])
                elif 0.02 < hav(on[nm], c[-1]) <= 1.0:
                    c.append([on[nm][0], on[nm][1]])
        devs = sorted((min(pt_chain_km(c, ch) for ch in chains), n) for n, c in on.items()) if chains else []
        med = devs[len(devs) // 2][0] if devs else 0.0
        far = [f"{n} {d*1000:.0f}m" for d, n in devs if d > 0.3]
        km = sum(path_km(c) for c in chains)
        ok = bool(chains) and (cfg.get("km") is None or abs(km - cfg["km"]) <= cfg["km"] * 0.15)
        if verbose:
            print(f"{lid:40s} {'OK ' if ok else '실패'} 조각 {len(chains)} · 이름 선로 {km:.1f}km"
                  f"{'' if cfg.get('km') is None else ' (기대 %.1f)' % cfg['km']} · 점 {sum(len(c) for c in chains)}"
                  f" · 역 {len(on)}곳 중앙오차 {med*1000:.0f}m")
            if far:
                print("      역이 선에서 300m 넘게:", ", ".join(far[:8]))
        return {"chains": chains, "ok": ok, "report": [], "median_km": med,
                "track_km": km, "sketch_km": 0.0, "far": far}
    if mode != "sketch":
        if allow not in graphs:
            adj = build_graph(ways, allow)
            graphs[allow] = (adj, Grid(adj.keys()))
        adj, grid = graphs[allow]
    on, anyname = load_station_coords(lid, st)
    chains, report, ok = [], [], True
    stats = {"track_km": 0.0, "sketch_km": 0.0, "dev": []}
    for part in cfg["parts"]:
        pts = []
        for item in part:
            if isinstance(item, (list, tuple)):
                pts.append((None, (item[0], item[1])))
            elif item in on:
                pts.append((item, on[item]))
            elif cfg.get("borrow") and anyname.get(item):
                # 이 노선 소속으로 적혀 있지 않은 경유역 — 같은 이름이 여럿이면 바로 앞 점에서 가까운 것.
                cands = anyname[item]
                ref = pts[-1][1] if pts else None
                pts.append((None, min(cands, key=lambda c: hav(ref, c)) if ref else cands[0]))
            else:
                report.append(f"역 없음: {item}")
                ok = False
        if len(pts) < 2:
            continue
        if mode == "sketch":
            seqpts = [c for _, c in pts]
            if cfg.get("closed") and len(seqpts) > 2:
                seqpts = seqpts + [seqpts[0]]
            ch = spline(seqpts)
            stats["sketch_km"] += path_km(ch)
            chains.append(ch)
            continue
        cur, pending = [], []      # pending: 선로가 없는 구간의 역들(개략선으로 이을 것)
        for (na, ca), (nb, cb) in zip(pts, pts[1:]):
            direct = hav(ca, cb)
            sa, sb = grid.nearest(ca, SNAP_KM), grid.nearest(cb, SNAP_KM)
            path = None
            if sa and sb:
                path = shortest(adj, sa, sb, direct * MAX_DETOUR + MAX_DETOUR_ADD)
                if path and path_km(path) > direct * MAX_DETOUR + MAX_DETOUR_ADD:
                    path = None
            if path and len(path) >= 2:
                if pending:
                    sk = spline(pending + [path[0]])
                    stats["sketch_km"] += path_km(sk)
                    cur = (cur[:-1] if cur else []) + sk
                    pending = []
                seg = [[p[0], p[1]] for p in path]
                stats["track_km"] += path_km(path)
                if na:
                    stats["dev"].append((pt_chain_km(ca, seg), na))
                if nb:
                    stats["dev"].append((pt_chain_km(cb, seg), nb))
                if cur and hav(cur[-1], seg[0]) > 0.0005:
                    cur.append(seg[0])
                cur = cur + (seg[1:] if cur and cur[-1] == seg[0] else seg)
            else:
                why = "스냅실패" if not (sa and sb) else "경로없음"
                if mode == "track":
                    report.append(f"{na}~{nb} {why} (직선 {direct:.1f}km)")
                    ok = False
                    if cur:
                        chains.append(cur)
                    cur = []
                else:
                    report.append(f"{na}~{nb} 개략선")
                    if not pending:
                        pending = [cur[-1]] if cur else [list(ca)]
                    pending.append(list(cb))
        if pending:
            sk = spline(pending)
            stats["sketch_km"] += path_km(sk)
            cur = (cur[:-1] if cur else []) + sk
        if cur:
            chains.append(cur)
    chains = [simplify(c) for c in chains if len(c) >= 2]
    devs = sorted(d for d, _ in stats["dev"])
    med = devs[len(devs) // 2] if devs else 0.0
    far = sorted(((d, n) for d, n in stats["dev"] if d > 0.3), reverse=True)
    seen, far_u = set(), []
    for d, n in far:
        if n not in seen:
            seen.add(n)
            far_u.append(f"{n} {d*1000:.0f}m")
    if verbose:
        print(f"{lid:40s} {'OK ' if ok else '실패'} 조각 {len(chains)} · 선로 {stats['track_km']:.1f}km"
              f" · 개략 {stats['sketch_km']:.1f}km · 점 {sum(len(c) for c in chains)} · 역 중앙오차 {med*1000:.0f}m")
        for r in report[:12]:
            print("      -", r)
        if far_u:
            print("      역이 선에서 300m 넘게:", ", ".join(far_u[:8]))
    return {"chains": chains, "ok": ok, "report": report, "median_km": med,
            "track_km": stats["track_km"], "sketch_km": stats["sketch_km"], "far": far_u}


def main(argv):
    apply = "--apply" in argv
    only = [a for a in argv[1:] if not a.startswith("--")]
    ways = json.loads(WAYS.read_text("utf8"))
    data = json.loads(LINES_PATH.read_text("utf8"))
    st = json.loads(STATIONS.read_text("utf8"))["features"]
    feats = {f["properties"]["id"]: f for f in data["features"]}
    graphs, changed = {}, 0
    for lid, cfg in LINES.items():
        if only and lid not in only:
            continue
        if lid not in feats:
            print(f"{lid:40s} lines.geojson 에 없음")
            continue
        res = build_line(lid, cfg, ways, st, graphs)
        if apply and res["ok"] and res["chains"]:
            f = feats[lid]
            ch = res["chains"]
            f["geometry"] = ({"type": "LineString", "coordinates": ch[0]} if len(ch) == 1
                             else {"type": "MultiLineString", "coordinates": ch})
            p = f["properties"]
            if res["sketch_km"] > 0 and res["track_km"] > 0:
                src, note = "own+osm", "선형: 선로가 있는 구간은 OpenStreetMap(ODbL), 없는 구간은 역을 이은 개략선(자체 작성)"
            elif res["sketch_km"] > 0:
                src, note = "own", "선형: 역과 역을 이은 개략선(자체 작성) — 실제 선로 모양이 아님"
            else:
                src, note = "osm", "선형: OpenStreetMap(ODbL) 선로를 따라 이음"
                if res["median_km"] > 0:
                    note += f" — 역 대조 중앙 오차 {res['median_km']*1000:.0f}m"
            p["coord_source"] = src
            p["coord_method"] = "own-align"
            if cfg.get("note"):
                note = cfg["note"] + " · " + note
            p["note"] = note
            p["variants"] = len(ch)
            changed += 1
    if apply:
        LINES_PATH.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), "utf8")
        print(f"\n반영 {changed}개 노선 → {LINES_PATH.name}")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main(sys.argv))
