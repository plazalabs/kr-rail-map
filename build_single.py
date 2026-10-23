#!/usr/bin/env python3
"""단일파일 빌드: 모든 에셋을 index.html 하나에 인라인.

출력: dist/kr-rail-map-single.html — 브라우저에서 파일을 직접 열어도 동작한다.
(로컬 파일에서는 fetch 가 막히므로 데이터도 인라인해야 한다)

index.html 의 <script defer src="js/*.js"> 를 그대로 따라간다.
스크립트 목록을 여기서 따로 관리하면 index.html 과 어긋나므로,
정규식으로 index.html 에 적힌 순서를 그대로 읽는다.
"""
import os
import re

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(ROOT, 'dist')
OUT = os.path.join(OUT_DIR, 'kr-rail-map-single.html')


def read(p):
    with open(os.path.join(ROOT, p), encoding='utf-8') as f:
        return f.read()


def inline_json(path):
    with open(os.path.join(ROOT, path), encoding='utf-8') as f:
        data = f.read()
    # </script> 시퀀스 무력화
    return data.replace('</', '<\\/')


html = read('index.html')

# 단일파일에는 필요 없는 링크
html = re.sub(r'<link rel="manifest"[^>]*>\n?', '', html)
html = re.sub(r'<link rel="icon"[^>]*>\n?', '', html)
html = re.sub(r'<meta name="theme-color"[^>]*>\n?', '', html)

# CSS 인라인
css = read('vendor/maplibre-gl.css') + '\n' + read('css/style.css')
html = html.replace(
    '<link href="vendor/maplibre-gl.css" rel="stylesheet">\n'
    '<link rel="stylesheet" href="css/style.css">',
    '<style>\n' + css + '\n</style>')

# 데이터 인라인 (앱 스크립트보다 먼저 실행돼야 한다)
data_js = ('<script>\nwindow.KRRAIL_INLINE = {\nlines: ' + inline_json('data/lines.geojson') +
           ',\nstations: ' + inline_json('data/stations.geojson') + '\n};\n</script>')

# index.html 에 적힌 <script defer src="..."> 를 순서대로 인라인
pattern = re.compile(r'<script\s+defer\s+src="([^"]+)"\s*>\s*</script>')
srcs = pattern.findall(html)
if not srcs:
    raise SystemExit('index.html 에서 <script defer src="..."> 를 찾지 못했습니다.')


def replace(m):
    src = m.group(1)
    body = read(src)
    head = data_js + '\n' if src.startswith('vendor/') else ''
    return head + '<script>\n' + body + '\n</script>'


html = pattern.sub(replace, html)

# 인라인하지 못한 스크립트가 남아 있으면 알린다.
# 방금 넣은 인라인 블록(<script>)은 걷어내고 본다 — 파일 안 주석에 적힌
# <script src="..."> 예시까지 '남은 참조'로 오인하지 않기 위해서다.
stripped = re.sub(r'<script>\n.*?\n</script>', '', html, flags=re.S)
leftover = re.findall(r'<script[^>]*src="([^"]+)"', stripped)
if leftover:
    print('경고: 인라인되지 않은 스크립트', leftover)

os.makedirs(OUT_DIR, exist_ok=True)
with open(OUT, 'w', encoding='utf-8') as f:
    f.write(html)
print(f'built: {OUT}  {os.path.getsize(OUT) / 1024 / 1024:.1f} MB  (스크립트 {len(srcs)}개)')
