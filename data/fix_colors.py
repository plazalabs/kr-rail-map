#!/usr/bin/env python3
"""노선 색상을 공식 값으로 교정.

출처: 한국어 위키백과 《틀:한국 철도 노선색》 (2026-10 확인)
  SM  수도권 도시철도 / KR 코레일 수도권 / SG 수도권 광역급행철도(GTX)
  IM 인천 / KA 공항철도 / UL 의정부 / YL 용인 / SW 서해선 / SB 신분당선
  BT 부산 / DT 대구 / GM 광주 / DJ 대전

GTX-D·E·F 는 아직 공식 색상이 없다(위키 템플릿에도 A·B·C 만 정의).
계획 노선은 서로 구분되도록 임시 색을 쓰고 note 에 명시한다.

사용: cd data && python3 fix_colors.py
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))

# 노선명 → 색상 (공식)
OFFICIAL = {
    # 수도권 도시철도 (SM)
    '수도권 전철 1호선': '0052A4',
    '서울 지하철 2호선': '00A84D',
    '수도권 전철 3호선': 'EF7C1C',
    '수도권 전철 4호선': '00A5DE',
    '서울 지하철 5호선': '996CAC',
    '서울 지하철 6호선': 'CD7C2F',
    '서울 지하철 7호선': '747F00',
    '서울 지하철 8호선': 'E6186C',
    '서울 지하철 9호선': 'BDB092',
    # 코레일 수도권 (KR)
    '경의·중앙선': '77C4A3',
    '수인·분당선': 'F5A200',
    '경강선': '003DA5',
    '경춘선': '0C8E72',
    # 기타 수도권
    '신분당선': 'D4003B',            # SB
    '인천국제공항철도': '0090D2',     # KA
    '인천 도시철도 1호선': '7CA8D5',   # IM
    '인천 도시철도 2호선': 'ED8B00',   # IM
    '의정부경전철': 'FDA600',         # UL
    '용인 경전철': '509F22',          # YL
    '우이신설선': 'B0CE18',           # UI
    '김포 골드라인': 'A17800',         # GG
    '신림선': '6789CA',              # SS
    '서해선': '81A914',              # SW (도시철도/일반 양쪽)
    # GTX (SG)
    'GTX-A': '9A6292',
    'GTX-B': '234699',
    'GTX-C': '306E5B',
    # 부산 (BT)
    '부산 도시철도 1호선': 'F06A00',
    '부산 도시철도 2호선': '81BF48',
    '부산 도시철도 3호선': 'BB8C00',
    '부산 도시철도 4호선': '217DCB',
    # 대구 (DT)
    '대구 도시철도 1호선': 'D93F5C',
    '대구 도시철도 2호선': '00AA80',
    '대구 도시철도 3호선': 'FFB100',
    # 광주 (GM)
    '광주 도시철도 1호선': '009088',
    '광주 도시철도 2호선': '0471C3',
    # 대전 (DJ)
    '대전 도시철도 1호선': '007448',
    '대전 도시철도 2호선': '40E0D0',
}

# 공식 색상이 아직 없는 계획 노선 — 구분용 임시 색
PROVISIONAL = {
    'GTX-D': '8A5782',   # SG 기본값
    'GTX-E': 'C2708F',
    'GTX-F': '5E7FA8',
}


def main():
    path = os.path.join(HERE, 'lines.geojson')
    data = json.load(open(path, encoding='utf-8'))
    changed, missing = [], []

    for f in data['features']:
        p = f['properties']
        name = p.get('name_ko')
        new = OFFICIAL.get(name) or PROVISIONAL.get(name)
        if not new:
            missing.append(name)
            continue
        new = '#' + new.upper()
        if (p.get('color') or '').upper() != new:
            changed.append((name, p.get('color'), new))
            p['color'] = new
        if name in PROVISIONAL:
            note = p.get('note') or ''
            if '색상 임시' not in note:
                p['note'] = (note + ' / 색상 임시(공식 미정)').strip(' /')

    with open(path, 'w', encoding='utf-8') as fp:
        json.dump(data, fp, ensure_ascii=False, separators=(',', ':'))

    print(f'색상 변경 {len(changed)}건')
    for name, old, new in changed:
        print(f'  {name:24s} {old} → {new}')
    if missing:
        print(f'\n표에 없는 노선 {len(missing)}개 (그대로 둠): ' + ', '.join(missing[:12]))


if __name__ == '__main__':
    main()
