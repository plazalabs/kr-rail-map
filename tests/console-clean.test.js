/* 콘솔 정리 (K11, 6차 ①B1·A9, 2026-11-14) — node tests/console-clean.test.js */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function check(label, cond, detail) { if (cond) { pass++; console.log(`  ✓ ${label}`); } else { fail++; console.log(`  ✗ ${label}  ${detail || ''}`); } }
const js = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js'));
const logs = [];
js.forEach(f => fs.readFileSync(path.join(ROOT, 'js', f), 'utf8').split('\n').forEach((l, i) => { if (/^\s*console\.log\(/.test(l)) logs.push(`${f}:${i + 1}`); }));
check('js/ 에 console.log 없음', logs.length === 0, logs.join(' '));
const app = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
check("styleimagemissing 처리 (빈 그림 채움)", /map\.on\('styleimagemissing'/.test(app) && /map\.addImage\(id, \{ width: 1, height: 1/.test(app));
const i = app.indexOf('function guardNumericFilter'), j = app.indexOf('function guardBasemapFilters');
const g = new Function(app.slice(i, j) + '; return guardNumericFilter;')();
const shield = ['all', ['<=', ['get', 'ref_length'], 6], ['match', ['get', 'network'], ['us-highway'], false, true]];
check('배경 숫자 비교 감쌈: <= → 없으면 큰 수', JSON.stringify(g(shield)[1]) === JSON.stringify(['<=', ['coalesce', ['get', 'ref_length'], 1e9], 6]), JSON.stringify(g(shield)));
check('>= → 없으면 작은 수, 나머지 그대로', JSON.stringify(g(['>=', ['get', 'rank'], 3])) === JSON.stringify(['>=', ['coalesce', ['get', 'rank'], -1e9], 3]) && JSON.stringify(g(shield)[2]) === JSON.stringify(shield[2]));
console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
