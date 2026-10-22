#!/usr/bin/env python3
"""선형 단순화 — lines.geojson 좌표점을 줄인다.

배경
----
lines.geojson 은 46,426개 좌표점(974KB)이었다. 지도를 그리는 데는 필요하지만
줌 10~14에서 점 하나가 2~3m 간격이면 눈에 보이지도 않는다. 그런 점을 다 받고
다 파싱하는 데 첫 로딩 시간이 다 잡아먹혔다.

방법
----
1) Douglas-Peucker (미터 단위 허용오차) — 직선 구간의 중간점을 걷어낸다.
2) 좌표를 소수 5자리로 반올림 (약 1.1m). 7자리는 1cm 단위라 과하다.

주의
----
- 조각의 시작점·끝점은 절대 지우지 않는다. route.js 의 순환선 폐합 판정이
  '조각의 첫 점과 끝 점이 같은가'를 보기 때문이다.
- 허용오차를 키우면 폴리라인 길이가 짧아져 소요시간이 조금 빨라진다.
  기본 8m 는 46km 노선에서 0.02% 수준이라 무시할 만하다.

실행: python data/thin_geometry.py [허용오차m]
"""
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'lines.geojson')
TOL_M = float(sys.argv[1]) if len(sys.argv) > 1 else 8.0

M_PER_DEG_LAT = 110540.0


def to_xy(pt, lat0):
    """경위도 → 미터 평면 (국지 평면 근사)."""
    return (pt[0] * math.cos(math.radians(lat0)) * 111320.0, pt[1] * M_PER_DEG_LAT)


def seg_dist_m(p, a, b):
    """점 p 에서 선분 ab 까지의 거리 (m)."""
    px, py = p
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def douglas_peucker(pts, tol_m, lat0):
    """pts: [(lon,lat)] → 단순화된 [(lon,lat)] (양 끝점 보존)."""
    if len(pts) <= 2:
        return list(pts)
    xy = [to_xy(p, lat0) for p in pts]
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        lo, hi = stack.pop()
        if hi <= lo + 1:
            continue
        best_i, best_d = -1, -1.0
        for i in range(lo + 1, hi):
            d = seg_dist_m(xy[i], xy[lo], xy[hi])
            if d > best_d:
                best_i, best_d = i, d
        if best_d > tol_m:
            keep[best_i] = True
            stack.append((lo, best_i))
            stack.append((best_i, hi))
    return [p for p, k in zip(pts, keep) if k]


def round5(pt):
    return [round(pt[0], 5), round(pt[1], 5)]


def clean(coords):
    """반올림 후 붙어버린 중복점 제거. 양 끝점은 남긴다."""
    out = []
    for i, p in enumerate(coords):
        r = round5(p)
        if out and out[-1] == r and i != len(coords) - 1:
            continue
        out.append(r)
    return out


def main():
    before = os.path.getsize(SRC)
    data = json.load(open(SRC, encoding='utf-8'))

    pts_before = pts_after = 0
    for f in data['features']:
        g = f['geometry']
        pieces = [g['coordinates']] if g['type'] == 'LineString' else g['coordinates']
        new_pieces = []
        for piece in pieces:
            pts_before += len(piece)
            lat0 = piece[0][1]
            simp = douglas_peucker(piece, TOL_M, lat0)
            simp = clean(simp)
            pts_after += len(simp)
            new_pieces.append(simp)
        g['coordinates'] = new_pieces[0] if g['type'] == 'LineString' else new_pieces

    # 구분자 없이 저장 — 파일 크기가 목적이므로 들여쓰기를 넣지 않는다
    with open(SRC, 'w', encoding='utf-8') as fp:
        json.dump(data, fp, ensure_ascii=False, separators=(',', ':'))

    after = os.path.getsize(SRC)
    print(f'허용오차 {TOL_M}m')
    print(f'좌표점 {pts_before:,} → {pts_after:,}  ({pts_after / pts_before * 100:.0f}%)')
    print(f'용량   {before / 1024:.0f}KB → {after / 1024:.0f}KB  ({after / before * 100:.0f}%)')


if __name__ == '__main__':
    main()
