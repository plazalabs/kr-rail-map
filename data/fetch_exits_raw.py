"""지하철 출구 좌표를 OSM Overpass 에서 받아 캐시한다.

부동산에서 '역까지 몇 분' 은 역 중심점이 아니라 **가까운 출구**까지의 거리다.
강남역처럼 긴 역은 중심점과 출구가 300m 넘게 벌어져 도보 4분 차이가 난다.

전국을 한 번에 질의하면 4,500개·1.3MB 로 30초면 끝난다. 다만 공용 서버가
붐빌 때는 504 가 나므로, 실패하면 4분할 → 16분할로 쪼개 재시도한다.

실행: python data/fetch_exits_raw.py
결과: data/_exits_raw.json  (한 번 받으면 재사용. 지우고 다시 받으면 갱신)
"""
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '_exits_raw.json')

UA = 'kr-rail-map/1.0 (station exit coords; +https://github.com/plazalabs/kr-rail-map)'
ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
]

# 역 좌표 실측 범위(경도 126.39~129.45, 위도 34.63~38.26)에 여유를 둔 상자.
# 제주·울릉도에는 도시철도가 없으므로 뺀다 — 상자를 넓히면 바다를 스캔해 느려진다.
BOX = (34.4, 126.2, 38.5, 129.7)   # (south, west, north, east)


def fetch(bb, timeout=280):
    s, w, n, e = bb
    q = ('[out:json][timeout:%d];'
         'node["railway"="subway_entrance"](%f,%f,%f,%f);out body;' % (timeout - 20, s, w, n, e))
    last = None
    for attempt in range(4):
        url = ENDPOINTS[attempt % len(ENDPOINTS)]
        req = urllib.request.Request(
            url,
            data=urllib.parse.urlencode({'data': q}).encode(),
            headers={'User-Agent': UA,
                     'Content-Type': 'application/x-www-form-urlencoded'},
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.load(r).get('elements', [])
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError) as e:
            last = e
            print('    재시도 %d (%s)' % (attempt + 1, type(e).__name__))
            time.sleep(3 + 3 * attempt)
    raise RuntimeError(str(last))


def grab(bb, depth, acc, max_depth=2):
    s, w, n, e = bb
    try:
        els = fetch(bb)
    except RuntimeError as err:
        if depth >= max_depth:
            print('    포기 %.2f,%.2f,%.2f,%.2f (%s)' % (s, w, n, e, err))
            return 0
        mlat, mlon = (s + n) / 2, (w + e) / 2
        print('    4분할 (depth %d)' % (depth + 1))
        total = 0
        for sb in ((s, w, mlat, mlon), (s, mlon, mlat, e),
                   (mlat, w, n, mlon), (mlat, mlon, n, e)):
            total += grab(sb, depth + 1, acc, max_depth)
        return total
    acc.extend(els)
    return len(els)


def main():
    if os.path.exists(OUT):
        n = len(json.load(open(OUT, encoding='utf-8'))['elements'])
        print('이미 있음: %s (%d개) — 지우면 다시 받는다' % (OUT, n))
        return

    acc = []
    got = grab(BOX, 0, acc)
    print('받음 %d개' % got)

    seen = {}
    for el in acc:
        if el.get('tags', {}).get('railway') == 'subway_entrance':
            seen[el['id']] = el
    json.dump({'elements': list(seen.values())}, open(OUT, 'w', encoding='utf-8'),
              ensure_ascii=False)
    print('저장: %s — %d개' % (OUT, len(seen)))


if __name__ == '__main__':
    main()
