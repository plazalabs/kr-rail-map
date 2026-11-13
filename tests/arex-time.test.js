/* 공항철도 소요 시간 = 공식 안내와 맞는가 (2차 감사 V4, 2026-11-13)
 * 공식: airportrailroad.com 일반열차 노선 안내 — 서울역→인천공항1터미널 59분, 2터미널 66분 (일부 열차 2~6분 더)
 * 실행: node tests/arex-time.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const L = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/lines.geojson'), 'utf8')), S = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stations.geojson'), 'utf8'));
const ctx = vm.createContext({ console, Math, Map, Set, Array, Object, JSON, Infinity, Promise, document: { getElementById: () => null, createElement: () => ({ style: {}, appendChild() {} }), head: { appendChild() {} }, addEventListener() {} }, window: {} });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/route.js'), 'utf8').replace('const RouteFinder', 'globalThis.RouteFinder'), ctx);
const RF = ctx.RouteFinder; RF.buildGraph(L.features, S.features);
const id = (n, l) => S.features.find(f => f.properties.name_ko === n && f.properties.lines.includes(l)).properties.id;
let pass = 0, fail = 0;
const check = (l, c, d) => { if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; console.log(`  ✗ ${l}  ${d}`); } };
const m = t => RF.findRoute(id('서울', 'arex'), id(t, 'arex'), { openOnly: true }).minutes;
check('서울역→인천공항1터미널 = 공식 59분 (±1)', Math.abs(m('인천공항1터미널') - 59) <= 1, m('인천공항1터미널'));
check('서울역→인천공항2터미널 = 공식 66분 (±3)', Math.abs(m('인천공항2터미널') - 66) <= 3, m('인천공항2터미널'));
console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
