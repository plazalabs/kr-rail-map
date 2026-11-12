# 레일포털 전체_도시철도운행정보 XLSX → 피클 (extract_kric_headways.py · extract_kric_runtimes.py 가 읽는다)
# 실행: python -I data/kric_to_pickle.py <전체_도시철도운행정보.xlsx> <kric.pkl>
import sys, collections, pickle
sys.stdout.reconfigure(encoding='utf-8')
import openpyxl
wb = openpyxl.load_workbook(sys.argv[1], read_only=True, data_only=True)
ws = wb.worksheets[0]
rows = ws.iter_rows(values_only=True)
head = next(rows)
data = []
lines = collections.Counter(); days = collections.Counter(); ops = collections.Counter()
for r in rows:
    if not r[0]: continue
    data.append(r[:13])
    lines[(r[1], r[2])] += 1; days[r[6]] += 1; ops[r[5]] += 1
print('요일', dict(days)); print('운행유형', dict(ops))
for (no, nm), n in sorted(lines.items(), key=lambda x: x[0][1] or ''):
    print(no, nm, n)
pickle.dump(data, open(sys.argv[2], 'wb'))
