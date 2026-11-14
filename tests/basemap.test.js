/* 배경 지도 (K8, 2026-11-14) — node tests/basemap.test.js
 * 밝은 배경 = positron, 흑백 = 배경 레이어 색만 회색(캔버스 필터 없음 → 철도·경로 색 유지) */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
let pass = 0, fail = 0;
function check(label, cond, detail) { if (cond) { pass++; console.log(`  ✓ ${label}`); } else { fail++; console.log(`  ✗ ${label}  ${detail || ''}`); } }

check('일반 배경 = OpenFreeMap positron', /normal: 'https:\/\/tiles\.openfreemap\.org\/styles\/positron'/.test(app));
check('흑백 배경 = positron (+ grayBasemap)', /gray: 'https:\/\/tiles\.openfreemap\.org\/styles\/positron'/.test(app) && /map\.on\('style\.load', grayBasemap\)/.test(app));
check('캔버스 grayscale 필터 없음 (노선 색까지 회색이 되던 것)', !/filter:\s*grayscale/.test(css) && !/classList\.toggle\('grayscale'/.test(app));
check('흑백은 배경 출처 레이어만 (우리 노선 레이어 제외)', /l\.source !== 'openmaptiles' && l\.source !== 'ne2_shaded'/.test(app));

const i = app.indexOf('function grayOf'), j = app.indexOf('function grayBasemap');
const grayOf = new Function(app.slice(i, j) + '; return grayOf;')();
const cases = [['#fff', 'rgb(255,255,255)'], ['#dddddd', 'rgb(221,221,221)'], ['rgb(10, 200, 30)', 'rgb(147,147,147)'],
  ['rgba(1,2,3,0.5)', 'rgba(2,2,2,0.5)'], ['hsl(205,56%,73%)', 'hsl(205,0%,73%)'], ['hsla(0,0%,100%,0.4)', 'hsla(0,0%,100%,0.4)']];
cases.forEach(([a, want]) => check(`grayOf(${a}) = ${want}`, grayOf(a) === want, grayOf(a)));
check('모르는 형식은 건드리지 않음 (null)', grayOf('red') === null && grayOf('transparent') === null);

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
