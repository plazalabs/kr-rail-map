"""서울교통공사 공식 역간 소요시간 → js/route.js 의 OFFICIAL_RUNTIMES 블록 (2026-11-11)

원자료: 서울열린데이터광장 OA-12034 「서울교통공사_역간거리 및 소요시간」
        파일 '서울교통공사 역간거리 및 소요시간_240810.csv' (2024.3.25. 기준 표준 운행시간, CP949)
        → data/_gov/seoul_metro_runtimes_240810.csv 로 보관.
라이선스: 공공누리 제1유형(출처표시, 상업적 이용·변경 가능). 출처: 서울교통공사.

이 시간은 '역과 역 사이를 달리는 시간'이다. 역에 서 있는 시간(정차)은 빠져 있어서
route.js 가 정차역마다 DWELL_MIN(0.5분)을 더한다. 확인: 시청→청량리 공식 12분 + 정차 8번 4분 = 16분.

연속한 두 행(같은 호선)을 한 쌍으로 쓴다. 지선 경계(2호선 성수·신정지선, 5호선 마천지선)에서
생기는 엉뚱한 쌍은 route.js 가 '실제로 이어진 두 역'에만 붙이므로 쓰이지 않는다.

실행: python data/build_official_runtimes.py
"""
import csv, io, json, os, re, sys

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'data', '_gov', 'seoul_metro_runtimes_240810.csv')
ROUTE = os.path.join(ROOT, 'js', 'route.js')

LID = {
    '1': 'seoul-metropolitan-subway-line-1', '2': 'seoul-subway-line-2', '3': 'seoul-metro-line-3',
    '4': 'seoul-metropolitan-subway-line-4', '5': 'seoul-subway-line-5', '6': 'seoul-subway-line-6',
    '7': 'seoul-subway-line-7', '8': 'seoul-subway-line-8',
}
# 공식 자료의 옛 이름 → 지도 이름 (둘 이상이면 모두)
ALIAS = {'당고개': ['불암산'], '총신대입구': ['이수', '총신대입구(이수)'], '서울역': ['서울'],
         '신내역': ['신내'], '암사역사공원': ['암사역사공원']}


def names(n):
    n = n.strip()
    out = ALIAS.get(n, [n])
    if n.endswith('역') and n not in ALIAS:
        out = [n, n[:-1]]
    return out


raw = open(SRC, 'rb').read()
try:
    text = raw.decode('utf-8')
except UnicodeDecodeError:
    text = raw.decode('cp949')
rows = list(csv.DictReader(io.StringIO(text)))
table = {}
for a, b in zip(rows, rows[1:]):
    if a['호선'] != b['호선']:
        continue
    m, s = b['소요시간'].split(':')
    sec = int(m) * 60 + int(s)
    if sec <= 0:
        continue
    lid = LID[b['호선']]
    for na in names(a['역명']):
        for nb in names(b['역명']):
            table.setdefault(lid, []).append([na, nb, sec])

block = ('  // <official-runtimes> — data/build_official_runtimes.py 가 만든다. 손으로 고치지 말 것.\n'
         '  // 출처: 서울교통공사 역간거리 및 소요시간(2024.3.25. 기준), 서울열린데이터광장 OA-12034, 공공누리 제1유형\n'
         '  const OFFICIAL_RUNTIMES = ' + json.dumps(table, ensure_ascii=False, separators=(',', ':')) + ';\n'
         '  // </official-runtimes>\n')
src = io.open(ROUTE, encoding='utf-8', newline='').read()
crlf = '\r\n' in src
s = src.replace('\r\n', '\n')
pat = re.compile(r'  // <official-runtimes>.*?// </official-runtimes>\n', re.S)
if pat.search(s):
    s = pat.sub(lambda _: block, s)
else:
    anchor = '  const TRANSFER_MIN = 4;'
    assert s.count(anchor) == 1
    s = s.replace(anchor, block + anchor)
if crlf:
    s = s.replace('\n', '\r\n')
io.open(ROUTE, 'w', encoding='utf-8', newline='').write(s)
print('노선', len(table), '· 쌍', sum(len(v) for v in table.values()))
