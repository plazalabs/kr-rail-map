/* 통근권 찾기 (js/commute.js) 계산 검사 — node tests/commute.test.js
 *
 * 통근권은 길찾기와 '같은 분' 을 말해야 한다. 그래서 RouteFinder 를 실제 데이터로 만들고,
 * CommuteMap.compute() 가 낸 분이 findRoute() 와 같은지, 시간 제한·정렬·미개통 규칙을 지키는지 본다.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const lines = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/lines.geojson'), 'utf8'));
const stations = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stations.geojson'), 'utf8'));

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}  ${detail === undefined ? '' : detail}`); }
}

const fakeEl = () => ({ style: {}, dataset: {}, classList: { toggle() {}, add() {}, remove() {} }, addEventListener() {}, querySelector() { return null; }, setAttribute() {}, appendChild() {} });
const ctx = vm.createContext({
  console, Math, Map, Set, Array, Object, JSON, Infinity, String, Number,
  document: { createElement: fakeEl, getElementById: () => null, head: fakeEl(), body: fakeEl() },
});
ctx.window = ctx;
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/route.js'), 'utf8').replace('const RouteFinder', 'globalThis.RouteFinder'), ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/commute.js'), 'utf8'), ctx);
const RF = ctx.RouteFinder, CM = ctx.CommuteMap;
RF.buildGraph(lines.features, stations.features);
CM.init({ on() {} }, stations.features);

const byName = n => stations.features.filter(f => f.properties.name_ko === n);
const gangnam = byName('강남').find(f => (f.properties.lines || []).includes('seoul-subway-line-2'));
check('강남(2호선) 역을 찾음', !!gangnam);

console.log('\n[시간 제한·정렬]');
const r45 = CM.compute(gangnam.properties.id, 45, {});
check('45분 안 역이 충분히 많다 (수도권 수백 역)', r45.length > 150, r45.length);
check('모든 역이 45분 이하', r45.every(r => r.min <= 45));
check('목적지 자신은 빠진다', !r45.some(r => r.id === gangnam.properties.id));
check('가까운 순으로 정렬', r45.every((r, i) => i === 0 || r45[i - 1].min <= r.min));
const r30 = CM.compute(gangnam.properties.id, 30, {});
check('30분 안 ⊂ 45분 안', r30.length < r45.length && r30.every(a => r45.some(b => b.id === a.id && b.min === a.min)));

console.log('\n[길찾기와 같은 분]');
const sample = r45.filter((_, i) => i % 25 === 0).slice(0, 8);
const diffs = sample.map(r => { const f = RF.findRoute(r.id, gangnam.properties.id, { openOnly: true }); return { n: r.name, cm: r.min, rt: f && Math.round(f.minutes) }; });
// 그래프가 양방향이라 '강남→X' 와 'X→강남' 은 같은 규칙. 환승 판단 여유분 때문에 1~2분 차이는 허용한다
check('표본 역의 분이 길찾기와 2분 안에서 같다', diffs.every(d => d.rt != null && Math.abs(d.cm - d.rt) <= 2), JSON.stringify(diffs));

console.log('\n[미개통 노선]');
const open = CM.compute(gangnam.properties.id, 60, {});
const withU = CM.compute(gangnam.properties.id, 60, { withUnopened: true });
check('개통 예정 포함이면 닿는 역이 같거나 많다', withU.length >= open.length, `${open.length} → ${withU.length}`);
const unopenedOnly = stations.features.filter(f => (f.properties.lines || []).length && (f.properties.lines || []).every(l => RF.lineIsUnopened(l)));
check('기본(운행 중만)에는 미개통 노선에만 있는 역이 없다', !open.some(r => unopenedOnly.some(u => u.properties.id === r.id)));

console.log('\n[색 구간]');
const B = CM._debug.bandOf;
check('15분 → 첫 구간, 46분 → 60분 구간, 91분 → 없음', B(15)[0] === 15 && B(46)[0] === 60 && B(91) === null);

console.log(`\n통근권: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
