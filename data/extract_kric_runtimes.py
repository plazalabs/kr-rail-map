# 실행: python -I data/extract_kric_runtimes.py <kric.pkl> <rt_kric.json>  → python data/build_kric_runtimes.py <rt_kric.json>
# 레일포털 전체 도시철도운행정보 → 노선별 '역 → 다음 역' 달리는 시간(초) 중앙값 (일반 열차, 평일)
#   달리는 시간 = 다음 역 도착 − 이 역 출발. 정차 시간은 빼고 (route.js 가 정차 0.5분을 따로 더한다)
import sys, pickle, collections, statistics, json, datetime, re
sys.stdout.reconfigure(encoding='utf-8')
data = pickle.load(open(sys.argv[1], 'rb'))

def tparse(x):
    if isinstance(x, datetime.time):
        return x.hour * 3600 + x.minute * 60 + x.second
    x = (str(x or '')).strip()
    m = re.match(r'^(\d{1,2}):(\d{2})(?::(\d{2}))?$', x)
    if not m: return None
    return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + int(m.group(3) or 0)

trains = collections.defaultdict(list)
for r in data:
    tno, lno, lname, a, b, typ, day, st, arr, dep = r[:10]
    if day not in ('평일', '평일+토요일+공휴일') or typ != '일반':
        continue
    if st and re.search(r'[+,]', str(st)):
        # 한 줄 몰아쓰기 형식
        sts = re.findall(r'([A-Z]?\d+)-([^+,/]+)', str(st))
        def tmap(field):
            out = {}
            for code, tv in re.findall(r'([A-Z]?\d+)[-+]\s*(\d{1,2}:\d{2}(?::\d{2})?|\s*:\s*)', str(field or '')):
                t = tparse(tv)
                if t is not None: out[code] = t
            return out
        A, D = tmap(arr), tmap(dep)
        for code, name in sts:
            trains[(lname, str(tno))].append((re.sub(r'역$', '', name.strip()), A.get(code), D.get(code)))
        continue
    trains[(lname, str(tno), a, b)].append((st, tparse(arr), tparse(dep)))

pairs = collections.defaultdict(list)
for key, seq in trains.items():
    lname = key[0]
    for i in range(len(seq) - 1):
        s1, a1, d1 = seq[i]; s2, a2, d2 = seq[i + 1]
        t1 = d1 if d1 is not None else a1
        t2 = a2 if a2 is not None else d2
        if t1 is None or t2 is None: continue
        dt = t2 - t1
        if dt < 0: dt += 86400
        if 20 <= dt <= 1800:
            pairs[(lname, s1, s2)].append(dt)
out = collections.defaultdict(list)
for (ln, a, b), v in pairs.items():
    if len(v) < 3: continue
    out[ln].append([a, b, int(statistics.median(v))])
for ln, v in sorted(out.items()):
    print(ln.ljust(22), '구간', len(v))
json.dump(out, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False)
