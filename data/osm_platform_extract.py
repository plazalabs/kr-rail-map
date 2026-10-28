"""OSM PBF 에서 노선별 정차점(stop_position) 좌표를 뽑는다.

왜 필요한가
-----------
환승 소요시간을 지금은 '1회당 4분' 으로 고정해 쓰고 있다. 그런데 신도림
1↔2호선과 동대문 1↔4호선은 실제로 걷는 거리가 다르다. OSM 노선 relation 에는
정차점이 **순서대로** 들어 있어서, 같은 역에서 노선 A 의 정차점과 노선 B 의
정차점 사이 거리를 잴 수 있다.

입력  data/_osm/route_rels.json   (osm_pbf_extract.py 가 만든 노선 relation)
      data/_osm/south-korea.osm.pbf
출력  data/_osm/stops.json        {node_id: {lon, lat, name, ref, route}}
"""
import json
import pathlib
import sys

try:
    import osmium
except ImportError:                     # pragma: no cover
    print("osmium 이 필요합니다: pip install osmium", file=sys.stderr)
    raise

ROOT = pathlib.Path(__file__).resolve().parent
OSM = ROOT / "_osm"
PBF = OSM / "south-korea.osm.pbf"
RELS = OSM / "route_rels.json"
OUT = OSM / "stops.json"

RAIL_ROUTES = ("subway", "train", "light_rail", "monorail", "tram")


def wanted_nodes():
    """노선 relation 이 'stop' 역할로 참조하는 노드 id → 소속 relation 목록."""
    rels = json.loads(RELS.read_text("utf8"))
    want = {}
    for rid, rel in rels.items():
        if rel["tags"].get("route") not in RAIL_ROUTES:
            continue
        for m in rel["members"]:
            if m[0] == "n" and m[2] in ("stop", "stop_entry_only", "stop_exit_only"):
                want.setdefault(m[1], []).append(rid)
    return want


def main():
    want = wanted_nodes()
    print(f"노선 relation 이 참조하는 정차점 {len(want)}개")

    found = {}

    class Handler(osmium.SimpleHandler):
        def node(self, o):
            if o.id not in want:
                return
            t = o.tags
            found[o.id] = {
                "lon": round(o.location.lon, 6),
                "lat": round(o.location.lat, 6),
                "name": t.get("name:ko") or t.get("name") or "",
                "ref": t.get("ref") or "",
                "railway": t.get("railway") or "",
                "pt": t.get("public_transport") or "",
                "rels": want[o.id],
            }

    Handler().apply_file(str(PBF))
    OUT.write_text(json.dumps(found, ensure_ascii=False), "utf8")

    named = sum(1 for v in found.values() if v["name"])
    print(f"좌표를 찾은 정차점 {len(found)}/{len(want)} (이름 있음 {named})")
    print(f"→ {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024}KB)")


if __name__ == "__main__":
    main()
