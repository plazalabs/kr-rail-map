#!/usr/bin/env python3
"""한국 철도 노선/역 데이터 파이프라인.

입력: Geofabrik 남한 PBF (data/raw/south-korea-*.osm.pbf)
출력: data/lines.geojson, data/stations.geojson
라이선스: 입력 데이터 © OpenStreetMap contributors, ODbL

실행: python3 data/build_data.py
"""
import json
import math
import os
import re
import sys
from collections import defaultdict

import osmium

BASE = os.path.dirname(os.path.abspath(__file__))
RAW_DIR = os.path.join(BASE, "raw")
OUT_LINES = os.path.join(BASE, "lines.geojson")
OUT_STATIONS = os.path.join(BASE, "stations.geojson")

ROUTE_VALUES = {"railway", "subway", "light_rail", "monorail", "tram", "train"}
STATION_RAILWAY_VALUES = {"station", "halt"}

# 북한 노선 제외 (스펙: 남한 전체, 북한 노선 제외)
#  - 평부선: 전 구간 북한 (평양~개성)
#  - 금강산청년선: 위도 38.61~38.63, 휴전선 이북
#  - 금강산선: 위도 38.24~38.35, 휴전선 일대 구선(폐선)
#  - 구 경원선: 위도 38.23~38.36, 휴전선 일대 구선(폐선)
NK_NAME_PATTERNS = ("평부선", "금강산청년선", "금강산선", "구 경원선")


def slugify(s):
    s = (s or "").lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    s = re.sub(r"-{2,}", "-", s)
    return s


def norm_color(c):
    if not c:
        return None
    c = c.strip().lstrip("#")
    if re.fullmatch(r"[0-9a-fA-F]{6}", c):
        return "#" + c.upper()
    if re.fullmatch(r"[0-9a-fA-F]{3}", c):
        return "#" + "".join(ch * 2 for ch in c).upper()
    return None


# ---------------------------------------------------------------- pass 1
class RelationCollector(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.relations = {}          # rel_id -> {"tags": dict, "ways": [...], "nodes": [...]}
        self.way_ids = set()
        self.n_route_train = 0
        self.n_disused = 0
        self.n_north_korea = 0

    def relation(self, r):
        tags = {k: v for k, v in r.tags}
        if tags.get("type") != "route":
            return
        rv = tags.get("route")
        if rv not in ROUTE_VALUES:
            return
        if rv == "train":
            self.n_route_train += 1
        nm = tags.get("name:ko") or tags.get("name") or ""
        if any(p in nm for p in NK_NAME_PATTERNS):
            self.n_north_korea += 1
            return
        if "폐선" in nm:  # 태그에 disused 표시 없이 이름에만 '폐선'이 있는 구간
            self.n_disused += 1
            return
        if (tags.get("railway") == "disused" or tags.get("disused") == "yes"
                or tags.get("abandoned") == "yes"):
            self.n_disused += 1
            return
        ways = [m.ref for m in r.members if m.type == "w"]
        nodes = [m.ref for m in r.members if m.type == "n"]
        self.relations[r.id] = {"tags": tags, "ways": ways, "nodes": nodes}
        self.way_ids.update(ways)


# ---------------------------------------------------------------- pass 2
# 필요한 노드 id만 수집 (way 멤버 노드) + 역 노드 수집. 위치 인덱스 불필요.
class MemberNodeCollector(osmium.SimpleHandler):
    def __init__(self, way_ids):
        super().__init__()
        self.way_ids = way_ids
        self.needed_nodes = set()
        self.stations = []           # {"id","lon","lat","tags"}

    def node(self, n):
        if not n.location.valid():
            return
        tags = {k: v for k, v in n.tags}
        if tags.get("railway") in STATION_RAILWAY_VALUES:
            self.stations.append({
                "id": n.id,
                "lon": n.location.lon,
                "lat": n.location.lat,
                "tags": tags,
            })

    def way(self, w):
        if w.id not in self.way_ids:
            return
        for nd in w.nodes:
            self.needed_nodes.add(nd.ref)


# ---------------------------------------------------------------- pass 3
class GeometryBuilder(osmium.SimpleHandler):
    def __init__(self, way_ids, needed_nodes):
        super().__init__()
        self.way_ids = way_ids
        self.loc = {}
        self._needed = needed_nodes
        self.geoms = {}              # way_id -> [(lon, lat), ...]

    def node(self, n):
        if n.id in self._needed and n.location.valid():
            self.loc[n.id] = (round(n.location.lon, 6), round(n.location.lat, 6))

    def way(self, w):
        if w.id not in self.way_ids:
            return
        coords = []
        for nd in w.nodes:
            c = self.loc.get(nd.ref)
            if c:
                coords.append(c)
        if len(coords) >= 2:
            self.geoms[w.id] = coords


# ---------------------------------------------------------------- geometry chaining
def chain_segments(segs):
    parts = [list(s) for s in segs if len(s) >= 2]
    chains = []
    while parts:
        cur = parts.pop(0)
        extended = True
        while extended:
            extended = False
            for i, s in enumerate(parts):
                if cur[-1] == s[0]:
                    cur = cur + s[1:]
                elif cur[-1] == s[-1]:
                    cur = cur + s[-2::-1]
                elif cur[0] == s[-1]:
                    cur = s[:-1] + cur
                elif cur[0] == s[0]:
                    cur = s[:0:-1] + cur
                else:
                    continue
                parts.pop(i)
                extended = True
                break
        chains.append(cur)
    return chains


# ---------------------------------------------------------------- line classification
def make_line_id(rel_id, tags, used):
    net = tags.get("network") or tags.get("operator") or ""
    ref = tags.get("ref") or ""
    cand = slugify(f"{net} {ref}") if ref else ""
    if not cand:
        cand = slugify(tags.get("name:en") or "")
    if not cand:
        cand = f"r{rel_id}"
    base, i = cand, 2
    while cand in used:
        cand = f"{base}-{i}"
        i += 1
    used.add(cand)
    return cand


def classify_category(tags, name_ko, name_en):
    rv = tags.get("route")
    if rv == "subway":
        return "metro"
    if rv in ("light_rail", "monorail", "tram"):
        return "urban"
    if rv == "train":
        # 고속철도 서비스(KTX/SRT/고속선 자체)는 ktx, 나머지는 conventional
        blob = " ".join([name_ko or "", name_en or "",
                         tags.get("network") or ""]).lower()
        if "고속" in (name_ko or "") or "ktx" in blob or "srt" in blob:
            return "ktx"
        return "conventional"
    # route=railway: KTX/고속선 판별
    blob = " ".join([name_ko or "", name_en or "", tags.get("ref") or ""]).lower()
    if "고속" in (name_ko or "") or "high-speed" in (name_en or "").lower() \
            or "high speed" in (name_en or "").lower() \
            or "ktx" in blob or "srt" in blob:
        return "ktx"
    return "conventional"


def classify_status(tags, name_ko):
    if tags.get("state") == "proposed":
        return "planned"
    if "construction" in tags:
        return "construction"
    nm = name_ko or ""
    if "공사" in nm or "예정" in nm or "미개통" in nm:
        return "construction"
    return "open"


# ---------------------------------------------------------------- main
def main():
    pbf_files = [f for f in os.listdir(RAW_DIR) if f.endswith(".osm.pbf")]
    if not pbf_files:
        sys.exit("PBF not found in " + RAW_DIR)
    pbf = os.path.join(RAW_DIR, sorted(pbf_files)[0])
    print(f"[1/4] pass 1: collecting route relations from {os.path.basename(pbf)}", flush=True)
    rc = RelationCollector()
    rc.apply_file(pbf)
    print(f"      relations kept: {len(rc.relations)} "
          f"(route=train 중 {rc.n_route_train}, disused 제외 {rc.n_disused}, "
          f"북한 제외 {rc.n_north_korea})", flush=True)

    print("[2/5] pass 2: collecting member node ids + station nodes", flush=True)
    mc = MemberNodeCollector(rc.way_ids)
    mc.apply_file(pbf)
    print(f"      needed nodes: {len(mc.needed_nodes)}, station nodes: {len(mc.stations)}",
          flush=True)

    print("[3/5] pass 3: building way geometries", flush=True)
    gb = GeometryBuilder(rc.way_ids, mc.needed_nodes)
    gb.apply_file(pbf)
    geoms = gb.geoms
    stations_raw = mc.stations
    print(f"      ways with geometry: {len(geoms)} / {len(rc.way_ids)}", flush=True)

    print("[4/5] assembling lines", flush=True)
    used_ids = set()
    lines = []
    colorless = []
    no_geom = 0
    status_counter = defaultdict(int)
    cat_counter = defaultdict(int)
    relid_to_lineid = {}
    for rel_id in sorted(rc.relations):
        info = rc.relations[rel_id]
        tags = info["tags"]
        segs = [geoms[w] for w in info["ways"] if w in geoms]
        if not segs:
            no_geom += 1
            continue
        chains = chain_segments(segs)
        name_ko = tags.get("name:ko") or tags.get("name")
        name_en = tags.get("name:en")
        if not name_ko:
            no_geom += 1  # 이름 없는 노선도 제외 (카운트만)
            continue
        line_id = make_line_id(rel_id, tags, used_ids)
        color = norm_color(tags.get("colour") or tags.get("color"))
        if color is None:
            colorless.append(line_id)
        category = classify_category(tags, name_ko, name_en)
        status = classify_status(tags, name_ko)
        status_counter[status] += 1
        cat_counter[category] += 1
        relid_to_lineid[rel_id] = line_id
        geom = ({"type": "LineString", "coordinates": chains[0]}
                if len(chains) == 1
                else {"type": "MultiLineString", "coordinates": chains})
        lines.append({
            "type": "Feature",
            "geometry": geom,
            "properties": {
                "id": line_id,
                "name_ko": name_ko,
                "name_en": name_en,
                "color": color,
                "category": category,
                "status": status,
            },
        })
    print(f"      lines written: {len(lines)}, no geometry/name skipped: {no_geom}", flush=True)

    print("[5/5] attributing stations", flush=True)
    node_to_lines = defaultdict(list)
    for rel_id, info in rc.relations.items():
        lid = relid_to_lineid.get(rel_id)
        if not lid:
            continue
        for nid in info["nodes"]:
            node_to_lines[nid].append(lid)

    # fallback proximity index: grid over all line coords
    CELL = 0.02
    grid = defaultdict(list)  # (cx, cy) -> [(lon, lat, line_id)]
    for feat in lines:
        lid = feat["properties"]["id"]
        g = feat["geometry"]
        coord_lists = [g["coordinates"]] if g["type"] == "LineString" else g["coordinates"]
        for ring in coord_lists:
            for lon, lat in ring:
                grid[(math.floor(lon / CELL), math.floor(lat / CELL))].append((lon, lat, lid))

    def nearest_line(lon, lat, max_deg=0.005):
        cx, cy = math.floor(lon / CELL), math.floor(lat / CELL)
        best, best_d2 = None, max_deg * max_deg
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for plon, plat, lid in grid.get((cx + dx, cy + dy), ()):
                    d2 = (plon - lon) ** 2 + (plat - lat) ** 2
                    if d2 < best_d2:
                        best, best_d2 = lid, d2
        return best

    stations = []
    n_fallback = 0
    n_unassigned = 0
    n_noname = 0
    for st in stations_raw:
        tags = st["tags"]
        name_ko = tags.get("name:ko") or tags.get("name")
        name_en = tags.get("name:en")
        if not name_ko:
            n_noname += 1
            continue
        line_ids = node_to_lines.get(st["id"], [])
        if not line_ids:
            fb = nearest_line(st["lon"], st["lat"])
            if fb:
                line_ids = [fb]
                n_fallback += 1
            else:
                n_unassigned += 1
        stations.append({
            "type": "Feature",
            "geometry": {"type": "Point",
                         "coordinates": [round(st["lon"], 6), round(st["lat"], 6)]},
            "properties": {
                "id": f"st-{st['id']}",
                "name_ko": name_ko,
                "name_en": name_en,
                "line_id": line_ids[0] if line_ids else None,
                "lines": line_ids,
            },
        })

    with open(OUT_LINES, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": lines}, f, ensure_ascii=False)
    with open(OUT_STATIONS, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": stations}, f, ensure_ascii=False)

    summary = {
        "pbf": os.path.basename(pbf),
        "relations_kept": len(rc.relations),
        "route_train_included": rc.n_route_train,
        "disused_excluded": rc.n_disused,
        "north_korea_excluded": rc.n_north_korea,
        "lines": len(lines),
        "lines_no_geometry_or_name": no_geom,
        "category": dict(cat_counter),
        "status": dict(status_counter),
        "colorless_lines": sorted(colorless),
        "stations": len(stations),
        "stations_fallback_attributed": n_fallback,
        "stations_unassigned": n_unassigned,
        "stations_no_name_skipped": n_noname,
        "lines_file": OUT_LINES,
        "stations_file": OUT_STATIONS,
    }
    print("SUMMARY_JSON:" + json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
