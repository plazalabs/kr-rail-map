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
check('casing 레이어가 rail-lines 보다 먼저(아래) 추가', app.indexOf("id: 'rail-lines-casing'") > 0 && app.indexOf("id: 'rail-lines-casing'") < app.indexOf("id: 'rail-lines', type"));
check('casing 도 노선 필터·경로 숨김을 따라감', /setFilter\('rail-lines-casing'/.test(app) && /setPaintProperty\('rail-lines-casing', 'line-opacity', 0\)/.test(app) && /setPaintProperty\('rail-lines-casing', 'line-opacity', CASING_OPACITY\)/.test(app));
check('노선·미개통·하이라이트 색 = lineColorExpr', (app.match(/'line-color': lineColorExpr\(/g) || []).length === 3);

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
