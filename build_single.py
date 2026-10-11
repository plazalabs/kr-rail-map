#!/usr/bin/env python3
"""단일파일 빌드: 모든 에셋을 index.html 하나에 인라인.
출력: dist/kr-rail-map-single.html (브라우저에서 직접 열면 동작)
"""
import os, re, json

ROOT = os.path.dirname(os.path.abspath(__file__))

def read(p):
    with open(os.path.join(ROOT, p), encoding='utf-8') as f:
        return f.read()

def inline_json(path):
    with open(os.path.join(ROOT, path), encoding='utf-8') as f:
        data = f.read()
    # </script> 시퀀스 무력화
    return data.replace('</', '<\\/')

html = read('index.html')

# manifest/icon 링크 제거 (단일파일에 없음)
html = re.sub(r'<link rel="manifest"[^>]*>\n?', '', html)
html = re.sub(r'<link rel="icon"[^>]*>\n?', '', html)
html = re.sub(r'<meta name="theme-color"[^>]*>\n?', '', html)

# CSS 인라인
css = read('vendor/maplibre-gl.css') + '\n' + read('css/style.css')
html = html.replace('<link href="vendor/maplibre-gl.css" rel="stylesheet">\n<link rel="stylesheet" href="css/style.css">',
                    '<style>\n' + css + '\n</style>')

# 데이터 인라인 (app.js보다 먼저)
data_js = ('<script>\nwindow.KRRAIL_INLINE = {\nlines: ' + inline_json('data/lines.geojson') +
           ',\nstations: ' + inline_json('data/stations.geojson') + '\n};\n</script>')
html = html.replace('<script src="vendor/maplibre-gl.js"></script>',
                    data_js + '\n<script>\n' + read('vendor/maplibre-gl.js') + '\n</script>')

# 앱 JS 인라인
for src in ['js/route.js', 'js/draw.js', 'js/app.js']:
    html = html.replace(f'<script src="{src}"></script>',
                        '<script>\n' + read(src) + '\n</script>')

os.makedirs(os.path.join(ROOT, 'dist'), exist_ok=True)
out = os.path.join(ROOT, 'dist', 'kr-rail-map-single.html')
with open(out, 'w', encoding='utf-8') as f:
    f.write(html)
print('built:', out, f'{os.path.getsize(out)/1024/1024:.1f} MB')
