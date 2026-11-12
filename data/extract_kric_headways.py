# 레일포털 전체 도시철도운행정보 → 노선·역·방향별 평일 07:00~09:00 출발 횟수 → 배차(분)
import sys, pickle, collections, statistics, json, datetime
sys.stdout.reconfigure(encoding='utf-8')
data = pickle.load(open(sys.argv[1], 'rb'))
# 열차별로 순서대로 (같은 열차번호·요일·노선)
import re
def tparse(x):
    x = (x or '').strip()
    m = re.match(r'^(\d{1,2}):(\d{2})(?::(\d{2}))?$', x)
    if not m: return None
    h, mi = int(m.group(1)), int(m.group(2))
    if h > 29: return None
    return datetime.time(h % 24, mi)
trains = collections.defaultdict(list)
for r in data:
    # 한 줄에 열차 한 대를 몰아 적은 형식 (신분당·공항철도·경전철·인천): '코드-역명+코드-역명…' / '코드-시각+…'
    if r[7] and re.search(r'[+,]', str(r[7])) and (r[9] or r[8]) and not isinstance(r[9], datetime.time):
        tno, lno, lname, a, b, typ, day = r[:7]
        if day not in ('평일', '평일+토요일+공휴일'):
            continue
        sts = re.findall(r'([A-Z]?\d+)-([^+,/]+)', str(r[7]))
        def tmap(field):
            out = {}
            for code, tv in re.findall(r'([A-Z]?\d+)[-+]\s*(\d{1,2}:\d{2}(?::\d{2})?|\s*:\s*)', str(field or '')):
                t = tparse(tv)
                if t: out[code] = t
            return out
        dep, arr = tmap(r[9]), tmap(r[8])
        for code, name in sts:
            t = dep.get(code) or arr.get(code)
            if t: trains[(lname, str(tno), a, b)].append((re.sub(r'역$', '', name.strip()), t))
        continue
    tno, lno, lname, a, b, typ, day, st, arr, dep = r[:10]
    if day not in ('평일', '평일+토요일+공휴일'):
        continue
    t = dep or arr
    if isinstance(t, str): t = tparse(t)   # 광주 등: '05:25:00' 글자
    if not isinstance(t, datetime.time):
        continue
    trains[(lname, tno, a, b)].append((st, t))
cnt = collections.Counter()
for (lname, tno, a, b), seq in trains.items():
    for i, (st, t) in enumerate(seq):
        nxt = seq[i + 1][0] if i + 1 < len(seq) else None
        if nxt is None:
            continue   # 종착역 도착은 출발이 아니다
        m = t.hour * 60 + t.minute
        if 7 * 60 <= m < 9 * 60:
            cnt[(lname, st, nxt)] += 1
per = collections.defaultdict(dict)
for (ln, st, nxt), n in cnt.items():
    if n < 2:
        continue
    hw = 120 / n
    per[ln][st] = min(per[ln].get(st, 999), hw)   # 두 방향 중 촘촘한 쪽
out = {}
for ln, sts in sorted(per.items()):
    v = sorted(sts.values())
    out[ln] = {'median': round(statistics.median(v), 2), 'n': len(v), 'stations': {k: round(x, 2) for k, x in sts.items()}}
    print(ln.ljust(22), '역', str(len(v)).rjust(3), '중앙', out[ln]['median'], '범위', round(v[0], 1), '~', round(v[-1], 1))
json.dump(out, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False)
