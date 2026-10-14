#!/usr/bin/env python3
"""Phase 2: 추가 누락 노선 보완 (34개 잔여역 검증 후속)
- 신규: KTX 경강선(원주~강릉), 서해선(일반), 목포보성선, 삼척선
- 연장: KTX 중부내륙선 (단편 → 부발~문경 전구간)
- 귀속: 위키백과 검증된 노선 기준 재귀속
"""
import json, math, re, shutil
from collections import defaultdict

ROOT = '/home/hatch/workspace/kr-rail-map'
WIKI = json.load(open('/tmp/wiki_phase2.json', encoding='utf-8'))

def norm(n):
    n = re.sub(r'\(.*?\)', '', n).strip()
    return n

def load_stations():
    feats = json.load(open(f'{ROOT}/data/stations.geojson', encoding='utf-8'))['features']
    by_name = defaultdict(list)
    for f in feats:
        by_name[norm(f['properties']['name_ko'])].append(f)
    return feats, by_name

def match_chain(wiki_names, by_name, skip_words=None):
    result, skipped = [], []
    prev_coord = None
    for wn in wiki_names:
        key = norm(wn)
        if skip_words and any(sw in key for sw in skip_words):
            skipped.append((wn, '제외어')); continue
        cands = by_name.get(key, [])
        if not cands:
            skipped.append((wn, '데이터에 없음')); continue
        if len(cands) == 1 or prev_coord is None:
            pick = cands[0]
        else:
            def d(f):
                lo, la = f['geometry']['coordinates']
                return math.hypot((lo-prev_coord[0])*88.8e3, (la-prev_coord[1])*111.2e3)
            pick = min(cands, key=d)
        coord = pick['geometry']['coordinates']
        if prev_coord is not None:
            seg = math.hypot((coord[0]-prev_coord[0])*88.8e3, (coord[1]-prev_coord[1])*111.2e3)
            if seg > 45000:
                skipped.append((wn, f'이전 역과 {seg/1000:.0f}km')); continue
        result.append((wn, pick))
        prev_coord = coord
    return result, skipped

def main():
    feats, by_name = load_stations()
    lines = json.load(open(f'{ROOT}/data/lines.geojson', encoding='utf-8'))['features']
    by_id = {f['properties']['id']: f for f in lines}
    report = []
    new_lines = []

    # 정제된 역 목록 (아티팩트 제거)
    def clean(names, remove):
        return [n for n in names if not any(r in n for r in remove)]

    specs = [
        ('gyeonggang-line-ktx', 'KTX 경강선', 'KTX Gyeonggang Line', '#C62828',
         ['만종','횡성','둔내','평창','진부','강릉'],  # 원주~강릉, 지리순
         '개략 선형: OSM에 원주~강릉 구간 relation이 없어 위키백과 역 순서로 연결한 추론 선형'),
        ('seohae-line-conv', '서해선', 'Seohae Line', '#8D6E63',
         clean(WIKI['서해선']['conv'], ['대곡','능곡','김포공항','원종','부천종합운동장','소사','소새울','시흥대야','신천','신현','시흥시청','시흥능곡','달미','선부','초지','시우','원시','안산']),
         '개략 선형: OSM에 일반선 구간 relation이 없어 위키백과 역 순서로 연결한 추론 선형'),
        ('mokpo-boseong-line', '목포보성선', 'Mokpo-Boseong Line', '#6A1B9A',
         WIKI['목포보성선']['conv'],
         '개략 선형: OSM에 relation이 없어 위키백과 역 순서로 연결한 추론 선형'),
        ('samcheok-line', '삼척선', 'Samcheok Line', '#2E7D32',
         WIKI['삼척선']['conv'],
         '개략 선형: OSM에 relation이 없어 위키백과 역 순서로 연결한 추론 선형'),
    ]

    for lid, nko, nen, color, wlist, note in specs:
        matched, skipped = match_chain(wlist, by_name)
        if len(matched) < 2:
            report.append(f'SKIP {nko}: 매칭 {len(matched)}역으로 부족')
            continue
        geom = {'type': 'LineString',
                'coordinates': [f['geometry']['coordinates'] for _, f in matched]}
        new_lines.append({
            'type': 'Feature',
            'properties': {'id': lid, 'name_ko': nko, 'name_en': nen, 'color': color,
                           'category': 'conventional', 'status': 'open', 'variants': 0, 'note': note},
            'geometry': geom})
        report.append(f'NEW {nko}: {len(matched)}역 매칭, 스킵 {len(skipped)}')
        for wn, why in skipped:
            report.append(f'    스킵: {wn} ({why})')

    # KTX 중부내륙선 연장 (단편 → 부발~문경)
    jn = by_id['ktx-jungbunaeryuk-line']
    jn_wiki = WIKI['중부내륙선']['conv']  # 부발→문경 11역
    matched, skipped = match_chain(jn_wiki, by_name)
    if len(matched) >= 2:
        g = jn['geometry']
        parts = g['coordinates'] if g['type']=='MultiLineString' else [g['coordinates']]
        parts.append([f['geometry']['coordinates'] for _, f in matched])
        jn['geometry'] = {'type': 'MultiLineString', 'coordinates': parts}
        jn['properties']['note'] = '일부 개략선: OSM relation이 단편이어서 위키백과 역 순서로 연장한 추론 선형 포함'
        report.append(f'EXTEND KTX 중부내륙선: {len(matched)}역 매칭')

    all_lines = lines + new_lines
    shutil.copy(f'{ROOT}/data/lines.geojson', f'{ROOT}/data/lines.geojson.bak3')
    json.dump({'type':'FeatureCollection','features':all_lines},
              open(f'{ROOT}/data/lines.geojson','w',encoding='utf-8'), ensure_ascii=False)

    # 재귀속 (200m)
    def pt_seg(px, py, ax, ay, bx, by):
        kx, ky = 88.8e3, 111.2e3
        px,py,ax,ay,bx,by = px*kx,py*ky,ax*kx,ay*ky,bx*kx,by*ky
        dx,dy = bx-ax, by-ay
        L2 = dx*dx+dy*dy
        t = 0 if L2==0 else max(0,min(1,((px-ax)*dx+(py-ay)*dy)/L2))
        return math.hypot(px-(ax+t*dx), py-(ay+t*dy))
    def line_dist(slon, slat, geom):
        mls = geom['coordinates'] if geom['type']=='MultiLineString' else [geom['coordinates']]
        return min(pt_seg(slon,slat,a[0],a[1],b[0],b[1]) for coords in mls for a,b in zip(coords,coords[1:]))
    geoms = [(f['properties']['id'], f['geometry']) for f in all_lines]
    fixed, still = 0, []
    for f in feats:
        p = f['properties']
        if p.get('lines'): continue
        lon, lat = f['geometry']['coordinates']
        near = sorted(((lid, line_dist(lon,lat,g)) for lid,g in geoms), key=lambda x: x[1])
        hits = [lid for lid,d in near if d <= 200]
        if hits:
            p['lines'] = hits
            if not p.get('line_id'): p['line_id'] = hits[0]
            fixed += 1
        else:
            still.append(p['name_ko'])
    shutil.copy(f'{ROOT}/data/stations.geojson', f'{ROOT}/data/stations.geojson.bak3')
    json.dump({'type':'FeatureCollection','features':feats},
              open(f'{ROOT}/data/stations.geojson','w',encoding='utf-8'), ensure_ascii=False)
    report.append(f'재귀속: {fixed}개, 잔여: {len(still)}개')
    report.append('잔여: ' + ', '.join(sorted(still)))

    print('\n'.join(report))
    print(f'\n총 노선: {len(all_lines)}개')

if __name__ == '__main__':
    main()
