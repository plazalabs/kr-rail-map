/* 요금 계산 테스트 — 의존성 없이 실행: node tests/fare.test.js
 *
 * 요금은 '지도에서 확인 가능한 사실'과 맞아야 한다.
 * 수도권 전철은 거리비례 1,400원부터지만, KTX·일반철도는 요금표가 따로다.
 * 서울→부산 무궁화 28,600원 / KTX 59,800원이 기준값이다.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const lines = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/lines.geojson'), 'utf8'));
const stations = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stations.geojson'), 'utf8'));

const ctx = vm.createContext({
  console, Math, Map, Set, Array, Object, JSON, Infinity, Promise,
  document: { getElementById: () => null, createElement: () => ({ style: {}, appendChild() {} }),
    head: { appendChild() {} }, addEventListener() {} },
  window: {},
});
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/route.js'), 'utf8')
  .replace('const RouteFinder', 'globalThis.RouteFinder'), ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/route-compare.js'), 'utf8')
  .replace('const RouteCompare', 'globalThis.RouteCompare'), ctx);

const RF = ctx.RouteFinder;
const RC = ctx.RouteCompare;
RF.buildGraph(lines.features, stations.features);
RC.init(RF, stations.features, lines.features);

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}  ${detail || ''}`); }
}
const near = (v, target, tol) => Math.abs(v - target) <= tol;

// legs 모양만 있으면 요금을 계산할 수 있다 (UI 없이)
const routeOf = (lineId, km) => ({ legs: [{ lineId, distKm: km }] });

console.log('\n[수도권 전철] 거리비례');
check('기본요금 1,400원 (5km)', RC.calcFare(5) === 1400, RC.calcFare(5));
check('15km 는 1,500원', RC.calcFare(15) === 1500, RC.calcFare(15));
check('50km 는 2,200원', RC.calcFare(50) === 2200, RC.calcFare(50));
check('거리 0 이면 0원 (다른 수단과 합산할 때)', RC.calcFare(0) === 0, RC.calcFare(0));

console.log('\n[일반철도] 무궁화·ITX — 수도권 공식을 쓰면 안 됨');
// 서울→부산 무궁화 441.7km = 28,600원 (코레일)
const conv = RC.calcFareOfRoute(routeOf('gyeongbu-line', 441.7), 441.7);
check('서울→부산 무궁화가 28,600원 근처', near(conv, 28600, 600), `${conv}원`);
check('무궁화가 수도권 공식(7,200원)보다 훨씬 비쌈', conv > 20000, `${conv}원`);
const jungang = RC.calcFareOfRoute(routeOf('jungang-line', 240), 240);
check('중앙선 240km 가 16,000원 근처', near(jungang, 16000, 700), `${jungang}원`);

console.log('\n[KTX] 거리비례 아님');
// 우리 선형으로 잰 서울→부산 KTX 거리는 428km 남짓 (실제 영업거리 423.8km)
const ktx = RC.calcFareOfRoute(routeOf('gyeongbu-line-ktx', 428.3), 428.3);
check('서울→부산 KTX 가 59,800원 근처', near(ktx, 59800, 400), `${ktx}원`);
// 강릉선은 같은 KTX 라도 km당 단가가 낮다 (215km 27,600원)
const ktxG = RC.calcFareOfRoute(routeOf('gangneung-line-ktx', 215), 215);
check('서울→강릉 KTX 가 27,600원 근처', near(ktxG, 27600, 500), `${ktxG}원`);
check('짧은 KTX 가 긴 KTX 보다 km당 비싸지 않음',
  (ktxG / 215) < (ktx / 428.3) * 1.02, `${(ktxG / 215).toFixed(0)} vs ${(ktx / 428.3).toFixed(0)}`);

console.log('\n[혼합] 전철 + 일반철도');
const mixed = RC.calcFareOfRoute(
  { legs: [{ lineId: 'seoul-subway-line-2', distKm: 12 }, { lineId: 'gyeongbu-line', distKm: 400 }] }, 412);
// 전철 12km 1,500원 + 무궁화 400km 26,000원 = 27,500원
check('전철 12km + 무궁화 400km 가 27,500원', near(mixed, 27500, 400), `${mixed}원`);

console.log('\n[실제 경로] 앱이 계산한 값');
const id = n => {
  const c = stations.features.filter(f => f.properties.name_ko === n)
    .sort((a, b) => b.properties.lines.length - a.properties.lines.length);
  if (!c.length) throw new Error('역 없음: ' + n);
  return c[0].properties.id;
};
const r = RC.findAll(id('서울'), id('부산'));
check('서울→부산 최단시간 요금이 5만원 이상', r.time && r.time.fare >= 50000,
  r.time && `${r.time.fare}원 (${r.time.legs.map(l => l.lineId).join(',')})`);
check('서울→부산 최단시간이 KTX', r.time && r.time.legs.some(l => l.lineId === 'gyeongbu-line-ktx'),
  r.time && r.time.legs.map(l => l.lineId).join(','));

const r2 = RC.findAll(id('강남'), id('역삼'));
check('강남→역삼 요금 1,400원', r2.time && r2.time.fare === 1400, r2.time && r2.time.fare);

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
