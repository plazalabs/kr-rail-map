#!/usr/bin/env python3
"""OSM route relation 을 받아 선형으로 바꾸고, 우리 역들과 대조하는 공용 도구.

왜 이걸 쓰나
------------
지도에 그린 노선 선형이 철도맘(chul.mom) 그림을 참고한 것이라 상업적 재사용
허락이 확인되지 않았다. OSM 은 ODbL 이라 상업적 이용이 명시적으로 허용된다.
선의 출처만 바꾸면 유료화의 법적 장애가 사라진다.

핵심 아이디어
-------------
route relation 은 way 를 **순서대로** 담고 있고, Overpass 의 `out geom` 은
각 way 의 좌표를 그 자리에서 준다. 그래서 way 를 받아 순서대로 이어붙이면
선형이 그대로 나온다. 노선 하나에 way 가 수백 개라 손으로 잇는 건 불가능하다.

검증 없이는 절대 반영하지 않는다
--------------------------------
OSM 데이터도 틀릴 수 있다. relation 이 노선 일부만 담고 있거나, 다른 노선이
섞여 있거나, 아예 다른 동네일 수도 있다. 그래서 **우리 역들이 그 선 위에
있는지**를 재서 통과한 것만 쓴다. 길이만 보면 '짧지만 엉뚱한 선'을 통과시킨다.
"""
import json
import math
import pathlib
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / "data" / "_osm_align"
CACHE.mkdir(parents=True, exist_ok=True)

HOSTS = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]
UA = "kr-rail-map/1.0 (licence migration; ODbL attribution)"
R = 6371.0088  # km


# ─────────────────────────── 거리 계산 ───────────────────────────

def hav(a, b):
    """두 [lon,lat] 사이 거리(km)."""
    r = math.pi / 180.0
    dlat = (b[1] - a[1]) * r
    dlon = (b[0] - a[0]) * r
    h = (math.sin(dlat / 2) ** 2 +
         math.cos(a[1] * r) * math.cos(b[1] * r) * math.sin(dlon / 2) ** 2)
    return R * 2 * math.asin(math.sqrt(min(1.0, h)))


def seg_km(p, a, b):
    """점 p 에서 선분 ab 까지의 거리(km). 경도는 위도에 따라 좁아지므로 보정한다."""
    lat0 = math.radians((a[1] + b[1]) / 2.0)
    kx = math.cos(lat0) * 111.320
    ky = 110.574

    def xy(q):
        return (q[0] * kx, q[1] * ky)

    px, py = xy(p)
    ax, ay = xy(a)
    bx, by = xy(b)
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def length_km(chains):
    return sum(hav(c[i], c[i + 1]) for c in chains for i in range(len(c) - 1))


def pt_to_chains(p, chains):
    """점에서 선형 전체까지 최단거리(km)."""
    best = float("inf")
    for c in chains:
        for i in range(len(c) - 1):
            d = seg_km(p, c[i], c[i + 1])
            if d < best:
                best = d
    return best


# ─────────────────────────── Overpass ───────────────────────────

def _post(query, tag):
    last = None
    for host in HOSTS:
        try:
            req = urllib.request.Request(
                host,
                data=urllib.parse.urlencode({"data": query}).encode(),
                headers={"User-Agent": UA},
            )
            raw = urllib.request.urlopen(req, timeout=600).read()
            d = json.loads(raw.decode("utf8"))
        except Exception as e:                       # noqa: BLE001 — 미러마다 실패 방식이 다르다
            last = f"{host.split('/')[2]}: {type(e).__name__} {str(e)[:90]}"
            print(f"    미러 실패 {last}")
            continue
        # Overpass 는 자체 타임아웃이 나면 **받은 데까지**를 HTTP 200 + 정상 JSON 으로
        # 돌려주고 remark 에 그 사실을 적는다. 이걸 그냥 쓰면 노선 절반이 사라진
        # 선형이 만들어진다 — 경의·중앙선이 13km(실제 130km)로 나왔다. 반드시 거른다.
        remark = (d.get("remark") or "").strip()
        if remark:
            last = f"{host.split('/')[2]}: 부분응답({remark[:80]})"
            print(f"    부분응답 폐기 {last}")
            continue
        return d
    raise RuntimeError(f"Overpass 실패 ({tag}): {last}")


def fetch_relations(ids, batch=6, force=False):
    """relation id 목록의 기하를 받아 온다. 배치 단위로 디스크에 캐시한다.

    한 번에 다 받으면 응답이 수십 MB 가 되어 Overpass 가 끊는다. 6개씩 끊어
    받고 캐시하면, 중간에 실패해도 받은 것까지는 남는다.
    """
    ids = [int(i) for i in dict.fromkeys(ids)]
    out = {}
    todo = []
    for i in ids:
        f = CACHE / f"rel_{i}.json"
        if f.exists() and not force:
            try:
                out[i] = json.loads(f.read_text("utf8"))
                continue
            except Exception:                        # noqa: BLE001 — 깨진 캐시는 다시 받는다
                pass
        todo.append(i)

    for n in range(0, len(todo), batch):
        chunk = todo[n:n + batch]
        t0 = time.time()
        try:
            q = "[out:json][timeout:600];rel(id:%s);out geom;" % ",".join(str(i) for i in chunk)
            d = _post(q, f"batch {n // batch + 1}")
            got = {e["id"]: e for e in d.get("elements", [])}
        except RuntimeError as e:
            # 배치가 크면 Overpass 가 타임아웃한다. 하나씩 다시 받는다.
            # 부분응답은 _post 가 이미 걸러내므로 여기 오는 건 '아예 실패'다.
            print(f"    배치 실패 → 하나씩 재시도: {str(e)[:70]}")
            got = {}
            for i in chunk:
                try:
                    q1 = "[out:json][timeout:600];rel(%d);out geom;" % i
                    d1 = _post(q1, f"rel {i}")
                    for e in d1.get("elements", []):
                        got[e["id"]] = e
                except RuntimeError as e1:
                    print(f"      rel {i} 실패 {str(e1)[:60]}")
        for i in chunk:
            if i in got:
                (CACHE / f"rel_{i}.json").write_text(
                    json.dumps(got[i], ensure_ascii=False), "utf8")
                out[i] = got[i]
            else:
                print(f"    relation {i} 응답에 없음")
        print(f"    배치 {n // batch + 1}: {len(chunk)}개 중 {len([i for i in chunk if i in got])}개 "
              f"{time.time() - t0:.0f}초")
    return out


# ─────────────────────────── 선형 조립 ───────────────────────────

TOL_JOIN = 0.05  # km. way 끝점이 이 안이면 이어진 것으로 본다(같은 노드를 공유하면 0).


def chain_segments(ways):
    """way 좌표 목록들을 순서대로 이어붙여 폴리라인 목록을 만든다.

    route relation 의 members 는 경로 순서대로 들어 있지만, 일부는 방향이
    뒤집혀 있거나(왕복을 한 relation 에 담은 경우) 중간에 끊긴다. 그래서
    '현재 끝점에서 가장 가까운 way'를 골라 방향을 맞춰 붙인다. 끝점이
    어디에도 안 붙으면 거기서 끊고 새 조각을 시작한다.
    """
    if not ways:
        return []
    chains = []
    cur = list(ways[0])
    rest = [list(w) for w in ways[1:]]
    while rest:
        end = cur[-1]
        best_i, best_d, flip = None, None, False
        for i, w in enumerate(rest):
            d0 = hav(end, w[0])
            d1 = hav(end, w[-1])
            if best_d is None or d0 < best_d:
                best_i, best_d, flip = i, d0, False
            if d1 < best_d:
                best_i, best_d, flip = i, d1, True
        if best_d is None or best_d > TOL_JOIN:
            chains.append(cur)
            cur = rest.pop(0)
            continue
        w = rest.pop(best_i)
        if flip:
            w = w[::-1]
        cur = cur + w[1:]
    chains.append(cur)
    return [c for c in chains if len(c) >= 2]


def dedupe_chains(chains, tol_km=0.15, frac=0.90):
    """같은 선로를 두 번 그린 조각을 버린다.

    상행·하행 선로는 OSM 에서 **서로 다른 way** 다. 두 방향 relation 을 모두
    받으면 선형 길이가 2배가 된다 — 경춘선이 81km 인데 170km 로 나왔다.
    way id 로 중복을 걸러도 방향이 다르면 못 잡는다.

    긴 조각부터 남기고, 이미 남은 조각 위에 90% 이상 겹치는 조각은 버린다.
    """
    kept = []
    for c in sorted(chains, key=lambda x: -length_km([x])):
        if not kept:
            kept.append(c)
            continue
        step = max(1, len(c) // 40)
        pts = c[::step]
        near = sum(1 for p in pts if pt_to_chains(p, kept) <= tol_km)
        if near / len(pts) < frac:
            kept.append(c)
    return kept


def chains_from_relation(rel):
    """Overpass `out geom` 응답의 relation → 폴리라인 목록."""
    ways = []
    for m in rel.get("members") or []:
        if m.get("type") != "way":
            continue
        if (m.get("role") or "") not in ("", "forward", "backward"):
            continue
        g = m.get("geometry") or []
        if len(g) < 2:
            continue
        ways.append([[p["lon"], p["lat"]] for p in g])
    return chain_segments(ways)


# ─────────────────────────── 채점 ───────────────────────────

def score(chains, pts, tol_km=0.30):
    """후보 선형이 우리 역들을 얼마나 잘 지나가는지 잰다.

    반환: (커버율, 최대이탈km, 중앙이탈km)
      커버율 = tol 안에 들어오는 역의 비율
    길이만 맞고 엉뚱한 곳을 지나는 선을 거르기 위한 검사다.
    """
    if not chains or not pts:
        return 0.0, float("inf"), float("inf")
    ds = sorted(pt_to_chains(p, chains) for p in pts)
    inside = sum(1 for d in ds if d <= tol_km)
    return inside / len(ds), ds[-1], ds[len(ds) // 2]
