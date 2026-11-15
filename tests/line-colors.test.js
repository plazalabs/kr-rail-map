/* 노선 casing·다크 색 (K9 ①A5·A6, 2026-11-14) — node tests/line-colors.test.js */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const lines = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/lines.geojson'), 'utf8')).features;
let pass = 0, fail = 0;
function check(label, cond, detail) { if (cond) { pass++; console.log(`  ✓ ${label}`); } else { fail++; console.log(`  ✗ ${label}  ${detail || ''}`); } }

const i = app.indexOf('function relLum'), j = app.indexOf('// 노선 색 식');
const { relLum, darkLineColor } = new Function(app.slice(i, j) + '; return { relLum, darkLineColor };')();
const ratio = hex => { const h = hex.slice(1); const c = [0, 2, 4].map(k => parseInt(h.slice(k, k + 2), 16)); return (relLum(...c) + 0.05) / (relLum(18, 18, 18) + 0.05); };

check('밝은 색은 그대로 (2호선 #00A84D)', darkLineColor('#00A84D') === '#00a84d', darkLineColor('#00A84D'));
check('1호선 #0052A4 → 밝힘', darkLineColor('#0052A4') !== '#0052a4' && ratio(darkLineColor('#0052A4')) >= 3, darkLineColor('#0052A4'));
check('색 형식 아니면 그대로', darkLineColor('red') === 'red' && darkLineColor(null) === null);
const colors = [...new Set(lines.map(f => f.properties.color).filter(Boolean))];
const bad = colors.filter(c => /^#[0-9a-f]{3,6}$/i.test(c) && ratio(darkLineColor(c)) < 3);
check(`모든 노선 색(${colors.length}개) 다크 대비 3:1 이상`, bad.length === 0, bad.join(','));
const changed = colors.filter(c => darkLineColor(c).toLowerCase() !== c.toLowerCase());
console.log(`    (다크에서 밝힌 색 ${changed.length}개: ${changed.slice(0, 8).join(' ')}…)`);
// P12 (11-15): 밝은 지도에서 역 점 테두리 — 모든 노선 색이 바탕(#f2f2f0)과 3:1 이상, 이미 진한 색은 그대로
const k1 = app.indexOf('function lightRingColor'), k2 = app.indexOf('// 지도에 그릴 역');
const lightRingColor = new Function('relLum', app.slice(k1, k2) + '; return lightRingColor;')(relLum);
const lratio = hex => { const h = hex.slice(1); const c = [0, 2, 4].map(k => parseInt(h.slice(k, k + 2), 16)); return (relLum(242, 242, 240) + 0.05) / (relLum(...c) + 0.05); };
const lbad = colors.filter(c => /^#[0-9a-f]{3,6}$/i.test(c) && lratio(lightRingColor(c)) < 3);
check(`역 점 테두리: 모든 노선 색(${colors.length}개) 밝은 지도 대비 3:1 이상`, k1 > 0 && lbad.length === 0, lbad.join(','));
check('역 점 테두리: 진한 색(1호선 #0052A4)은 그대로', lightRingColor('#0052A4') === '#0052a4', lightRingColor('#0052A4'));
check('역 점 테두리: 9호선 금색은 진하게', lightRingColor('#BDB092') !== '#bdb092' && lratio(lightRingColor('#BDB092')) >= 3, lightRingColor('#BDB092'));
check('역 점 테두리가 밝은 테마에서 lightRingColor 를 씀', /: lightRingColor\(c\), _n: n/.test(app));
check('casing 레이어가 rail-lines 보다 먼저(아래) 추가', app.indexOf("id: 'rail-lines-casing'") > 0 && app.indexOf("id: 'rail-lines-casing'") < app.indexOf("id: 'rail-lines', type"));
check('casing 도 노선 필터·경로 숨김을 따라감', /setFilter\('rail-lines-casing'/.test(app) && /setPaintProperty\('rail-lines-casing', 'line-opacity', 0\)/.test(app) && /setPaintProperty\('rail-lines-casing', 'line-opacity', CASING_OPACITY\)/.test(app));
check('노선·미개통·하이라이트 색 = lineColorExpr', (app.match(/'line-color': lineColorExpr\(/g) || []).length === 3);

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
