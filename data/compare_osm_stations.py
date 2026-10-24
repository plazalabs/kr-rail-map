"""OSM 철도역 데이터를 받아 현재 데이터와 대조한다.

왜 이걸 하나:
  공공데이터포털의 역 데이터(국가철도공단·국토교통부)를 확인해보니 역명,
  역번호, 도로명주소, 순번은 있는데 **좌표가 없다**. 노선 선형은 아예 없다.
  그러면 '공공데이터로 전환'만으로는 지도를 그릴 수 없다.

  반면 OSM 은 역 좌표(railway=station)와 선형(railway=rail)을 모두 주고,
  ODbL 이라 상업적 이용이 허용된다(지도로 보여주는 것은 Produced Work).
  이미 출구 좌표를 OSM 에서 받았으므로, 역·선형까지 OSM 으로 통일하면
  라이선스가 한 가지로 정리된다.

  다만 OSM 품질이 지금 데이터만큼 되는지 확인해야 한다. 그걸 여기서 잰다.
"""
import json
import math
import pathlib
import sys
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "_osm_stations_raw.json"

# 출구 받을 때 쓴 것과 같은 상자. 제주·울릉도는 도시철도가 없어 뺀다.
BOX = (34.4, 126.2, 38.5, 129.7)   # south, west, north, east
ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

QUERY = """
[out:json][timeout:300];
(
  node["railway"="station"]({s},{w},{n},{e});
  node["railway"="halt"]({s},{w},{n},{e});
  node["public_transport"="station"]["subway"="yes"]({s},{w},{n},{e});
);
out body;
""".format(s=BOX[0], w=BOX[1], n=BOX[2], e=BOX[3])


def fetch():
    if OUT.exists():
        print("이미 받아둔 파일 사용:", OUT.name)
        return json.loads(OUT.read_text(encoding="utf-8"))
    data = urllib.parse.urlencode({"data": QUERY}).encode()
    last = None
    for url in ENDPOINTS:
        for attempt in range(2):
            try:
                print(f"요청 {url} (시도 {attempt + 1})")
                req = urllib.request.Request(url, data=data,
                                             headers={"User-Agent": "kr-rail-map-audit/1.0"})
                with urllib.request.urlopen(req, timeout=330) as r:
                    raw = json.loads(r.read().decode("utf-8"))
                OUT.write_text(json.dumps(raw, ensure_ascii=False), encoding="utf-8")
                print("받은 노드:", len(raw.get("elements", [])))
                return raw
            except Exception as e:      # noqa: BLE001 - 어떤 실패든 다음 엔드포인트로
                last = e
                print("  실패:", type(e).__name__, str(e)[:120])
                time.sleep(3)
    raise SystemExit(f"OSM 요청 실패: {last}")


R = 6371.0


def hav(ax, ay, bx, by):
    r = math.pi / 180
    dlat = (by - ay) * r
    dlon = (bx - ax) * r
    h = math.sin(dlat / 2) ** 2 + math.cos(ay * r) * math.cos(by * r) * math.sin(dlon / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def norm(name):
    """역명 비교용 정규화 — 괄호·공백·'역' 접미사·가운뎃점을 없앤다."""
    s = (name or "").strip()
    for a, b in [("(", " "), (")", " "), ("·", " "), ("ㆍ", " "), ("-", " ")]:
        s = s.replace(a, b)
    s = s.replace(" ", "")
    if s.endswith("역") and len(s) > 2:
        s = s[:-1]
    return s


def main():
    raw = fetch()
    osm = []
    for el in raw.get("elements", []):
        t = el.get("tags") or {}
        name = t.get("name:ko") or t.get("name") or ""
        if not name:
            continue
        osm.append({
            "id": el["id"],
            "name": name,
            "lat": el["lat"], "lon": el["lon"],
            "railway": t.get("railway", ""),
            "subway": t.get("subway", ""),
            "line": t.get("line", "") or t.get("route_ref", ""),
            "operator": t.get("operator", ""),
        })
    print(f"이름 있는 OSM 역: {len(osm)}")

    stations = json.loads((ROOT / "data" / "stations.geojson").read_text(encoding="utf-8"))
    ours = []
    for f in stations["features"]:
        p = f["properties"]
        c = f["geometry"]["coordinates"]
        ours.append({"id": p["id"], "name": p["name_ko"], "lon": c[0], "lat": c[1],
                     "lines": p.get("lines") or []})
    print(f"우리 역: {len(ours)}")

    # 이름 정규화 인덱스
    by_name = {}
    for o in osm:
        by_name.setdefault(norm(o["name"]), []).append(o)

    matched, dists, no_match = 0, [], []
    for s in ours:
        cands = by_name.get(norm(s["name"]), [])
        best = None
        for o in cands:
            d = hav(s["lon"], s["lat"], o["lon"], o["lat"])
            if best is None or d < best[0]:
                best = (d, o)
        if best and best[0] <= 0.7:      # 700m 안에 같은 이름이 있으면 같은 역으로 본다
            matched += 1
            dists.append(best[0])
        else:
            no_match.append((s["name"], best[0] if best else None))

    # 반대 방향: OSM 에는 있는데 우리에게 없는 역
    our_names = {norm(s["name"]) for s in ours}
    osm_only = [o for o in osm if norm(o["name"]) not in our_names]

    dists.sort()
    print("\n=== 결과 ===")
    print(f"우리 역 {len(ours)}개 중 OSM 에서 확인: {matched} ({matched / len(ours) * 100:.1f}%)")
    if dists:
        print(f"좌표 차이 중앙값 {dists[len(dists) // 2] * 1000:.0f}m  "
              f"p90 {dists[int(len(dists) * 0.9)] * 1000:.0f}m  "
              f"최대 {dists[-1] * 1000:.0f}m")
    print(f"우리에게 없는 OSM 역: {len(osm_only)}")

    print("\n--- 매칭 안 된 우리 역 (상위 25) ---")
    for name, d in no_match[:25]:
        print(f"  {name:<22} {'OSM에 없음' if d is None else f'가장 가까운 동명 {d * 1000:.0f}m'}")

    # OSM 에만 있는 역 중 지하철/철도역만
    extra = [o for o in osm_only if o["railway"] in ("station", "halt")]
    print(f"\n--- OSM 에만 있는 역 (상위 25 / 전체 {len(extra)}) ---")
    for o in extra[:25]:
        print(f"  {o['name']:<22} {o['railway']:<8} {o['subway'] or o['line'] or o['operator']}")

    (ROOT / "data" / "_osm_compare.json").write_text(json.dumps({
        "ours": len(ours), "matched": matched,
        "median_m": round(dists[len(dists) // 2] * 1000) if dists else None,
        "p90_m": round(dists[int(len(dists) * 0.9)] * 1000) if dists else None,
        "max_m": round(dists[-1] * 1000) if dists else None,
        "no_match": [{"name": n, "nearest_m": round(d * 1000) if d else None} for n, d in no_match],
        "osm_only": extra[:400],
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print("\n저장: data/_osm_compare.json")


if __name__ == "__main__":
    sys.exit(main())
