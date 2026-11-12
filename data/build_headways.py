"""출퇴근 배차 간격 → data/headways.json (2026-11-12)

공식 원자료 (둘 다 로그인 없이 받음, 원본은 저장소에 넣지 않는다 — 크다):
  1) 서울교통공사_서울 도시철도 열차운행시각표_20260901 (공공데이터포털 15098251, CSV)
     — 1~9호선 전 역 (코레일 구간 포함) 열차별 도착·출발 시각
  2) 레일포털 '전체_도시철도운행정보_20260630' (data.kric.go.kr id=900, XLSX, 데이터 기준일 2026-05-31)
     — 코레일 광역전철·민자·경전철·지방 도시철도 열차별 시각 (일부 운영사는 운행간격 글)
계산: 평일 07:00~09:00(출근) 각 역에서 방향별로 떠나는 열차 수 → 배차 = 120분 ÷ 열차 수,
      두 방향 중 촘촘한 쪽. 역마다 따로 남기고, 노선 값은 역 중앙값.
      에버라인은 평일 자료가 '운영시간 17:00~20:00 운행간격 4분'(퇴근) 글뿐이라 4분,
      인천 2호선은 '운행시격 2분30초~10분' 글뿐이라 가장 짧은 2.5분(출퇴근)으로 읽는다.
GTX: GTX-A 운정중앙~서울역 출퇴근 6.25분(국토교통부, 2025-03-01 시행), 수서~동탄 17분(언론 보도).
     개통 전 GTX-B·C 등은 공식 출퇴근 배차가 아직 없어 GTX-A 운정중앙~서울역과 같게 둔다(추정 — 표에 src 'estimate').

실행: python data/build_headways.py <서울교통공사 CSV> <hw_kric.json(레일포털에서 뽑은 역별 값)>
      (hw_kric.json 은 레일포털 XLSX 를 읽어 만든 중간 결과 — 만드는 스크립트는 docs 주석 참고)
"""
import csv, io, json, os, statistics, sys, collections

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SM_LINES = {'1': 'seoul-metropolitan-subway-line-1', '2': 'seoul-subway-line-2', '3': 'seoul-metro-line-3',
            '4': 'seoul-metropolitan-subway-line-4', '5': 'seoul-subway-line-5', '6': 'seoul-subway-line-6',
            '7': 'seoul-subway-line-7', '8': 'seoul-subway-line-8', '9': 'seoul-subway-line-9'}
KRIC_LINES = {
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
SRC_SM = '서울교통공사 열차운행시각표 2026-09-01 (공공데이터포털 15098251), 평일 07~09시 출발 횟수로 계산'
SRC_KRIC = '레일포털 전체 도시철도운행정보 (data.kric.go.kr id=900, 데이터 기준 2026-05-31), 평일 07~09시 출발 횟수로 계산'


def norm(n):
    n = n.strip()
    if n.endswith('역') and len(n) > 2:
        n = n[:-1]
    return n


def seoul_metro(path):
    raw = open(path, 'rb').read()
    try:
        text = raw.decode('utf-8')
    except UnicodeDecodeError:
        text = raw.decode('cp949')
    cnt = collections.Counter()
    for r in csv.DictReader(io.StringIO(text)):
        if r['주중주말'] != 'DAY':
            continue
        t = r['열차출발시간'] or r['열차도착시간']
        if not t:
            continue
        m = int(t[:2]) * 60 + int(t[3:5])
        if 420 <= m < 540:
            cnt[(r['호선'], norm(r['역사명']), r['방향'])] += 1
    per = collections.defaultdict(dict)
    for (ln, st, d), n in cnt.items():
        if n < 2:
            continue
        per[ln][st] = min(per[ln].get(st, 999), 120 / n)
    return per


# 레일포털 역 이름은 줄임말이 많다 ('경광주', '평내호', '디엠시', '1양원') — 우리 역 이름에 맞춘다
ALIAS = {'디엠시': '디지털미디어시티', '경광주': '경기광주', '세종릉': '세종대왕릉', '도예촌': '신둔도예촌', '항공대': '한국항공대',
         '홍대입': '홍대입구', '효창공': '효창공원앞', '강남구': '강남구청', '수원시': '수원시청', '매탄권': '매탄권선',
         '평내호': '평내호평', '총신대입구': '총신대입구(이수)'}


def match_names(sts, ours):
    out = {}
    for k, v in sts.items():
        k2 = k.lstrip('0123456789').strip()
        cands = []
        if k2 in ours: cands = [k2]
        elif ALIAS.get(k2) in ours: cands = [ALIAS[k2]]
        else:
            cands = [o for o in ours if len(k2) >= 2 and o.startswith(k2)]
        if len(cands) == 1:
            out[cands[0]] = min(out.get(cands[0], 999), v)
    return out


def main():
    stations = json.load(open(os.path.join(ROOT, 'data', 'stations.geojson'), encoding='utf-8'))['features']
    ours_of = collections.defaultdict(set)
    for f in stations:
        for l in f['properties'].get('lines') or []:
            ours_of[l].add(f['properties']['name_ko'])
    sm = seoul_metro(sys.argv[1])
    kric = json.load(open(sys.argv[2], encoding='utf-8'))
    lines = {}
    for no, lid in SM_LINES.items():
        sts = {k: round(v, 2) for k, v in match_names(sm.get(no, {}), ours_of[lid]).items()}
        if not sts:
            continue
        lines[lid] = {'min': round(statistics.median(sts.values()), 2), 'src': 'official', 'source': SRC_SM, 'stations': sts}
    for name, lid in KRIC_LINES.items():
        k = kric.get(name)
        if not k:
            continue
        sts = match_names({norm(s): v for s, v in k['stations'].items()}, ours_of[lid])
        lines[lid] = {'min': k['median'], 'src': 'official', 'source': SRC_KRIC, 'stations': sts}
    lines['yongin-light-rail-transit'] = {'min': 4, 'src': 'official', 'source': "레일포털 전체 도시철도운행정보 — 에버라인 평일 '운영시간 17:00~20:00 운행간격 4분' (퇴근)"}
    lines['incheon-subway-line-2'] = {'min': 2.5, 'src': 'official', 'source': "레일포털 전체 도시철도운행정보 — 인천 2호선 평일 '운행시격 2분30초~10분' 중 가장 짧은 값(출퇴근)"}
    gtx_a = "국토교통부: GTX-A 운정중앙~서울역 출퇴근 배차 10분 → 6.25분 (2025-03-01 시행)"
    lines['great-train-express-line-a'] = {'min': 6.25, 'src': 'official', 'source': gtx_a,
                                           'south_min': 17, 'south_source': 'GTX-A 수서~동탄 출퇴근 17분 (언론 보도)', 'south_stations': ['수서', '성남', '구성', '동탄']}
    est = 'GTX-A 운정중앙~서울역 출퇴근 6.25분과 같게 (개통 전 — 공식 출퇴근 배차 없음, 추정)'
    for lid in ['gtx-a-seoul-suseo', 'gtx-a-changneung', 'gtx-b', 'gtx-c', 'gtx-d', 'gtx-e', 'gtx-f', 'gtx-g', 'gtx-h']:
        lines[lid] = {'min': 6.25, 'src': 'estimate', 'source': est}
    for lid, why in [('gtx-a-pyeongtaek', '연장 구간 — 본선 열차의 절반으로 가정 (추정)'), ('gtx-c-sangnoksu', '4호선 선로를 같이 씀 — 본선 열차의 절반으로 가정 (추정)')]:
        lines[lid] = {'min': 12.5, 'src': 'estimate', 'source': why}
    for lid in ['dongbuk-line', 'dongbu-line', 'daejeon-metro-line-2', 'gwangju-metro-line-2-inner-circle-line', 'daegusaneop-line']:
        lines[lid] = {'min': 5, 'src': 'estimate', 'source': '개통 전 — 공식 배차 없음 (추정)'}
    doc = {
        'schema': 'kr-rail-map/headways/2', 'updated': '2026-11-12',
        'basis': '출퇴근 배차 간격(분). 운영기관 공식 시간표 기준, 개통 전 노선은 추정.',
        'default': {'urban': 5, 'metro': 5, 'conventional': 30, 'ktx': 0},
        'lines': lines,
    }
    out = os.path.join(ROOT, 'data', 'headways.json')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
    off = sum(1 for v in lines.values() if v['src'] == 'official')
    print('headways.json', len(lines), '노선 (공식', off, ', 개통 전 추정', len(lines) - off, ')', round(os.path.getsize(out) / 1024), 'KB')
    for lid in ['seoul-subway-line-2', 'seoul-metropolitan-subway-line-1', 'gyeongui-jungang-line', 'seoul-metropolitan-subway-gyeongchun-line', 'arex']:
        print(' ', lid, lines[lid]['min'], '역', len(lines[lid].get('stations', {})))


if __name__ == '__main__':
    main()
