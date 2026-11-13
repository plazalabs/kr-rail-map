/* 나만의 노선 링크 공유 (js/draw.js DrawTools.Share) — 왕복·길이·거절
 * 실행: node tests/share-line.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ctx = vm.createContext({ console, Math, Map, Set, Array, Object, JSON, Infinity, URLSearchParams, encodeURIComponent, decodeURIComponent, window: {}, document: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'draw.js'), 'utf8').replace('const DrawTools', 'globalThis.DrawTools'), ctx);
const S = ctx.DrawTools.Share;
let pass = 0, fail = 0;
const check = (l, c, d) => { if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; console.log(`  ✗ ${l}  ${d === undefined ? '' : JSON.stringify(d).slice(0, 300)}`); } };

// 수도권 안 30점 (강남 근처에서 북서쪽으로)
const pts = []; for (let i = 0; i < 30; i++) pts.push([+(127.0276 - i * 0.0137).toFixed(6), +(37.4979 + i * 0.0091 + (i % 3) * 0.0007).toFixed(6)]);
const enc = S.encodePts(pts), dec = S.decodePts(enc);
check('왕복: 점 수 같음', dec && dec.length === 30, dec && dec.length);
check('왕복: 오차 1e-5 이하(약 1m)', dec && dec.every((c, i) => Math.abs(c[0] - pts[i][0]) <= 1e-5 && Math.abs(c[1] - pts[i][1]) <= 1e-5));
check('URL 안전 문자만', /^[A-Za-z0-9_-]+$/.test(enc), enc.slice(0, 40));
const line = { name: '우리 동네 <b>순환선</b> & 테스트', color: '#3f51b5', dashKey: '파선', coords: pts };
const q = S.shareQuery(line);
check('30점 링크 350자 안 (한글 이름 %인코딩 포함)', q.length < 350, q.length);
const back = S.parseShare(q);
check('parseShare 왕복: 이름·색·선', back && back.name === line.name && back.color === '#3f51b5' && back.dashKey === '파선', back && [back.name, back.color, back.dashKey]);
check('이름은 그대로 글자 (HTML 해석은 화면에서 textContent)', back && back.name.includes('<b>'));
check('한국 밖 좌표는 거절', S.parseShare('?ml=1.00.' + S.encodePts([[0, 0], [1, 1]])) === null);
check('점 1개는 거절', S.parseShare('?ml=1.00.' + S.encodePts([[127, 37.5]])) === null);
check('엉뚱한 문자열은 거절', S.parseShare('?ml=1.00.%%%') === null && S.parseShare('?ml=2.00.AAAA') === null && S.parseShare('?ml=1.0.AAAA') === null);
check('목록 밖 색 번호는 기본색', (S.parseShare('?ml=1.90.' + enc) || {}).color === '#e91e63');
check('이름 없으면 받은 노선', (S.parseShare('?ml=1.00.' + enc) || {}).name === '받은 노선');
check('이름은 40자까지', (S.parseShare(S.shareQuery({ name: 'ㄱ'.repeat(80), color: '#e91e63', dashKey: '실선', coords: pts })) || {}).name.length === 40);
// 길이 표 (설계 때 잰 값과 비교: 300점 ≈ 2,440자 → 우리 방식이 더 짧아야)
const many = []; for (let i = 0; i < 300; i++) many.push([127 + i * 0.001, 37.5 + Math.sin(i / 7) * 0.01]);
const L300 = S.shareQuery({ name: '긴 노선', color: '#e91e63', dashKey: '실선', coords: many }).length;
check('300점도 2,000자 안 (' + L300 + '자)', L300 < S.MAX, L300);

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
