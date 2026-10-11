#!/usr/bin/env python3
"""한국 철도 데이터 후처리: 노이즈 제거 → 운행계통 변형 병합 → 역 병합 → GTX-C 개략선 추가.

입력: data/raw/lines.raw.geojson, data/raw/stations.raw.geojson (파이프라인 원본 백업)
출력: data/lines.geojson, data/stations.geojson (앱이 읽는 최종본), data/CLEANING.md
"""
import json, re, math, shutil, os
from collections import Counter, defaultdict

DATA = os.path.dirname(os.path.abspath(__file__))

def load(n):
    with open(f'{DATA}/{n}', encoding='utf-8') as f:
        return json.load(f)['features']

def save(n, feats):
    with open(f'{DATA}/{n}', 'w', encoding='utf-8') as f:
        json.dump({'type': 'FeatureCollection', 'features': feats}, f, ensure_ascii=False)

# ---------- 0. 원본 백업 ----------
for n in ('lines.geojson', 'stations.geojson'):
    raw = f'{DATA}/raw/{n.replace(".geojson", ".raw.geojson")}'
    if not os.path.exists(raw):
        shutil.copy(f'{DATA}/{n}', raw)
        print('backup:', raw)

lines = load('raw/lines.raw.geojson')
stations = load('raw/stations.raw.geojson')
print(f'원본: 노선 {len(lines)}, 역 {len(stations)}')

# ---------- 1. 노이즈 제거 (도로 오태깅·터널 단일구조물·관광 레일바이크·군용·시험선로) ----------
NOISE_IDS = {'r3399104', 'r9504912', 'r9529550', 'r19966469', 'r14550657',
             'r12115931', 'r10553869'}
dropped_noise = [f for f in lines if f['properties']['id'] in NOISE_IDS]
lines = [f for f in lines if f['properties']['id'] not in NOISE_IDS]
print(f'노이즈 제거: {len(dropped_noise)}개')

# ---------- 2. 기본명 추출 ----------
def base_name(n):
    n = (n or '').strip()
    n = re.sub(r'\s*[\(（][^\)）]*[\)）]\s*$', '', n)   # (부산역 행) 제거
    n = n.split(':')[0].strip()                          # 방향 suffix 제거
    n = re.sub(r'\s+\S+\s*방면\s*$', '', n)               # 태백선 백산 방면 → 태백선
    n = re.sub(r'\s+(급행|특급|완행)\s*$', '', n)
    n = re.sub(r'\s*\S*[·ㆍ]\S*\s*계통\s*$', '', n)        # 경원·경부 계통 제거
    n = re.sub(r'\s+계통\s*$', '', n)
    return n.strip()

ALIASES = [  # (정규식, canonical명) — 순서대로 적용
    (r'^(경부고속철도|경부선 KTX)$', 'KTX 경부선'),
    (r'^호남선 KTX$', 'KTX 호남선'),
    (r'^전라선 KTX$', 'KTX 전라선'),
    (r'^강릉선 KTX$', 'KTX 강릉선'),
    (r'^경부선 (ITX-새마을|무궁화호).*$', '경부선'),
    (r'^호남선 (ITX-새마을|무궁화호).*$', '호남선'),
    (r'^전라선 (ITX-새마을|무궁화호).*$', '전라선'),
    (r'^장항선 새마을호$', '장항선'),
    (r'^교외선 무궁화호$', '교외선'),
    (r'^ITX-청춘$', '경춘선'),
    (r'^수도권 전철 경춘선$', '경춘선'),
    (r'^평택선 ITX 마음$', '평택선'),
    (r'^(수인분당선|수도권 전철 수인·분당선)$', '수인·분당선'),
    (r'^인천국제공항철도 (일반열차|직통열차)$', '인천국제공항철도'),
    (r'^수도권 광역급행철도 A선$', 'GTX-A'),
    (r'^서울 경전철 신림선$', '신림선'),
    (r'^하남선$', '서울 지하철 5호선'),
    (r'^응암순환선$', '서울 지하철 6호선'),
    (r'^별내선$', '서울 지하철 8호선'),
    (r'^수도권 전철 1호선 광명셔틀$', '수도권 전철 1호선'),
    (r'^경의·중앙선 셔틀$', '경의·중앙선'),
    (r'^서울 지하철 2호선 (성수지선|신정지선)$', '서울 지하철 2호선'),
    (r'^수도권 전철 (경강선|서해선|신분당선)$', None),  # prefix strip → group(1)
    (r'^광주 도시철도 2호선 (내선순환|외선순환)$', '광주 도시철도 2호선'),
    (r'^동해선 광역전철$', '동해선'),
]

def canonical(b):
    for pat, rep in ALIASES:
        m = re.match(pat, b)
        if m:
            return m.group(1) if rep is None else rep
    return b

groups = defaultdict(list)
for f in lines:
    groups[canonical(base_name(f['properties'].get('name_ko')))].append(f)
print(f'병합: {len(lines)}개 relation → {len(groups)}개 물리 노선')

# ---------- 3. 병합 ----------
def slugify(s, i):
    s = (s or '').lower()
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    return s if s else f'line-{i:03d}'

def geom_len(g):
    t = g['type']
    coords = g['coordinates'] if t == 'LineString' else [p for part in g['coordinates'] for p in part]
    return len(coords)

used_ids, OLD2NEW, merged = set(), {}, []
CATEGORY_OVERRIDES = {  # OSM relation 태그와 실제 운행 성격이 다른 경우 수동 교정
    'GTX-A': 'urban', '경의·중앙선': 'metro', '경춘선': 'metro',
    '수인·분당선': 'metro', '서해선': 'metro', '인천국제공항철도': 'metro',
    '동해선': 'metro', '대경선': 'metro',
}
for i, (cname, feats) in enumerate(sorted(groups.items())):
    rep = max(feats, key=lambda f: geom_len(f['geometry']))  # 최장 geometry를 대표로
    rp = rep['properties']
    colors = [f['properties'].get('color') for f in feats if f['properties'].get('color')]
    cats = Counter(f['properties'].get('category') for f in feats)
    stats = Counter(f['properties'].get('status') for f in feats)
    en_cands = [(f['properties'].get('name_en') or '').split(':')[0].strip()
                for f in feats if f['properties'].get('name_en')]
    en_base = en_cands[0] if en_cands else ''
    # id용: 운행패턴 suffix 제거 (Gwangmyeong Shuttle → 제거)
    en_id_src = re.sub(r'(?i)\s+(gwangmyeong\s+)?shuttle\s*$', '', en_base)
    en_id_src = re.sub(r'(?i)\s+(all[\s-]+stop|express|local|rapid|limited(\s+express)?)\s*$', '', en_id_src)
    nid = slugify(en_id_src.strip() or cname, i)
    j = 2
    while nid in used_ids:
        nid = f'{nid}-{j}'; j += 1
    used_ids.add(nid)
    for f in feats:
        OLD2NEW[f['properties']['id']] = nid
    status = 'construction' if stats.get('construction') else ('planned' if stats.get('planned') else 'open')
    merged.append({
        'type': 'Feature',
        'properties': {
            'id': nid, 'name_ko': cname, 'name_en': en_base,
            'color': Counter(colors).most_common(1)[0][0] if colors else None,
            'category': CATEGORY_OVERRIDES.get(cname, cats.most_common(1)[0][0] or 'etc'),
            'status': status, 'variants': len(feats),
        },
        'geometry': rep['geometry'],
    })

# ---------- 4. 색상 없는 노선에 지정 (추론/디자인 선택 — CLEANING.md 기록) ----------
CANDIDATES = ['#C62828', '#1565C0', '#2E7D32', '#6A1B9A', '#EF6C00', '#00838F', '#5D4037', '#AD1457']
used_colors = {m['properties']['color'] for m in merged if m['properties']['color']}
def hexdist(a, b):
    ar = [int(a[i:i+2], 16) for i in (1, 3, 5)]; br = [int(b[i:i+2], 16) for i in (1, 3, 5)]
    return sum((x - y) ** 2 for x, y in zip(ar, br)) ** 0.5
color_assigned = []
for m in merged:
    p = m['properties']
    if not p['color']:
        if p['category'] == 'ktx' or 'KTX' in p['name_ko']:
            c = '#C62828'
        else:
            c = max(CANDIDATES, key=lambda x: min([hexdist(x, u) for u in used_colors] or [999]))
        p['color'] = c
        used_colors.add(c)
        color_assigned.append((p['name_ko'], c))

# ---------- 5. 역 병합 (먼저 전수 remap → 동명 병합) ----------
def hav(a, b):
    lon1, lat1, lon2, lat2 = map(math.radians, [a[0], a[1], b[0], b[1]])
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))

for s in stations:
    p = s['properties']
    new_lines = []
    for lid in p.get('lines') or []:
        nl = OLD2NEW.get(lid)
        if nl and nl not in new_lines:
            new_lines.append(nl)
    p['lines'] = new_lines
    p['line_id'] = OLD2NEW.get(p.get('line_id'))

by_name = defaultdict(list)
for s in stations:
    by_name[s['properties'].get('name_ko')].append(s)

merged_st, far_groups = [], []
for name, feats in by_name.items():
    if len(feats) == 1:
        merged_st.append(feats[0]); continue
    coords = [f['geometry']['coordinates'] for f in feats]
    cx = sum(c[0] for c in coords) / len(coords); cy = sum(c[1] for c in coords) / len(coords)
    if max(hav((cx, cy), c) for c in coords) <= 0.8:
        base_f = feats[0]; bp = dict(base_f['properties'])
        line_set = []
        for f in feats:
            for lid in f['properties'].get('lines') or []:
                if lid not in line_set:
                    line_set.append(lid)
        bp['lines'] = line_set
        merged_st.append({'type': 'Feature', 'properties': bp, 'geometry': base_f['geometry']})
    else:
        far_groups.append((name, len(feats),
                           round(max(hav((cx, cy), c) for c in coords), 2)))
        merged_st.extend(feats)  # 병합 없이 유지
print(f'역 병합: {len(stations)} → {len(merged_st)} (동명 이격 유지 {len(far_groups)}그룹)')

# ---------- 6. GTX-C 개략선 (공사 중) — 역 좌표는 OSM 실측, 선형은 역간 직선 (추론) ----------
GTX_TARGETS = ['덕정', '의정부', '창동', '광운대', '청량리', '삼성', '양재', '과천', '금정', '수원']
name_idx = {s['properties']['name_ko']: s for s in merged_st}
gtx_stations, missing = [], []
for t in GTX_TARGETS:
    s = name_idx.get(t)
    if not s:
        cands = [k for k in name_idx if k.startswith(t)]
        s = name_idx[cands[0]] if cands else None
    (gtx_stations if s else missing).append(s or t)
if len(gtx_stations) >= 2:
    gtx_stations.sort(key=lambda s: s['geometry']['coordinates'][1], reverse=True)
    coords = [s['geometry']['coordinates'] for s in gtx_stations]
    gtx = {'type': 'Feature', 'properties': {
        'id': 'gtx-c', 'name_ko': 'GTX-C', 'name_en': 'GTX-C',
        'color': '#E91E63', 'category': 'urban', 'status': 'construction',
        'variants': 1, 'note': '개략 선형: 역간 직선 연결 (추론) — 실제 선로와 다름'},
        'geometry': {'type': 'LineString', 'coordinates': coords}}
    merged.append(gtx)
    for s in gtx_stations:
        if 'gtx-c' not in s['properties']['lines']:
            s['properties']['lines'].append('gtx-c')
    print(f'GTX-C 추가: {len(gtx_stations)}개역 연결, 미발견: {missing}')
else:
    print('GTX-C 스킵 (역 부족):', missing)

# ---------- 7. 저장 ----------
save('lines.geojson', merged)
save('stations.geojson', merged_st)
print(f'최종: 노선 {len(merged)}, 역 {len(merged_st)}')

with open(f'{DATA}/CLEANING.md', 'w', encoding='utf-8') as f:
    f.write('# 데이터 후처리 기록 (CLEANING.md)\n\n')
    f.write('## 1. 노이즈 제거 (7개)\n' + ''.join(
        f"- {d['properties']['id']} | {d['properties'].get('name_ko')}\n" for d in dropped_noise))
    f.write(f'\n## 2. 변형 병합: {sum(g["variants"] for g in [m["properties"] for m in merged])}개 relation → {len(merged)}개 물리 노선\n')
    f.write('대표 geometry = 그룹 내 최장 선형. 병합 수는 properties.variants에 기록.\n')
    f.write('\n## 3. 색상 지정 (추론/디자인 선택)\n')
    f.write('- KTX 계열 → #C62828 (deep red)\n- 그 외 무색 노선 → 기존 색상과 가장 먼 후보색 자동 배정\n')
    for n, c in color_assigned: f.write(f'- {n}: {c}\n')
    f.write('\n## 4. 역 병합\n')
    f.write(f'- {len(stations)} → {len(merged_st)} (동명·800m 이내 병합, lines 배열 합집합)\n')
    f.write(f'- 동명이지만 800m 초과 이격 그룹 {len(far_groups)}개는 병합 없이 유지:\n')
    for n, c, d in sorted(far_groups, key=lambda x: -x[2])[:20]:
        f.write(f'  - {n} ×{c} (최대 이격 {d}km)\n')
    f.write('\n## 5. GTX-C 개략선\n')
    f.write('- OSM에 route relation이 없어 수동 추가. 역 좌표는 OSM 실측값, 선형은 역간 직선 연결 (추론).\n')
    f.write(f'- 연결역: {[s["properties"]["name_ko"] for s in gtx_stations] if "gtx_stations" in dir() else []}, 미발견: {missing if "missing" in dir() else []}\n')
    f.write('- properties.note에 "개략 선형" 명시.\n')
print('CLEANING.md 작성 완료')
