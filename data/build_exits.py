"""OSM 출구 노드를 역에 붙여 data/exits.geojson 을 만든다.

매칭 원칙
  1) 출구 태그에 적힌 역명(description/name)을 먼저 믿는다.
     예: "강남역 10번 출구" → '강남'
  2) 같은 이름의 역이 여럿이면(동명이역) 가장 가까운 쪽으로 붙인다.
  3) 이름이 없으면 150m 안의 가장 가까운 역에만 붙인다. 그 밖이면 버린다.
     (이름 없이 거리만으로 붙이면 옆 역 출구를 잘못 가져온다)

왜 필요한가
  부동산에서 '역까지 몇 분' 은 역 중심점이 아니라 가까운 출구까지의 거리다.
  강남역은 중심점과 출구가 300m 넘게 벌어져 도보 4분 차이가 난다.

실행: python data/build_exits.py
결과: data/exits.geojson
"""
import json
import math
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, '_exits_raw.json')
STATIONS = os.path.join(HERE, 'stations.geojson')
OUT = os.path.join(HERE, 'exits.geojson')

NAME_MATCH_KM = 0.6     # 이름이 맞으면 이 반경까지 인정
NEAR_ONLY_KM = 0.15     # 이름이 없을 때 거리만으로 인정하는 반경
REJECT_KM = 1.0         # 이보다 멀면 어느 역에도 안 붙인다

# "강남역 10번 출구" → "강남"
STRIP = [
    (re.compile(r'\(.*?\)'), ''),
    (re.compile(r'\d+\s*번\s*출\s*구'), ''),
    (re.compile(r'출\s*구'), ''),
    (re.compile(r'exit\s*\d*', re.I), ''),
    (re.compile(r'\d+'), ''),
    (re.compile(r'\s+'), ''),
]


def hav(a, b):
    r = math.pi / 180
    dlat = (b[1] - a[1]) * r
    dlon = (b[0] - a[0]) * r
    h = (math.sin(dlat / 2) ** 2 +
         math.cos(a[1] * r) * math.cos(b[1] * r) * math.sin(dlon / 2) ** 2)
    return 6371 * 2 * math.asin(math.sqrt(h))


def norm_name(s):
    s = s or ''
    for pat, rep in STRIP:
        s = pat.sub(rep, s)
    s = s.strip()
    if s.endswith('역'):
        s = s[:-1]
    return s


def exit_no(tags):
    ref = (tags.get('ref') or '').strip()
    m = re.search(r'\d+', ref)
    if m:
        return m.group(0)
    # ref 가 없으면 description 에서 "10번 출구" 를 찾는다
    d = tags.get('description') or ''
    m = re.search(r'(\d+)\s*번', d)
    return m.group(1) if m else ''


def main():
    if not os.path.exists(RAW):
        sys.exit('먼저 data/fetch_exits_raw.py 를 실행하세요')
    raw = json.load(open(RAW, encoding='utf-8'))['elements']
    st = json.load(open(STATIONS, encoding='utf-8'))

    stations = []
    by_name = {}
    for f in st['features']:
        p = f['properties']
        name = p.get('name_ko') or ''
        if not name:
            continue
        c = f['geometry']['coordinates']
        stations.append({'id': p['id'], 'name': name, 'c': (c[0], c[1])})
        by_name.setdefault(norm_name(name), []).append(stations[-1])

    out = []
    seen = set()
    stat = {'by_name': 0, 'by_near': 0, 'dropped': 0}

    for el in raw:
        tags = el.get('tags') or {}
        c = (el['lon'], el['lat'])

        hint = ''
        for k in ('description', 'name', 'description:ko', 'name:ko'):
            if tags.get(k):
                hint = norm_name(tags[k])
                if hint:
                    break

        target = None
        if hint and hint in by_name:
            cands = [s for s in by_name[hint] if hav(c, s['c']) <= NAME_MATCH_KM]
            if cands:
                target = min(cands, key=lambda s: hav(c, s['c']))
                stat['by_name'] += 1

        if target is None:
            near = min(stations, key=lambda s: hav(c, s['c']))
            d = hav(c, near['c'])
            if d <= NEAR_ONLY_KM:
                target = near
                stat['by_near'] += 1
            else:
                stat['dropped'] += 1
                continue

        no = exit_no(tags)
        k = (target['id'], no)
        if no and k in seen:
            continue          # 같은 역 같은 번호 중복
        seen.add(k)
        out.append({
            'type': 'Feature',
            'geometry': {'type': 'Point', 'coordinates': [round(c[0], 6), round(c[1], 6)]},
            'properties': {
                'station': target['id'],
                'name': target['name'],
                'no': no,
                'osm': el['id'],
            },
        })

    json.dump({'type': 'FeatureCollection', 'features': out},
              open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

    with_exit = len({f['properties']['station'] for f in out})
    print(f'출구 {len(out)}개 → 역 {with_exit}개 / 전체 {len(stations)}개')
    print(f"  이름 매칭 {stat['by_name']} · 근접 매칭 {stat['by_near']} · 버림 {stat['dropped']}")
    print('저장:', OUT, f'({os.path.getsize(OUT) / 1024:.0f}KB)')


if __name__ == '__main__':
    main()
