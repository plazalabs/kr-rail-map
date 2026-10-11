#!/usr/bin/env python3
"""PBF에서 철도 선로(way) 추출: 이름 있는 railway=rail/narrow_gauge way 수집.
출력: track_ways.json {name: [[[lon,lat],...], ...]} (way별 linestring 리스트)
"""
import json, sys
import osmium

PBF = '/home/hatch/workspace/kr-rail-map/data/raw/south-korea-261009.osm.pbf'
OUT = '/home/hatch/workspace/kr-rail-map/data/raw/track_ways.json'

class WayCollector(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.ways = {}   # way_id -> (name, [node_ids])
        self.node_ids = set()
    def way(self, w):
        rv = w.tags.get('railway')
        name = w.tags.get('name')
        if rv in ('rail', 'narrow_gauge') and name and len(w.nodes) >= 2:
            self.ways[w.id] = (name, [n.ref for n in w.nodes])
            self.node_ids.update(n.ref for n in w.nodes)

class NodeCollector(osmium.SimpleHandler):
    def __init__(self, need):
        super().__init__()
        self.need = need
        self.coords = {}
    def node(self, n):
        if n.id in self.need and n.location.valid():
            self.coords[n.id] = (n.location.lon, n.location.lat)

def main():
    print('[1/2] collecting railway ways...', flush=True)
    wc = WayCollector()
    wc.apply_file(PBF, locations=False)
    print(f'  ways: {len(wc.ways)}, nodes needed: {len(wc.node_ids)}', flush=True)
    print('[2/2] collecting node coords...', flush=True)
    nc = NodeCollector(wc.node_ids)
    nc.apply_file(PBF, locations=False)
    print(f'  coords: {len(nc.coords)}', flush=True)
    grouped = {}
    missing = 0
    for wid, (name, refs) in wc.ways.items():
        coords = [nc.coords[r] for r in refs if r in nc.coords]
        if len(coords) >= 2:
            grouped.setdefault(name, []).append(coords)
        else:
            missing += 1
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(grouped, f, ensure_ascii=False)
    print(f'wrote {OUT}: {len(grouped)} names, {missing} ways dropped (too few coords)', flush=True)
    # 이름 히스토그램
    hist = sorted(((n, len(v), sum(len(c) for c in v)) for n, v in grouped.items()),
                  key=lambda x: -x[2])
    print('--- top 40 by points ---')
    for n, nw, np_ in hist[:40]:
        print(f'  {n}: {nw} ways, {np_} pts')
    print('--- lines of interest ---')
    for kw in ['정선선', '충북선', '경원선', '중앙선', '동해선', '장항선', '대구선', '경전선', '영동선', '태백선']:
        hit = [(n, len(v)) for n, v in grouped.items() if kw in n]
        print(f'  {kw}: {hit if hit else "없음"}')

if __name__ == '__main__':
    main()
