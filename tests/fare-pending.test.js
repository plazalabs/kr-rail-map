/* 요금 미정(개통 전 GTX) 경로를 확정 요금처럼 비교하지 않기 (I3, 감사2, 2026-11-14)
 * 감사: 강남→서울(개통 예정 포함) 최적 3,300원(GTX-D 미정 0원 포함)과 견줘 '최소요금은 1,550원 절약'이라고 했다.
 * 실행: node tests/fare-pending.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const J = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const L = J('data/lines.geojson'), S = J('data/stations.geojson');
const ctx = vm.createContext({ console, Math, Map, Set, Array, Object, JSON, Infinity, Promise, document: { getElementById: () => null, createElement: () => ({ style: {}, appendChild() {} }), head: { appendChild() {} }, addEventListener() {} }, window: {} });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/route.js'), 'utf8').replace('const RouteFinder', 'globalThis.RouteFinder'), ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/route-compare.js'), 'utf8').replace('const RouteCompare', 'globalThis.RouteCompare'), ctx);
const RF = ctx.RouteFinder, RC = ctx.RouteCompare;
RF.buildGraph(L.features, S.features); RF.loadTransfers(J('data/transfer-times.json')); RC.init(RF, S.features, L.features);
let pass = 0, fail = 0;
const check = (l, c, d) => { if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; console.log(`  ✗ ${l}  ${d === undefined ? '' : JSON.stringify(d).slice(0, 300)}`); } };
const id = (n, l) => S.features.find(f => f.properties.name_ko === n && (f.properties.lines || []).includes(l)).properties.id;

console.log('\n[강남→서울, 개통 예정 포함]');
const all = RC.findAll(id('강남', 'seoul-subway-line-2'), id('서울', 'seoul-metropolitan-subway-line-4'));
const ins = RC.insightOf(all);
check('최적 경로에 요금 미정 부분이 있음 (시험 전제)', RC.hasPending(all.time), all.time && all.time.fareDetail && all.time.fareDetail.parts.map(p => p.kind));
check("요금 미정이 끼면 '○원 절약'이라고 하지 않음", !/원 절약/.test(ins), ins);
check("요금 비교 문장 자체를 안 냄 (금액 없음)", !/원/.test(ins), ins);
check('최소요금 탭은 요금이 다 정해진 길에서 고름 (정해진 후보가 있을 때)', !RC.hasPending(all.fare), all.fare && all.fare.fareDetail && all.fare.fareDetail.parts.map(p => p.kind));

console.log('\n[운행 중 노선만 — 미정 없음, 예전 동작 그대로]');
const open = RC.findAllOpen(id('강남', 'seoul-subway-line-2'), id('서울', 'seoul-metropolitan-subway-line-4'));
check('운행 중 경로는 미정 없음', !RC.hasPending(open.time) && !RC.hasPending(open.fare));
console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
