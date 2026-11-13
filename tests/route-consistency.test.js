/* 같은 경로 = 같은 시간 (I1, 감사1) · 출퇴근 배차 자료가 계산을 바꾼다 (I2, 감사5) — 2026-11-14
 * 감사: 강남→서울 같은 12역·환승 1회 경로가 '최적' 31분, '최소환승' 28분 — route-compare 만 환승 대기를 뺐다.
 * 실행: node tests/route-consistency.test.js
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
const check = (l, c, d) => { if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; console.log(`  ✗ ${l}  ${d === undefined ? '' : JSON.stringify(d).slice(0, 400)}`); } };
const id = (n, l) => S.features.find(f => f.properties.name_ko === n && (!l || (f.properties.lines || []).includes(l))).properties.id;
const tabs = all => ['time', 'transfer', 'fare'].map(k => all[k]).filter(Boolean);
const key = r => (r.path || []).join('>') + '|' + (r.legs || []).map(l => l.lineId).join(',');

console.log('\n[I1] 강남→서울 — 같은 경로면 탭과 상관없이 같은 분');
const all = RC.findAllOpen(id('강남', 'seoul-subway-line-2'), id('서울', 'seoul-metropolitan-subway-line-4'));
const byPath = {};
tabs(all).forEach(r => { (byPath[key(r)] = byPath[key(r)] || new Set()).add(r.minutes); });
check('같은 경로끼리 분이 하나', Object.values(byPath).every(s => s.size === 1), Object.entries(byPath).map(([k, s]) => [k.slice(0, 40), [...s]]));
const ref = RF.findRoute(id('강남', 'seoul-subway-line-2'), id('서울', 'seoul-metropolitan-subway-line-4'), { openOnly: true });
const same = tabs(all).filter(r => key(r) === key(ref));
check('길찾기 기본(findRoute)과 같은 경로인 탭은 같은 분', same.every(r => r.minutes === ref.minutes), { ref: ref.minutes, tabs: same.map(r => r.minutes) });

console.log('\n[I1] 표본 60쌍 — 같은 경로 = 같은 분 (불변식)');
const pool = S.features.filter(f => (f.properties.lines || []).some(l => /seoul-subway-line-[1-9]$|gyeongui|suin|airport|shinbundang/.test(l))).map(f => f.properties.id);
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
let bad = [];
for (let i = 0; i < 60; i++) {
  const a = pool[Math.floor(rnd() * pool.length)], b = pool[Math.floor(rnd() * pool.length)];
  if (a === b) continue;
  const A = RC.findAllOpen(a, b), m = {};
  tabs(A).forEach(r => { (m[key(r)] = m[key(r)] || new Set()).add(r.minutes); });
  if (!Object.values(m).every(s => s.size === 1)) bad.push([a, b]);
}
check('60쌍 모두 같은 경로 = 같은 분', bad.length === 0, bad.slice(0, 5));

console.log('\n[I2] 출퇴근 배차 자료');
const dest = id('강남', 'seoul-subway-line-2');
const count = (m, lim) => [...m.values()].filter(v => v <= lim).length;
const base = RF.allTimesFrom(dest, { openOnly: true, peakWait: false });
const noDoc = RF.allTimesFrom(dest, { openOnly: true, peakWait: true });
check('자료 없을 땐 배차 넣기가 아무것도 못 바꿈 (그래서 자료를 꼭 받아야 함)', [...base].every(([k, v]) => noDoc.get(k) === v) && RF.hasHeadways() === false);
check('loadHeadways(실제 자료) → hasHeadways', RF.loadHeadways(J('data/headways.json')) === true && RF.hasHeadways() === true);
const peak = RF.allTimesFrom(dest, { openOnly: true, peakWait: true });
const diff = [...base].filter(([k, v]) => peak.get(k) !== v).length;
check('자료를 받으면 배차 넣기가 역 시간을 바꾼다 (100역 이상)', diff > 100, diff);
check('15·30분권 역 수가 줄어든다 (기다리는 시간이 붙으므로)', count(peak, 15) < count(base, 15) && count(peak, 30) < count(base, 30), { base: [count(base, 15), count(base, 30)], peak: [count(peak, 15), count(peak, 30)] });

console.log('\n[I2] 화면 코드가 자료를 받는다');
const app = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8'), cm = fs.readFileSync(path.join(ROOT, 'js/commute.js'), 'utf8');
check("app.js 가 data/headways.json 을 받아 RouteFinder.loadHeadways 에 넘김", /fetch\('data\/headways\.json'\)/.test(app) && /RouteFinder\.loadHeadways\(doc\)/.test(app));
check('통근권은 배차 넣기가 켜졌는데 자료가 없으면 받고 다시 계산', /KR_ensureHeadways\(\)\.then/.test(cm));
check("못 받으면 통근권 요약에 '배차 없이 계산'", /배차 자료를 못 받아 배차 없이 계산/.test(cm));
console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
