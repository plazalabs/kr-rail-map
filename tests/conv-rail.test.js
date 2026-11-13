/* 일반철도(무궁화) 정차역·요금·시간 (2026-11-13, B7)
 * 출처: 경부선 무궁화 수도권 정차 — 서울·영등포·안양·수원·오산·서정리·평택·성환·천안 (itwiki 경부선)
 *       무궁화 서울↔수원 33~40분·2,700원 (2026-11 시간표), 서울→부산 441.7km 28,600원 (코레일)
 * 실행: node tests/conv-rail.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const L = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/lines.geojson'), 'utf8')), S = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stations.geojson'), 'utf8'));
const ctx = vm.createContext({ console, Math, Map, Set, Array, Object, JSON, Infinity, Promise, document: { getElementById: () => null, createElement: () => ({ style: {}, appendChild() {} }), head: { appendChild() {} }, addEventListener() {} }, window: {} });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/route.js'), 'utf8').replace('const RouteFinder', 'globalThis.RouteFinder'), ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/route-compare.js'), 'utf8').replace('const RouteCompare', 'globalThis.RouteCompare'), ctx);
const RF = ctx.RouteFinder, RC = ctx.RouteCompare; RF.buildGraph(L.features, S.features); RC.init(RF, S.features, L.features);
let pass = 0, fail = 0;
const check = (l, c, d) => { if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; console.log(`  ✗ ${l}  ${d === undefined ? '' : JSON.stringify(d)}`); } };
const G = 'gyeongbu-line';
const onG = n => S.features.some(f => f.properties.name_ko === n && (f.properties.lines || []).includes(G));

console.log('\n[경부선 일반철도 수도권 정차역]');
['서울', '영등포', '안양', '수원', '오산', '서정리', '평택', '성환', '천안'].forEach(n => check(`${n} 정차`, onG(n)));
['대방', '금천구청', '석수', '관악', '군포', '의왕', '성균관대', '세마', '오산대', '평택지제', '두정'].forEach(n => check(`${n} 은 무궁화가 안 섬`, !onG(n)));

console.log('\n[요금 — 1km 64.8원, 최저 2,600원]');
check('서울→수원 41.5km = 2,700원', RC.calcConvFare(41.5) === 2700, RC.calcConvFare(41.5));
check('서울→부산 441.7km = 28,600원', RC.calcConvFare(441.7) === 28600, RC.calcConvFare(441.7));
check('짧은 거리는 최저 2,600원', RC.calcConvFare(5) === 2600, RC.calcConvFare(5));

console.log('\n[시간·경로]');
const id = (n, l) => S.features.find(f => f.properties.name_ko === n && (f.properties.lines || []).includes(l)).properties.id;
const r = RF.findRoute(id('서울', G), id('수원', G), { openOnly: true });
const convMin = r && r.legs.filter(l => l.lineId === G).length ? r.minutes : null;
check('서울→수원 무궁화 구간 시간이 33~40분 + 탈 때 접근 12분 안쪽 (≤ 55분)', r && r.minutes <= 55, r && r.minutes);
const sg = RF.findRoute(id('상갈', 'suin-bundang-line'), id('탄현', 'gyeongui-jungang-line'), { openOnly: true });
const boardsAtUiwang = sg && sg.legs.some((l, i) => l.lineId === G && S.features.find(f => f.properties.id === l.from).properties.name_ko === '의왕');
check('상갈→탄현이 의왕에서 무궁화를 타지 않음 (예전 버그)', !boardsAtUiwang);
console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
