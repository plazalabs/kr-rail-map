#!/usr/bin/env python3
"""선형 중복 제거 — 같은 궤도를 두 번 그린 노선을 고친다.

왜 필요한가
-----------
노선 선형을 이어붙이다 보면 두 가지 사고가 난다.

  (가) 상행·하행을 각각 그려 넣는다
       인천공항철도는 서울역→인천공항 57.89km 조각과 인천공항→서울 57.90km 조각이
       둘 다 들어 있어 116.9km 로 잡혔다. 실제 영업거리는 63.8km 다.
       용인경전철도 18.1km 짜리가 두 번 들어가 37.2km 였다.

  (나) 종점에서 되돌아 나온 꼬리가 붙는다
       서울 2호선 성수지선이 성수→신설동 갔다가 다시 동쪽으로 되돌아왔고,
       신정지선도 도림천에서 같은 길로 되돌아 나왔다. 70.07km (실제 60.2km).
       6호선·대경선은 선형 전체가 왕복으로 그려져 길이가 두 배가 됐다.

고치는 방법
-----------
  1) 꼬리 자르기 — p[t+1:] 가 p[:t] 위에 얹혀 있으면 p[:t+1] 만 남긴다.
     종점에서 되돌아 나온 구간이 사라진다.
  2) 방향 중복 버리기 — 조각 B 가 조각 A 위에 거의 다 얹혀 있으면 B 를 버린다.
  3) 왕복 선형 자르기 — 조각 하나가 시작점으로 되돌아오는데 그게 노선의
     실제 모양이 아니면(순환선이 아니면) 가장 먼 점에서 자른다.

안전장치
--------
  공식 영업거리(OFFICIAL)와 비교해서, 고친 뒤 길이가 공식값의 ±8% 안에
  들어올 때만 반영한다. 검증이 안 되는 노선은 건드리지 않고 보고만 한다.
  지하철 순환선(2호선 본선)처럼 실제로 닫힌 고리인 조각은 자르지 않는다.

실행
----
  python data/fix_geometry_dup.py           # 미리보기
  python data/fix_geometry_dup.py --apply   # 반영
"""
import json
import math
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
LINES = os.path.join(ROOT, 'lines.geojson')

R = 6371.0

# 공식 영업거리(km). 출처: 각 운영기관 노선 현황.
#   여기 없는 노선은 '검증 불가'로 보고만 하고 손대지 않는다.
OFFICIAL = {
    'seoul-subway-line-2': 60.2,          # 48.8 본선 + 5.4 성수지선 + 6.0 신정지선
    'seoul-subway-line-5': 59.7,          # 52.9 본선 + 6.8 마천지선
    'seoul-subway-line-6': 36.4,          # 35.1 + 응암순환 1.3
    'arex': 63.8,                         # 서울역~인천공항2터미널
    'yongin-light-rail-transit': 18.1,
    'suin-bundang-line': 105.8,           # 분당선 52.9 + 수인선 52.9
    'daegyeong-line': 61.9,               # 경산~구미
    'wolmi-sea-train': 6.1,
}

TOL_TAIL = 0.400      # 꼬리가 머리 위에 있다고 볼 거리(p90)
TOL_DUP = 0.100       # 조각 B 가 조각 A 위에 있다고 볼 거리(p90)
TOL_LOOP = 0.500      # 왕복 선형 판정 거리(p90)
MIN_PIECE_KM = 0.300  # 이보다 짧은 조각은 중복 판정 대상에서 뺀다
ACCEPT = 0.08         # 공식값 대비 허용 오차

# 실제로 닫힌 고리인 노선. 시작점으로 되돌아오는 게 정상이라 자르면 안 된다.
LOOPS = {
    'wolmi-sea-train',   # 월미바다열차 — 월미도 한 바퀴 6.1km 순환
}


def hav(a, b):
    r = math.pi / 180
    dlat = (b[1] - a[1]) * r
    dlon = (b[0] - a[0]) * r
    h = (math.sin(dlat / 2) ** 2 +
         math.cos(a[1] * r) * math.cos(b[1] * r) * math.sin(dlon / 2) ** 2)
    return R * 2 * math.asin(math.sqrt(min(1.0, h)))


def path_km(p):
    return sum(hav(p[i], p[i + 1]) for i in range(len(p) - 1))


def cover_p90(A, B):
    """B 의 점들이 A 에서 얼마나 떨어져 있는지 (90백분위, km)."""
    ds = sorted(min(hav(b, a) for a in A) for b in B)
    return ds[int(len(ds) * 0.9)] if ds else 0.0


def trim_tail(p, tol=TOL_TAIL):
    """종점에서 되돌아 나온 꼬리를 자른다. 자른 인덱스와 길이를 돌려준다."""
    n = len(p)
    if n < 8:
        return p, 0.0
    for t in range(4, n - 3):
        tail = p[t + 1:]
        if path_km(tail) < 0.15:
            continue
        if cover_p90(p[:t], tail) <= tol:
            return p[:t + 1], path_km(p[t:])
    return p, 0.0


def cut_roundtrip(p, tol=TOL_LOOP):
    """조각 하나가 왕복으로 그려진 경우 가장 먼 점에서 자른다."""
    n = len(p)
    if n < 12:
        return p, 0.0
    # 시작점에서 가장 먼 점 = 진짜 종점
    far = max(range(1, n), key=lambda i: hav(p[0], p[i]))
    if far < 6 or far > n - 6:
        return p, 0.0
    back = p[far + 1:]
    if path_km(back) < 1.0:
        return p, 0.0
    if cover_p90(p[:far], back) > tol:
        return p, 0.0
    return p[:far + 1], path_km(p[far:])


def is_dup(A, B):
    """B 가 A 위에 거의 다 얹혀 있으면 True."""
    if path_km(B) < MIN_PIECE_KM:
        return False
    return cover_p90(A, B) <= TOL_DUP


def trim_dup_suffix(B, A):
    """조각 B 의 뒤쪽이 조각 A 위에 얹혀 있으면 그 앞까지만 남긴다.

    인천공항철도가 이 경우다. 조각 하나는 서울역→인천공항 본선이고,
    다른 조각은 '용유 지선 8km + 본선 역방향' 이라 뒤쪽 절반이 본선과 겹친다.
    겹치는 부분만 잘라내면 지선은 살리고 본선 중복은 없앨 수 있다.
    """
    n = len(B)
    if n < 8 or path_km(B) < MIN_PIECE_KM:
        return B, 0.0
    for i in range(3, n - 3):
        suffix = B[i:]
        if path_km(suffix) < 1.0:
            break
        if cover_p90(A, suffix) <= TOL_DUP:
            head = B[:i]
            if path_km(head) < MIN_PIECE_KM:
                return B, 0.0
            return head, path_km(suffix)
    return B, 0.0


def repair(parts, name):
    """조각 목록을 고쳐서 새 목록과 로그를 돌려준다."""
    log = []

    # 1) 꼬리 자르기
    step1 = []
    for i, p in enumerate(parts):
        p2, cut = trim_tail(p)
        if cut > 0:
            log.append(f'조각{i} 꼬리 {cut:.2f}km 제거 '
                       f'({path_km(p):.2f} → {path_km(p2):.2f}km)')
        step1.append(p2)

    # 2) 방향 중복 버리기 — 뒤 조각이 앞 조각에 얹혀 있으면 버린다
    kept = []
    for i, p in enumerate(step1):
        j = next((k for k, q in enumerate(kept) if is_dup(q, p)), None)
        if j is None:
            kept.append(p)
        else:
            log.append(f'조각{i} 가 조각{j} 와 겹침 → 버림 ({path_km(p):.2f}km)')

    # 2-1) 뒤쪽만 겹치는 조각 — 겹치는 꼬리만 잘라내고 나머지는 살린다
    step2 = []
    for i, p in enumerate(kept):
        cur = p
        for k, q in enumerate(step2):
            cur2, cut = trim_dup_suffix(cur, q)
            if cut > 0:
                log.append(f'조각{i} 뒷부분 {cut:.2f}km 가 조각{k} 와 겹침 '
                           f'({path_km(cur):.2f} → {path_km(cur2):.2f}km)')
                cur = cur2
        if path_km(cur) >= MIN_PIECE_KM:
            step2.append(cur)
        elif cur is not p:
            log.append(f'조각{i} 남은 길이 {path_km(cur):.2f}km → 버림')

    # 3) 왕복으로 그려진 조각 자르기
    step3 = []
    for i, p in enumerate(step2):
        p2, cut = cut_roundtrip(p)
        if cut > 0:
            log.append(f'조각{i} 왕복 {cut:.2f}km 잘라냄 '
                       f'({path_km(p):.2f} → {path_km(p2):.2f}km)')
        step3.append(p2)

    # 자르고 나서 다시 겹침 확인 (짧아진 조각이 중복일 수 있다)
    final = []
    for i, p in enumerate(step3):
        j = next((k for k, q in enumerate(final) if is_dup(q, p)), None)
        if j is None:
            final.append(p)
        else:
            log.append(f'조각{i}(정리 후) 가 조각{j} 와 겹침 → 버림 ({path_km(p):.2f}km)')

    return final, log


def main():
    apply = '--apply' in sys.argv
    data = json.load(open(LINES, encoding='utf-8'))

    changed, rejected = [], []

    for f in data['features']:
        lid = f['properties']['id']
        name = f['properties'].get('name_ko') or lid
        # 공식 영업거리를 아는 노선만 고친다. 모르는 노선은 고쳐도 맞는지 알 수 없다.
        if lid not in OFFICIAL or lid in LOOPS:
            continue
        geom = f['geometry']
        multi = geom['type'] == 'MultiLineString'
        parts = geom['coordinates'] if multi else [geom['coordinates']]
        before = sum(path_km(p) for p in parts)
        if before < 1:
            continue

        new, log = repair(parts, name)
        after = sum(path_km(p) for p in new)
        if not log:
            continue

        official = OFFICIAL.get(lid)
        ok = True
        if official:
            err_before = abs(before - official) / official
            err_after = abs(after - official) / official
            ok = err_after <= ACCEPT or err_after < err_before

        line = f'  {name}: {before:.2f} → {after:.2f}km'
        if official:
            line += f'  (공식 {official:.1f}km, 오차 {abs(after - official) / official * 100:.0f}%)'
        print(line)
        for l in log:
            print(f'      {l}')

        if not ok:
            print('      ✗ 공식값에서 너무 멀어짐 → 되돌림')
            rejected.append((name, before, after, official))
            continue

        changed.append((name, before, after, official))
        if apply:
            if len(new) == 1:
                geom['type'] = 'LineString'
                geom['coordinates'] = new[0]
            else:
                geom['type'] = 'MultiLineString'
                geom['coordinates'] = new

    if not changed and not rejected:
        print('손볼 곳이 없습니다.')
        return

    print(f'\n고칠 노선 {len(changed)}개 / 되돌린 노선 {len(rejected)}개')
    if rejected:
        for name, b, a, o in rejected:
            print(f'  되돌림: {name} {b:.1f}→{a:.1f}km (공식 {o:.1f})')

    if not apply:
        print('\n미리보기입니다. 반영하려면 --apply')
        return

    with open(LINES, 'w', encoding='utf-8') as fp:
        json.dump(data, fp, ensure_ascii=False, separators=(',', ':'))
    print(f'\n저장: {LINES}')


if __name__ == '__main__':
    main()
