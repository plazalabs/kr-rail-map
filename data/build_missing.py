#!/usr/bin/env python3
"""누락 노선 보완: 위키백과 역 순서 기반 개략선 생성 + 역 귀속 재지정.
- 신규: 정선선, 충북선, 경원선, 중앙선(재래)
- 교체: 장항선 (단편 -> 전구간 개략선)
- 연장: 동해선 (부산진~부전, 태화강~삼척), 영동선 (강릉역까지)
- 역 귀속: 비어있는 역을 200m 이내 노선에 귀속
"""
import json, math, re, shutil, os
from collections import defaultdict

ROOT = '/home/hatch/workspace/kr-rail-map'
WIKI = json.load(open('/tmp/wiki_final2.json', encoding='utf-8'))

def norm(n):
    n = re.sub(r'\(.*?\)', '', n).strip()
    return n

def load_stations():
    feats = json.load(open(f'{ROOT}/data/stations.geojson', encoding='utf-8'))['features']
    by_name = defaultdict(list)
    for f in feats:
        by_name[norm(f['properties']['name_ko'])].append(f)
    return feats, by_name

def match_chain(wiki_names, by_name):
    """위키 순서대로 매칭. 동명이역은 이전 역과 가장 가까운 후보 선택."""
    result = []  # (wiki_name, feature or None)
    skipped = []
    prev_coord = None
    for wn in wiki_names:
        key = norm(wn)
        if '삼각선' in key and len(key) <= 6 and key != '삼각선':
            skipped.append((wn, '삼각선(분기점) 제외')); continue
        cands = by_name.get(key, [])
        if not cands:
            skipped.append((wn, '데이터에 없음')); continue
        if len(cands) == 1 or prev_coord is None:
            pick = cands[0]
        else:
            def d(f):
                lo, la = f['geometry']['coordinates']
                return math.hypot((lo - prev_coord[0]) * 88.8e3, (la - prev_coord[1]) * 111.2e3)
            pick = min(cands, key=d)
        coord = pick['geometry']['coordinates']
        if prev_coord is not None:
            seg = math.hypot((coord[0] - prev_coord[0]) * 88.8e3, (coord[1] - prev_coord[1]) * 111.2e3)
            if seg > 45000:
                skipped.append((wn, f'이전 역과 {seg/1000:.0f}km — 순서 이상, 제외'))
                continue
        result.append((wn, pick))
        prev_coord = coord
    return result, skipped

def build_linestring(matched):
    return {'type': 'LineString',
            'coordinates': [f['geometry']['coordinates'] for _, f in matched]}

def main():
    feats, by_name = load_stations()
    lines = json.load(open(f'{ROOT}/data/lines.geojson', encoding='utf-8'))['features']
    by_id = {f['properties']['id']: f for f in lines}
    report = []

    specs = [
        # (line_id, name_ko, name_en, color, wiki_key, wiki_list_key, filter_fn)
        ('jeongseon-line', '정선선', 'Jeongseon Line', '#6D4C41',
         WIKI['정선선']['conv'], None),
        ('chungbuk-line', '충북선', 'Chungbuk Line', '#00897B',
         WIKI['충북선']['conv'], None),
        ('gyeongwon-line', '경원선', 'Gyeongwon Line', '#3949AB',
         [w for w in WIKI['경원선']['conv'] if '삼각선' not in w], None),
        ('jungang-line', '중앙선', 'Jungang Line', '#F9A825',
         None, '중앙선-table0'),  # 아래에서 별도 처리
    ]

    # 중앙선 table#0 (48개) — wiki_final2의 conv는 오염됐으므로 별도 추출
    import re as _re
    wt = open('/tmp/중앙선.wiki', encoding='utf-8').read()
    m = _re.search(r'\{\| class="wikitable"', wt)
    start = m.start(); depth = 0
    for mm in _re.finditer(r'(\{\||\|\})', wt[start:]):
        depth += 1 if mm.group(1) == '{|' else -1
        if depth == 0:
            tbl0 = wt[start:start + mm.end()]; break
    jungang = []
    for row in _re.split(r'\n\|-', tbl0):
        if '역명' in row[:600]: continue
        cells = _re.split(r'\n[|!]', row)
        for c in cells[1:]:
            if 'colspan' in c: continue
            mm2 = _re.search(r'\[\[([^|\[\]]+)\|([^|\[\]]+)\]\]', c)
            cand = mm2.group(2).strip() if mm2 else None
            if cand and _re.search(r'[가-힣]', cand) and 1 < len(cand) < 20:
                jungang.append(cand); break

    new_lines = []
    for lid, nko, nen, color, wlist, special in specs:
        if special == '중앙선-table0':
            wlist = jungang
        matched, skipped = match_chain(wlist, by_name)
        geom = build_linestring(matched)
        new_lines.append({
            'type': 'Feature',
            'properties': {
                'id': lid, 'name_ko': nko, 'name_en': nen, 'color': color,
                'category': 'conventional', 'status': 'open', 'variants': 0,
                'note': '개략 선형: OSM에 route relation이 없어 위키백과 역 순서로 연결한 추론 선형 — 실제 선로와 다름',
            },
            'geometry': geom,
        })
        report.append(f'NEW {nko}: 위키 {len(wlist)}역 → 매칭 {len(matched)}역, 스킵 {len(skipped)}')
        for wn, why in skipped:
            report.append(f'    스킵: {wn} ({why})')

    # 장항선 교체 (29역 전구간)
    jh_wiki = WIKI['장항선']['metro']  # 실제로는 전구간 목록
    matched, skipped = match_chain(jh_wiki, by_name)
    jl = by_id['janghang-line'] if 'janghang-line' in by_id else None
    if jl is None:
        # id 찾기
        for f in lines:
            if f['properties'].get('name_ko') == '장항선':
                jl = f; break
    jl['geometry'] = build_linestring(matched)
    jl['properties']['variants'] = 1
    jl['properties']['note'] = '개략 선형: OSM relation이 단편이어서 위키백과 역 순서로 전구간 연결한 추론 선형 — 실제 선로와 다름'
    report.append(f'REPLACE 장항선: 매칭 {len(matched)}역, 스킵 {len(skipped)}')
    for wn, why in skipped: report.append(f'    스킵: {wn} ({why})')

    # 동해선 연장: 부산진~부전 + 태화강~삼척
    dh = next(f for f in lines if f['properties'].get('name_ko') == '동해선')
    dh_wiki = WIKI['동해선']['conv']  # 50개 부산진→삼척
    # 태화강 이후 부분
    idx_tw = next(i for i, w in enumerate(dh_wiki) if norm(w) == '태화강')
    north = dh_wiki[idx_tw:]  # 태화강→삼척
    south = dh_wiki[:3]       # 부산진→부전
    m_north, s_north = match_chain(north, by_name)
    m_south, s_south = match_chain(south, by_name)
    parts = []
    g = dh['geometry']
    parts.extend(g['coordinates'] if g['type'] == 'MultiLineString' else [g['coordinates']])
    if len(m_south) >= 2:
        parts.append([f['geometry']['coordinates'] for _, f in m_south])
    if len(m_north) >= 2:
        parts.append([f['geometry']['coordinates'] for _, f in m_north])
    dh['geometry'] = {'type': 'MultiLineString', 'coordinates': parts}
    dh['properties']['note'] = '북부(태화강~삼척)·남단(부산진~부전)은 개략선: OSM relation이 없어 위키백과 역 순서로 연결한 추론 선형'
    report.append(f'EXTEND 동해선: 남단 {len(m_south)}역, 북부 {len(m_north)}역 매칭')

    # 영동선: 강릉역까지 2.4km 연장
    yd = by_id['yeongdong-line']
    gangneung = next((f for f in feats if f['properties']['name_ko'] == '강릉'), None)
    if gangneung:
        g = yd['geometry']
        mls = g['coordinates'] if g['type'] == 'MultiLineString' else [g['coordinates']]
        # 강릉역에 가장 가까운 part의 끝점에 연결
        glon, glat = gangneung['geometry']['coordinates']
        best, best_i, best_end = 1e18, 0, 0
        for i, part in enumerate(mls):
            for ei, pt in ( (0, part[0]), (-1, part[-1]) ):
                d = math.hypot((pt[0]-glon)*88.8e3, (pt[1]-glat)*111.2e3)
                if d < best: best, best_i, best_end = d, i, ei
        if best < 8000:
            part = mls[best_i]
            if best_end == -1: part.append([glon, glat])
            else: part.insert(0, [glon, glat])
            yd['geometry'] = {'type': 'MultiLineString', 'coordinates': mls}
            report.append(f'EXTEND 영동선: 강릉역까지 {best/1000:.1f}km 연장')

    # lines.geojson 쓰기
    all_lines = lines + new_lines
    shutil.copy(f'{ROOT}/data/lines.geojson', f'{ROOT}/data/lines.geojson.bak1')
    json.dump({'type': 'FeatureCollection', 'features': all_lines},
              open(f'{ROOT}/data/lines.geojson', 'w', encoding='utf-8'), ensure_ascii=False)

    # 역 귀속: 비어있는 역을 200m 이내 노선에 귀속
    def pt_seg(px, py, ax, ay, bx, by):
        kx, ky = 88.8e3, 111.2e3
        px, py, ax, ay, bx, by = px*kx, py*ky, ax*kx, ay*ky, bx*kx, by*ky
        dx, dy = bx-ax, by-ay
        L2 = dx*dx+dy*dy
        t = 0 if L2 == 0 else max(0, min(1, ((px-ax)*dx+(py-ay)*dy)/L2))
        return math.hypot(px-(ax+t*dx), py-(ay+t*dy))
    def line_dist(slon, slat, geom):
        mls = geom['coordinates'] if geom['type'] == 'MultiLineString' else [geom['coordinates']]
        best = 1e18
        for coords in mls:
            for a, b in zip(coords, coords[1:]):
                d = pt_seg(slon, slat, a[0], a[1], b[0], b[1])
                if d < best: best = d
        return best
    geoms = [(f['properties']['id'], f['geometry']) for f in all_lines]
    fixed, still_empty = 0, []
    for f in feats:
        p = f['properties']
        if p.get('lines'): continue
        lon, lat = f['geometry']['coordinates']
        near = sorted(((lid, line_dist(lon, lat, g)) for lid, g in geoms), key=lambda x: x[1])
        hits = [lid for lid, d in near if d <= 200]
        if hits:
            p['lines'] = hits
            if not p.get('line_id'): p['line_id'] = hits[0]
            fixed += 1
        else:
            still_empty.append((p['name_ko'], near[0][0], near[0][1]))
    shutil.copy(f'{ROOT}/data/stations.geojson', f'{ROOT}/data/stations.geojson.bak1')
    json.dump({'type': 'FeatureCollection', 'features': feats},
              open(f'{ROOT}/data/stations.geojson', 'w', encoding='utf-8'), ensure_ascii=False)
    report.append(f'역 귀속: {fixed}개 보완, 여전히 비어있음 {len(still_empty)}개')
    for n, ln_, d in sorted(still_empty, key=lambda x: x[0])[:40]:
        report.append(f'    잔여: {n} (최근접 {ln_} {d/1000:.1f}km)')

    print('\n'.join(report))
    print(f'\n총 노선: {len(all_lines)}개')

if __name__ == '__main__':
    main()
