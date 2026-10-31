"""고립된 역에, 300m 안으로 지나가는 노선을 붙인다.

왜 필요한가
  도심 접근성(`data/access.json`)에 **116역이 아예 없다.** 13개 노선이다 —
  경전선 32 · 태백선 21 · 장항선 18 · 경북선 10 · KTX 중부내륙 8 · 정선선 6 …

  처음엔 선형이 개략선이라 역이 선에서 멀어서 빠진 줄 알았다. **아니었다.**
  빠진 역은 모두 제 선형에서 0.4km 안에 있다. 진짜 원인은 그 노선들이
  **다른 노선과 역을 하나도 공유하지 않는다**는 것이다 — 그래프에서 섬이 된다.

  예: 삼랑진은 경전선 역으로만 들어 있고 **경부선 역 목록에 아예 없다.**
  실제로는 경부선 열차가 다 서는 역이고, 경부선 선형은 삼랑진에서 0.01km
  떨어져 지나간다. 그런데 역 목록에 없으니 경전선 전체가 서울과 안 이어진다.

무엇을 하나
  **도달 불가로 판정된 역만** 본다. 그 역 좌표에서 300m 안으로 지나가는
  노선이 있으면 그 노선을 역의 `lines` 에 더한다. 300m 는 build_membership.py
  가 '독립 확인'으로 인정하는 기준과 같다(osm-geometry).

  왜 고립된 역만 보나: 전 역을 훑으면 후보가 **488쌍** 나온다. 대부분은
  GTX·KTX 선형이 지나가기만 하는 역이라(정차하지 않음) 붙이면 없는 환승이
  생긴다. 반면 고립된 역은 붙여서 손해 볼 게 없다 — 지금은 아무 데도 못 간다.

  실제로 붙는 곳(2026-11-01): 충주·김천·장항·삼랑진·제천·홍성 — 모두 실제
  환승역이다. 이 6곳이 13개 노선을 본선에 이어 붙인다.

실행: python data/fix_interchange_lines.py [--dry]
"""
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
# 300m — build_membership.py 가 '독립 확인'으로 인정하는 기준과 같다.
# 더 넓히면 증빙 파일(line-membership.json)과 어긋난다. 실제로 인천공항
# 셔틀트레인 끝점이 터미널 역에서 0.32km 라 350m 로 넓혀 붙여 봤더니
# 확인율 60% 가 되어 테스트가 '이유를 적어라'고 잡았다. 기준을 둘로
# 쪼개지 않고, 셔틀트레인은 공항 내부 이동수단이라 철도망에 잇지 않는다.
NEAR_KM = 0.3


def load(p):
    with open(os.path.join(ROOT, p), encoding="utf-8") as f:
        return json.load(f)


def save(p, obj):
    with open(os.path.join(ROOT, p), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))


def hav(a, b):
    r = math.pi / 180.0
    dlat = (b[1] - a[1]) * r
    dlon = (b[0] - a[0]) * r
    s = (math.sin(dlat / 2) ** 2
         + math.cos(a[1] * r) * math.cos(b[1] * r) * math.sin(dlon / 2) ** 2)
    return 2 * 6371.0 * math.asin(math.sqrt(s))


def dist_km(p, coords):
    """점에서 선형까지 최단거리(km). 국소 평면 근사로 투영한다."""
    best = 1e9
    kx = math.cos(p[1] * math.pi / 180.0) * 111.32
    ky = 110.57
    px, py = p[0] * kx, p[1] * ky
    for i in range(len(coords) - 1):
        a, b = coords[i], coords[i + 1]
        ax, ay = a[0] * kx, a[1] * ky
        bx, by = b[0] * kx, b[1] * ky
        dx, dy = bx - ax, by - ay
        l2 = dx * dx + dy * dy
        t = 0.0 if l2 == 0 else ((px - ax) * dx + (py - ay) * dy) / l2
        t = max(0.0, min(1.0, t))
        d = math.hypot(px - (ax + t * dx), py - (ay + t * dy))
        if d < best:
            best = d
    return best


def pieces_of(feature):
    g = feature["geometry"]
    return [g["coordinates"]] if g["type"] == "LineString" else (g["coordinates"] or [])


def nearest_lines(p, lines, skip):
    out = []
    for f in lines:
        lid = f["properties"]["id"]
        if lid in skip:
            continue
        d = min((dist_km(p, c) for c in pieces_of(f)), default=1e9)
        if d <= NEAR_KM:
            out.append((d, lid))
    return sorted(out)


def main():
    dry = "--dry" in sys.argv
    st = load("data/stations.geojson")
    lines = load("data/lines.geojson")["features"]
    access = load("data/access.json")["stations"]

    feats = st["features"]
    orphan = [f for f in feats if f["properties"]["id"] not in access]
    print("도달 불가 역 %d곳 / 전체 %d곳" % (len(orphan), len(feats)))

    added = []
    # 1단계 — 고립된 역에, 300m 안으로 지나가는 노선을 붙인다.
    for f in orphan:
        own = set(f["properties"].get("lines") or [])
        for d, lid in nearest_lines(f["geometry"]["coordinates"], lines, own):
            own.add(lid)
            f["properties"]["lines"] = sorted(own)
            added.append((f["properties"]["name_ko"], lid, d, "역"))

    # 2단계 — 통째로 고립된 노선은 **이미 연결된 역**에서 붙여야 한다.
    #   장항선이 그렇다. 홍성에서 서해선과 만나지만 둘 다 섬이라 소용이 없고,
    #   본선(경부선)과 만나는 곳은 천안이다. 천안은 이미 잘 가는 역이라
    #   1단계(고립된 역만 본다)에 안 걸린다. 노선 쪽에서 거꾸로 찾아야 한다.
    #
    #   **끝점에서만 붙인다.** 노선이 지나가는 역을 모두 붙이면 경원선이
    #   이촌·서빙고·옥수… 청량리까지 40곳에 달라붙어, 기존 소요시간이
    #   통째로 흔들린다. 고립을 푸는 데 필요한 것은 다리가 하나면 된다.
    by_line = {}
    for f in feats:
        for lid in (f["properties"].get("lines") or []):
            by_line.setdefault(lid, []).append(f)
    reachable = [f for f in feats if f["properties"]["id"] in access]
    for line in lines:
        lid = line["properties"]["id"]
        mine = by_line.get(lid) or []
        if not mine or any(f["properties"]["id"] in access for f in mine):
            continue                      # 이 노선은 이미 본선에 닿아 있다
        # 끝점 하나당 **가장 가까운 역 하나만** 붙인다. 끝점 근처 역을 모두
        # 붙이면 경원선이 용산과 신용산에 동시에 달라붙어, 신용산→여의도가
        # 18분에서 11분으로 줄었다 — 실제로 없는 지름길이 생긴 것이다.
        ends = []
        for c in pieces_of(line):
            if len(c) >= 2:
                ends.extend([c[0], c[-1]])
        for e in ends:
            best = None
            for f in reachable:
                own = set(f["properties"].get("lines") or [])
                if lid in own:
                    continue
                d = hav(f["geometry"]["coordinates"], e)
                if d <= NEAR_KM and (best is None or d < best[0]):
                    best = (d, f)
            if best is None:
                continue
            d, f = best
            own = set(f["properties"].get("lines") or [])
            own.add(lid)
            f["properties"]["lines"] = sorted(own)
            added.append((f["properties"]["name_ko"], lid, d, "노선 끝"))

    if not added:
        print("붙일 노선이 없다. 그대로 둔다.")
        return 0

    print("\n붙인 곳 %d쌍:" % len(added))
    for name, lid, d, why in added:
        print("  %-10s + %-38s %.3fkm  (%s 쪽에서)" % (name, lid, d, why))
    if dry:
        print("\n--dry 라 저장하지 않았다.")
        return 0

    save("data/stations.geojson", st)
    print("\n저장: data/stations.geojson")
    print("다음: node data/build_access.js  (도심 접근성 다시 계산)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
