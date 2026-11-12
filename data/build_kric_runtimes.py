"""레일포털 시각표 → 역 사이 '달리는 시간' → js/route.js 의 KRIC_RUNTIMES 블록 (2026-11-12)

원자료: 레일포털 '전체_도시철도운행정보_20260630' (data.kric.go.kr id=900, 데이터 기준 2026-05-31, 이용허락범위 제한 없음).
        모든 도시·광역철도 운영기관의 열차별 역 도착·출발 시각. 원본(18MB XLSX)은 저장소에 넣지 않는다.
계산:   평일 '일반' 열차(급행 빼고)의 '다음 역 도착 − 이 역 출발' 중앙값(초). 열차 3대 이상 다닌 구간만.
        정차 시간은 빼 둔다 — route.js 가 서울교통공사 값처럼 정차 0.5분을 더한다.
        서울교통공사 공식값(OFFICIAL_RUNTIMES, 1~8호선 서울교통공사 구간)이 있는 구간은 그쪽이 먼저다.
        이 값이 채우는 곳: 1호선 코레일 구간(경부·경인·경원), 3호선 일산선, 4호선 안산과천선, 7호선 부천 구간, 9호선,
        경의중앙·경춘·경강·수인분당·서해·신분당·공항철도·신림·우이신설·김포골드·의정부·인천 1호선·지방 도시철도.
실행:   python data/build_kric_runtimes.py <rt_kric.json>   (rt_kric.json = data/extract_kric_runtimes.py 결과)
"""
import json, os, re, sys, collections

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROUTE = os.path.join(ROOT, 'js', 'route.js')

KRIC_TO = {
    '서울 도시철도 1호선': 'seoul-metropolitan-subway-line-1', '경부선': 'seoul-metropolitan-subway-line-1', '경인선': 'seoul-metropolitan-subway-line-1',
    '서울 도시철도 2호선': 'seoul-subway-line-2', '서울 도시철도 3호선': 'seoul-metro-line-3', '일산선': 'seoul-metro-line-3',
    '서울 도시철도 4호선': 'seoul-metropolitan-subway-line-4', '안산과천선': 'seoul-metropolitan-subway-line-4',
    '서울 도시철도 5호선': 'seoul-subway-line-5', '서울 도시철도 6호선': 'seoul-subway-line-6',
    '서울 도시철도 7호선': 'seoul-subway-line-7', '수도권 도시철도 7호선': 'seoul-subway-line-7',
    '서울 도시철도 8호선': 'seoul-subway-line-8', '서울 도시철도 9호선': 'seoul-subway-line-9',
    '경강선': 'seoul-metropolitan-subway-gyeonggang-line', '경의중앙선': 'gyeongui-jungang-line',
    '경춘선': 'seoul-metropolitan-subway-gyeongchun-line', '수인분당선': 'suin-bundang-line',
    '서해선': 'seoul-metropolitan-subway-seohae-line', '신분당선': 'seoul-metropolitan-subway-shinbundang-line',
    '인천국제공항선': 'arex', '수도권 경량도시철도 신림선': 'sillim-line', '수도권 경량도시철도 우이신설선': 'ui-sinseol-line',
    '김포골드라인': 'gimpo-goldline', '의정부': 'uijeongbu-lrt', '인천지하철 1호선': 'incheon-subway-line-1',
    '동해선': 'donghae-line', '대구도시철도 1호선': 'daegu-metro-line-1', '대구도시철도 2호선': 'daegu-metro-line-2',
    '대구도시철도 3호선': 'daegu-metro-line-3', '대전 도시철도 1호선': 'daejeon-metro-line-1',
    '부산 도시철도 1호선': 'busan-metro-line-1', '부산 도시철도 2호선': 'busan-metro-line-2-green-line',
    '부산 도시철도 3호선': 'busan-metro-line-3-brown-line', '부산 도시철도 4호선': 'busan-metro-line-4-blue-line',
    '부산김해경전철': 'busan-gimhae-light-rail-transit', '광주1호선': 'gwangju-metro-line-1-pyeongdong-nokdong',
}
ALIAS = {'디엠시': '디지털미디어시티', '경광주': '경기광주', '세종릉': '세종대왕릉', '도예촌': '신둔도예촌', '항공대': '한국항공대',
         '홍대입': '홍대입구', '효창공': '효창공원앞', '강남구': '강남구청', '수원시': '수원시청', '매탄권': '매탄권선',
         '평내호': '평내호평', '총신대입구': '총신대입구(이수)', '서울역': '서울'}


def norm(n):
    n = re.sub(r'\s+', '', str(n))
    if n.endswith('역') and len(n) > 2:
        n = n[:-1]
    return n.lstrip('0123456789')


def match(name, ours):
    k = norm(name)
    if k in ours: return k
    if ALIAS.get(k) in ours: return ALIAS[k]
    c = [o for o in ours if len(k) >= 2 and o.startswith(k)]
    if len(c) == 1: return c[0]
    c = [o for o in ours if len(k) >= 2 and o.replace('(', '').startswith(k.replace('(', ''))]
    return c[0] if len(c) == 1 else None


def main():
    src = json.load(open(sys.argv[1], encoding='utf-8'))
    stations = json.load(open(os.path.join(ROOT, 'data', 'stations.geojson'), encoding='utf-8'))['features']
    ours_of = collections.defaultdict(set)
    for f in stations:
        for l in f['properties'].get('lines') or []:
            ours_of[l].add(f['properties']['name_ko'])
    table = collections.defaultdict(dict)
    miss = collections.Counter()
    for kname, pairs in src.items():
        lid = KRIC_TO.get(kname)
        if not lid:
            continue
        for a, b, sec in pairs:
            ma, mb = match(a, ours_of[lid]), match(b, ours_of[lid])
            if not ma or not mb or ma == mb:
                miss[lid] += 1
                continue
            key = (ma, mb)
            # 같은 구간이 두 자료에 있으면(예: 1호선 서울교통공사 표 + 경부선) 짧은 쪽 — 급행 대피 대기가 섞인 값을 피한다
            table[lid][key] = min(table[lid].get(key, 10 ** 9), int(sec))
    out = {lid: [[a, b, s] for (a, b), s in sorted(d.items())] for lid, d in table.items()}
    n = sum(len(v) for v in out.values())
    block = ('  // <kric-runtimes> — data/build_kric_runtimes.py 가 만든다. 손으로 고치지 말 것.\n'
             '  // 출처: 레일포털 전체 도시철도운행정보 (data.kric.go.kr id=900, 데이터 기준 2026-05-31) — 평일 일반열차 달리는 시간 중앙값(초)\n'
             '  const KRIC_RUNTIMES = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n'
             '  // </kric-runtimes>\n')
    s = open(ROUTE, encoding='utf-8', newline='').read()
    crlf = '\r\n' in s
    s = s.replace('\r\n', '\n')
    if '// <kric-runtimes>' in s:
        s = re.sub(r'  // <kric-runtimes>.*?// </kric-runtimes>\n', lambda m: block, s, flags=re.S)
    else:
        anchor = '  // </official-runtimes>\n'
        assert anchor in s
        s = s.replace(anchor, anchor + block, 1)
    if crlf:
        s = s.replace('\n', '\r\n')
    open(ROUTE, 'w', encoding='utf-8', newline='').write(s)
    print('KRIC_RUNTIMES', len(out), '노선', n, '구간 · 못 맞춘 구간', dict(miss))


if __name__ == '__main__':
    main()
