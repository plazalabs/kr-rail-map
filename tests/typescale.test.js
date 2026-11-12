/* 글자 크기는 7단계만 쓴다 (디자인 결함 전수 수정 작업 4, 2026-11-12)
 * 12 · 13 · 15 · 17 · 20 · 26 · 34 px — 본문 15, 보조 하한 12.
 * 지도 화면(css/style.css, js/*.js, index.html)은 var(--fs-*) 변수만, 따로 노는 페이지(rank/board/data)는 이 숫자만.
 * 캔버스 공유 이미지(ctx.font)와 SVG 노선도 글자 크기는 그림 크기라 검사하지 않는다.
 * 실행: node tests/typescale.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SCALE = [12, 13, 15, 17, 20, 26, 34];
const VARS = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'];
const FILES = ['css/style.css', 'index.html', 'rank.html', 'board.html', 'data.html']
  .concat(fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f));
const bad = [];
for (const rel of FILES) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const onMap = rel === 'css/style.css' || rel === 'index.html' || rel.startsWith('js/');
  src.split(/\r?\n/).forEach((line, i) => {
    for (const m of line.matchAll(/font-size:\s*([^;"'}!]+)/g)) {
      const v = m[1].trim();
      const vm = v.match(/^var\(--fs-([a-z0-9]+)\)$/);
      const pm = v.match(/^([0-9.]+)px$/);
      const ok = vm ? VARS.includes(vm[1]) : (pm && !onMap && SCALE.includes(+pm[1]));
      if (!ok && !/^(inherit|1em|100%)$/.test(v)) bad.push(`${rel}:${i + 1}  font-size: ${v}`);
    }
    for (const m of line.matchAll(/[\s;{]font:\s*(?:[0-9]{3}\s+)?([0-9.]+)px/g)) {
      if (!SCALE.includes(+m[1])) bad.push(`${rel}:${i + 1}  font: ${m[1]}px`);
    }
  });
}
const css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
VARS.forEach((k, i) => { if (!css.includes(`--fs-${k}: ${SCALE[i]}px`)) bad.push(`style.css: --fs-${k} 정의 없음`); });
if (bad.length) { console.error('스케일 밖 글자 크기 ' + bad.length + '곳\n' + bad.join('\n')); process.exit(1); }
console.log('글자 크기 7단계 통과 (' + FILES.length + '개 파일)');
