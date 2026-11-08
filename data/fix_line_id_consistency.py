#!/usr/bin/env python3
"""역 대표 노선(line_id) 정합 — 근거가 그 역 데이터 안에 있을 때만 고친다 (IMPL12 건 1).

규칙
  - line_id 가 없거나, 자기 lines 목록에 없는 역 중
  - lines 에 노선이 정확히 1개면 → line_id = lines[0]   (근거: 그 역의 lines)
  - lines 가 2개 이상이면 대표를 데이터만으로 정할 수 없다 → 고치지 않고 목록으로 보고
  - lines 가 비면 → 고치지 않고 보고
fix_ktx_stop_lists.py 의 'line_id = lines[0]' 규칙과 같은 근거다. 다시 돌려도 결과가 같다(멱등).
사용: python data/fix_line_id_consistency.py [--check]
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
P = os.path.join(HERE, 'stations.geojson')


def main():
    check = '--check' in sys.argv
    d = json.load(open(P, encoding='utf-8'))
    fixed, left = [], []
    for f in d['features']:
        p = f['properties']
        ls = p.get('lines') or []
        lid = p.get('line_id')
        if lid and lid in ls:
            continue
        if len(ls) == 1:
            fixed.append((p['id'], p.get('name_ko'), lid, ls[0]))
            if not check:
                p['line_id'] = ls[0]
        else:
            left.append((p['id'], p.get('name_ko'), lid, ls))
    for x in fixed:
        print(f"{'고칠 것' if check else '고침'}  {x[0]} {x[1]}: line_id {x[2]!r} → {x[3]!r}")
    for x in left:
        print(f"보류  {x[0]} {x[1]}: line_id {x[2]!r}, lines {x[3]} — 대표 노선 근거 없음")
    if not check and fixed:
        # 원본과 같은 직렬화 형식을 유지한다
        raw = open(P, encoding='utf-8').read()
        indent = 2 if raw[:200].count('\n') > 2 else None
        json.dump(d, open(P, 'w', encoding='utf-8', newline='\n'), ensure_ascii=False,
                  indent=indent, separators=None if indent else (',', ':'))
    print(f'고침 {len(fixed)} · 보류 {len(left)}')
    return 1 if (check and fixed) else 0


if __name__ == '__main__':
    sys.exit(main())
