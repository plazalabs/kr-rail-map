"""KTX 공식 운임표(2026.9.1.)에서 노선별 '역 쌍 → 일반실 운임' 을 만든다 → data/ktx-fares.json

왜 필요한가:
  예전 KTX 요금은 실측 두 개(서울→강릉 27,600원, 서울→부산 59,800원)를 지나는 거리 공식이었다.
  2026-09-01 KTX·SRT 통합으로 KTX 운임이 SRT 수준으로 내렸고(공정위·국토부 합동 보도자료
  2026-08-02, 국토부 2026-08-31 — '평균 10%'), 공식은 이제 비싸게 틀린다. 서울→부산은 54,400원이다.

재료: (주)에스알 '운임 및 시간표' 페이지의 '운임표 다운로드' — 운임표(2026.9.1.).xls
  공공데이터포털 '(주)에스알_열차운임 및 시간표'(15154727, 이용허락범위 제한 없음)가 이 페이지를 원문으로 가리킨다.
  https://etk.srail.kr/cms/archive.do?pageId=TK0402050000  (파일: https://www.srail.or.kr/cms/attach/download.do?pageId=TK0402050000&atchNo=28)
  시트 28장 = 운행 계통(예: '1-1.서울~(서대구, 경주)~부산'). 같은 두 역이라도 계통(선로)에 따라 운임이 다르다
  (서울→부산: 신경주 경유 54,400원, 수원 경유 48,000원). 그래서 우리 노선마다 맞는 계통 시트만 쓴다(LINE_SHEETS).

규칙:
  - 일반실 '운임' 열(강릉·중앙선 시트는 '현재운임 일반실(A)')만 쓴다. 특실·우등실·'운행속도 향상 시' 열은 안 쓴다.
  - 역 이름은 괄호 기호·끝의 '역'·빈칸을 지워 맞춘다('김천(구미)' → '김천구미', '서울역' → '서울').
  - 한 노선에 시트가 여럿이면 앞 시트가 우선이다. 같은 시트 안에서 같은 쌍이 두 값이면 버리고 summary 에 남긴다.
  - 표에 없는 쌍은 만들지 않는다 → 앱이 '추정'으로 계산하고 화면에 '추정'이라고 적는다.

사용
  python data/build_ktx_fares.py <운임표(2026.9.1.).xls 경로>
"""
import hashlib
import json
import pathlib
import re
import sys
from datetime import date

import xlrd

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'ktx-fares.json'
EFFECTIVE = '2026-09-01'
SOURCE_URL = 'https://etk.srail.kr/cms/archive.do?pageId=TK0402050000'
FILE_URL = 'https://www.srail.or.kr/cms/attach/download.do?pageId=TK0402050000&atchNo=28'

# 우리 노선 ID → 쓸 계통 시트(이름 앞부분). 정차역·선로가 맞는 것부터.
LINE_SHEETS = {
    'gyeongbu-line-ktx': ['1.', '1-1.', '3.'],      # 신경주 경유(기본) → 서대구·신경주 경유(서대구 쌍) → 수원 경유(영등포 정차)
    'honam-line-ktx': ['8.', '6.', '7.'],           # 공주·김제 경유 → 공주 경유 → 서대전·정읍 경유
    'ktx': ['9.', '10.'],                           # 전라선: 공주 경유 → 서대전 경유
    'gangneung-line-ktx': ['18.'],                  # 서울~청량리~강릉·동해 (현재운임)
    'ktx-jungbunaeryuk-line': ['20.'],              # 판교(경기)~문경
}


def norm(name):
    return re.sub(r'\s', '', re.sub(r'역$', '', str(name).strip().replace('(', '').replace(')', '')))


def key(a, b):
    return '|'.join(sorted([norm(a), norm(b)]))


def read_sheets(path):
    book = xlrd.open_workbook(path, encoding_override='cp949')
    sheets = {}
    for i, name in enumerate(book.sheet_names()):
        sh = book.sheet_by_index(i)
        gcol = None
        for r in range(min(8, sh.nrows)):
            for c in range(sh.ncols):
                if gcol is None and str(sh.cell_value(r, c)).replace(' ', '').startswith('일반실'):
                    gcol = c
        pairs, conflicts = {}, []
        for r in range(sh.nrows):
            a, z = str(sh.cell_value(r, 1)).strip(), str(sh.cell_value(r, 2)).strip()
            v = sh.cell_value(r, gcol) if gcol is not None else ''
            if not (a and z and isinstance(v, float) and v > 0):
                continue
            k = key(a, z)
            if k in pairs and pairs[k] != int(v):
                conflicts.append([k, pairs[k], int(v)])
            pairs[k] = int(v)
        for k, _, _ in conflicts:
            pairs.pop(k, None)
        sheets[name.strip()] = {'pairs': pairs, 'conflicts': conflicts}
    return sheets


def main():
    if len(sys.argv) < 2:
        sys.exit('사용: python data/build_ktx_fares.py <운임표 xls 경로>')
    src = pathlib.Path(sys.argv[1])
    sha = hashlib.sha256(src.read_bytes()).hexdigest()
    sheets = read_sheets(src)
    lines, summary = {}, {}
    for lid, prefixes in LINE_SHEETS.items():
        used, pairs = [], {}
        for p in prefixes:
            name = next((n for n in sheets if n.startswith(p)), None)
            if not name:
                sys.exit(f'시트 없음: {lid} {p}')
            used.append(name)
            for k, v in sheets[name]['pairs'].items():
                pairs.setdefault(k, v)
        lines[lid] = {'sheets': used, 'pairs': dict(sorted(pairs.items()))}
        summary[lid] = {'pairs': len(pairs), 'conflicts_dropped': sum(len(sheets[n]['conflicts']) for n in used)}
    doc = {
        'meta': {
            'title': 'KTX 일반실 운임 (역 쌍)',
            'effective': EFFECTIVE,
            'provider': '(주)에스알 운임표 (KTX·SRT 통합 운임, 2026.9.1.)',
            'source_url': SOURCE_URL,
            'file_url': FILE_URL,
            'file_sha256': sha,
            'licence': 'data-go-kr-open',
            'licence_note': '공공데이터포털 15154727 (주)에스알_열차운임 및 시간표 — 이용허락범위 제한 없음, 원문 링크가 이 페이지',
            'built': date.today().isoformat(),
            'key': '역 이름 두 개를 정규화(괄호 기호·끝의 역·빈칸 제거)해 가나다순으로 | 로 이음',
            'fare': '일반실 운임(원). 특실·우등실 제외',
        },
        'summary': summary,
        'lines': lines,
    }
    OUT.write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(json.dumps(summary, ensure_ascii=False))
    print('→', OUT, OUT.stat().st_size, 'bytes')


if __name__ == '__main__':
    main()
