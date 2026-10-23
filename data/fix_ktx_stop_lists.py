"""KTX 노선의 정차역 목록에서 실제로 서지 않는 역을 뺀다.

왜 필요한가
  상봉이 'KTX 강릉선' 정차역으로 들어가 있었다. 실제 KTX-이음 강릉선은
  서울–청량리–양평–만종–횡성–서원주–평창–진부–강릉에 서고 상봉에는 서지 않는다.
  (중앙선 선로가 상봉 옆을 지나갈 뿐이다.)

  이 한 줄 때문에 길찾기가 '상봉 → 청량리 3.8km 를 KTX 로' 태우는 경로를
  최단시간으로 뽑았다. 3.8km 를 1분에 가니 도시철도(6분)를 이겼고,
  요금은 KTX 기본요금이 붙어 13km 구간이 9,950원이 됐다.

실행: python data/fix_ktx_stop_lists.py
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))

# KTX 노선 id -> 실제로 서지 않는 역 이름
NOT_A_STOP = {
    'gangneung-line-ktx': {'상봉'},
}


def load(name):
    with open(os.path.join(HERE, name), encoding='utf-8') as f:
        return json.load(f)


def save(name, obj):
    with open(os.path.join(HERE, name), 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))


def main():
    lines = load('lines.geojson')
    stations = load('stations.geojson')

    # 1) 노선의 stops 목록에서 제거
    line_changes = 0
    for feat in lines['features']:
        lid = feat['properties']['id']
        bad = NOT_A_STOP.get(lid)
        if not bad:
            continue
        stops = feat['properties'].get('stops')
        if not stops:
            continue
        kept = [s for s in stops if s not in bad]
        if len(kept) != len(stops):
            feat['properties']['stops'] = kept
            line_changes += len(stops) - len(kept)
            print(f'  {lid}: stops {len(stops)} -> {len(kept)}')

    # 2) 역의 lines 목록에서 제거
    st_changes = 0
    for feat in stations['features']:
        p = feat['properties']
        bad_lines = {lid for lid, bad in NOT_A_STOP.items()
                     if p.get('name_ko') in bad and lid in (p.get('lines') or [])}
        if not bad_lines:
            continue
        p['lines'] = [l for l in p['lines'] if l not in bad_lines]
        # line_id 가 지운 노선을 가리키면 남은 첫 노선으로 바꾼다
        if p.get('line_id') in bad_lines and p['lines']:
            p['line_id'] = p['lines'][0]
        st_changes += 1
        print(f'  {p["name_ko"]}: -{",".join(sorted(bad_lines))} -> [{",".join(p["lines"])}]')

    if line_changes or st_changes:
        save('lines.geojson', lines)
        save('stations.geojson', stations)
        print(f'완료: stops {line_changes}건, 역 {st_changes}건 수정')
    else:
        print('수정할 것 없음')


if __name__ == '__main__':
    main()
