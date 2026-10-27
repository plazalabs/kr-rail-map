#!/usr/bin/env python3
"""한국 OSM 원본(PBF)에서 철도 way 와 노선 relation 을 뽑아 캐시로 만든다.

왜 원본을 받나
--------------
Overpass 로 relation 을 하나씩 받으면 2개에 10분씩 걸렸고, 타임아웃이 나면
**부분 응답을 정상 JSON 처럼** 돌려줬다 (경의·중앙선이 130km 인데 13km 로
나왔다). 원본 290MB 를 한 번 받아 로컬에서 처리하면 84개 노선을 한 번에,
같은 결과로, 몇 분 만에 얻는다. 남의 서버 사정에 결과가 흔들리지 않는다는
점이 속도보다 중요하다.

출력 (모두 gitignore 대상 캐시)
  data/_osm/rail_ways.json   {way_id: {tags, nodes, coords}}
  data/_osm/route_rels.json  {rel_id: {tags, members}}

실행
----
  python data/osm_pbf_extract.py
"""
import json
import pathlib
import sys
import time

import osmium

ROOT = pathlib.Path(__file__).resolve().parent.parent
PBF = ROOT / "data" / "_osm" / "south-korea.osm.pbf"
WAYS = ROOT / "data" / "_osm" / "rail_ways.json"
RELS = ROOT / "data" / "_osm" / "route_rels.json"

# 선로로 볼 railway 값. monorail·tram 도 우리 노선(월미바다열차 등)에 필요하다.
RAIL = {"rail", "subway", "light_rail", "narrow_gauge", "monorail", "tram",
        "preserved", "construction", "proposed"}
ROUTE = {"train", "subway", "light_rail", "tram", "monorail"}

KEEP_WAY_TAGS = ("name", "ref", "railway", "usage", "service", "tunnel", "bridge")
KEEP_REL_TAGS = ("name", "ref", "route", "network", "from", "to", "colour",
                 "operator", "service", "wikidata")


class Pass1(osmium.SimpleHandler):
    """way 와 relation 을 모으고, 필요한 node id 를 모은다."""

    def __init__(self):
        super().__init__()
        self.ways = {}
        self.rels = {}
        self.need = set()

    def way(self, o):
        rv = o.tags.get("railway")
        if rv not in RAIL:
            return
        tags = {k: o.tags[k] for k in KEEP_WAY_TAGS if k in o.tags}
        refs = [n.ref for n in o.nodes]
        if len(refs) < 2:
            return
        self.ways[o.id] = {"tags": tags, "nodes": refs}
        self.need.update(refs)

    def relation(self, o):
        if o.tags.get("route") not in ROUTE:
            return
        tags = {k: o.tags[k] for k in KEEP_REL_TAGS if k in o.tags}
        # osmium 의 m.type 은 'n'/'w'/'r' 한 글자다. 그대로 저장하면 나중에
        # 'way' 로 비교하는 코드가 전부 빗나가서 relation 이 통째로 비어 보인다.
        kind = {"n": "node", "w": "way", "r": "relation"}
        members = [[kind.get(m.type, m.type), m.ref, m.role or ""] for m in o.members]
        self.rels[o.id] = {"tags": tags, "members": members}


class Pass2(osmium.SimpleHandler):
    def __init__(self, need):
        super().__init__()
        self.need = need
        self.coords = {}

    def node(self, o):
        if o.id in self.need and o.location.valid():
            self.coords[o.id] = [round(o.location.lon, 6), round(o.location.lat, 6)]


def main():
    if not PBF.exists():
        print(f"원본이 없습니다: {PBF}")
        print("  curl -L -o data/_osm/south-korea.osm.pbf "
              "https://download.geofabrik.de/asia/south-korea-latest.osm.pbf")
        return 1

    t0 = time.time()
    p1 = Pass1()
    p1.apply_file(str(PBF))
    print(f"1단계 {time.time() - t0:.0f}초 — 철도 way {len(p1.ways):,}개, "
          f"route relation {len(p1.rels):,}개, 필요한 점 {len(p1.need):,}개")

    t1 = time.time()
    p2 = Pass2(p1.need)
    p2.apply_file(str(PBF))
    print(f"2단계 {time.time() - t1:.0f}초 — 좌표 {len(p2.coords):,}개")

    missing = 0
    for wid, w in p1.ways.items():
        c = [p2.coords[r] for r in w["nodes"] if r in p2.coords]
        # 좌표를 못 찾은 점이 있으면 선로가 끊긴다. 그 way 는 버린다.
        if len(c) != len(w["nodes"]):
            missing += 1
            continue
        w["coords"] = c
        del w["nodes"]
    if missing:
        print(f"좌표 없는 점이 있어 버린 way {missing:,}개")

    WAYS.write_text(json.dumps({str(k): v for k, v in p1.ways.items() if "coords" in v},
                               ensure_ascii=False, separators=(",", ":")), "utf8")
    RELS.write_text(json.dumps({str(k): v for k, v in p1.rels.items()},
                               ensure_ascii=False, separators=(",", ":")), "utf8")
    print(f"저장: {WAYS.name} {WAYS.stat().st_size / 1e6:.0f}MB · "
          f"{RELS.name} {RELS.stat().st_size / 1e6:.1f}MB · 총 {time.time() - t0:.0f}초")
    return 0


if __name__ == "__main__":
    sys.exit(main())
