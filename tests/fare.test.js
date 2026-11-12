/* 요금 계산 테스트 — 의존성 없이 실행: node tests/fare.test.js
 *
 * 요금은 '지도에서 확인 가능한 사실'과 맞아야 한다.
 * 수도권 전철은 거리비례 1,550원부터(2025-06-28 인상)지만, KTX·일반철도는 요금표가 따로다.
 * 서울→부산 무궁화 28,600원 / KTX 54,400원(2026-09-01 통합 운임, 공식 운임표)이 기준값이다. 통합 전 KTX 59,800원은 추정 공식의 바탕.
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
check('기본요금 1,550원 (5km, 2025-06-28 인상)', RC.calcFare(5) === 1550, RC.calcFare(5));
check('15km 는 1,650원', RC.calcFare(15) === 1650, RC.calcFare(15));
check('50km 는 2,350원', RC.calcFare(50) === 2350, RC.calcFare(50));
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
const ktx = RC.calcKtxFare(428.3);
check('통합 전 공식: 서울→부산 KTX 가 59,800원 근처', near(ktx, 59800, 400), `${ktx}원`);
// 강릉선은 같은 KTX 라도 km당 단가가 낮다 (215km 27,600원)
const ktxG = RC.calcKtxFare(215);
check('통합 전 공식: 서울→강릉 KTX 가 27,600원 근처', near(ktxG, 27600, 500), `${ktxG}원`);
check('짧은 KTX 가 긴 KTX 보다 km당 비싸지 않음',
  (ktxG / 215) < (ktx / 428.3) * 1.02, `${(ktxG / 215).toFixed(0)} vs ${(ktx / 428.3).toFixed(0)}`);

console.log('\n[혼합] 전철 + 일반철도');
const mixed = RC.calcFareOfRoute(
  { legs: [{ lineId: 'seoul-subway-line-2', distKm: 12 }, { lineId: 'gyeongbu-line', distKm: 400 }] }, 412);
// 전철 12km 1,650원 + 무궁화 400km 26,000원 = 27,650원
check('전철 12km + 무궁화 400km 가 27,650원', near(mixed, 27650, 400), `${mixed}원`);

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
check('강남→역삼 요금 1,550원', r2.time && r2.time.fare === 1550, r2.time && r2.time.fare);


console.log('\n[KTX 공식 운임표] 2026-09-01 통합 운임 (data/ktx-fares.json)');
{
  const fares = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/ktx-fares.json'), 'utf8'));
  check('운임표 기준일 2026-09-01', fares.meta.effective === '2026-09-01', fares.meta.effective);
  check('출처 라이선스가 공공데이터(제한 없음)', fares.meta.licence === 'data-go-kr-open');
  // 표 자체 값 — 기사·보도자료와 대조 (서울~부산 59,800 → 54,400)
  check('표: 서울~부산 54,400원', fares.lines['gyeongbu-line-ktx'].pairs['부산|서울'] === 54400);
  check('표: 서울~강릉 27,600원 (강릉선은 통합 전과 같음)', fares.lines['gangneung-line-ktx'].pairs['강릉|서울'] === 27600);

  // 표를 싣기 전에는 KTX 가 모두 '추정'
  const seoul = id('서울'), busan = id('부산');
  const before = RC.findAll(seoul, busan).time;
  check('표가 없으면 KTX 구간은 추정', before.fareDetail.parts.filter(p => p.kind === 'ktx').every(p => p.basis === 'estimate') && before.fareDetail.estimated);

  RC.loadKtxFares(fares);
  const t = RC.findAll(seoul, busan).time;
  const kp = t.fareDetail.parts.filter(p => p.kind === 'ktx');
  check('서울→부산 최단시간의 KTX 구간 = 공식 54,400원', kp.length === 1 && kp[0].fare === 54400 && kp[0].basis === 'official',
    kp.map(p => `${p.fare}원 ${p.basis}`).join(','));
  check('합계 = 내역의 합', t.fare === t.fareDetail.parts.reduce((a, p) => a + p.fare, 0), `${t.fare}원`);
  check('KTX 만 탄 서울→부산에 전철 요금이 붙지 않음 (합계 54,400원)', t.fare === 54400 && !t.fareDetail.parts.some(p => p.kind === 'metro'), `${t.fare}원`);
  check('공식 값만이면 추정 표시 없음 (전철 거리 계산은 추정 아님)', t.fareDetail.estimated === false);

  // 표에 없는 쌍(영등포↔광명: 영등포 정차 KTX 는 수원 경유라 광명을 지나지 않음) → 추정 = 통합 전 공식 × 0.9
  const leg = { lineId: 'gyeongbu-line-ktx', from: id('영등포'), to: id('광명'), distKm: 12 };
  const d = RC.calcFareDetail({ legs: [leg] }, 12);
  check('표에 없는 KTX 구간은 추정 + 인하율 10%', d.estimated && d.parts[0].basis === 'estimate' &&
    d.parts[0].fare === Math.round(RC.calcKtxFare(12) * 0.9 / 100) * 100, `${d.parts[0].fare}원`);

  const html = RC.fareBreakdownHtml(t.fareDetail);
  check('내역에 "공식 운임표 (2026.9.1 기준)"', html.includes('공식 운임표 (2026.9.1 기준)'), html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 100));
  const h2 = RC.fareBreakdownHtml(d);
  check('추정 구간은 "추정"이라고 적음', h2.includes('추정') && h2.includes('약 '), h2.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 100));
  check('일반철도는 추정이라고 적음', RC.fareBreakdownHtml(RC.calcFareDetail(routeOf('gyeongbu-line', 100), 100)).includes('추정'));
  check('수도권 전철만 탄 경로는 내역 생략', RC.fareBreakdownHtml(RC.findAll(id('강남'), id('역삼')).time.fareDetail) === '');
}
console.log("\n[탭 요약] '최적' 보다 빠른 길이 있으면 대가(환승)를 같이 적는다 (2026-11-12)");
{
  // 꾸민 값: 최적 38분·환승 0·1,850원 / 최소요금 37분·환승 2·1,750원 (홍대입구→강남 실제 모양)
  const T = { minutes: 38, transfers: 0, fare: 1850 }, F = { minutes: 37, transfers: 2, fare: 1750 };
  const s1 = RC.insightOf({ time: T, transfer: null, fare: F });
  check('더 싸고 더 빠른 최소요금 → "100원 절약 · 1분 빠르지만 환승 2회 (2회 더)"', s1 === '💰 최소요금은 100원 절약 · 1분 빠르지만 환승 2회 (2회 더)', s1);
  const s2 = RC.insightOf({ time: T, transfer: null, fare: { minutes: 45, transfers: 1, fare: 1750 } });
  check('더 싸고 더 느린 최소요금 → "7분 더 걸림"', s2 === '💰 최소요금은 100원 절약 · 7분 더 걸림', s2);
  const s3 = RC.insightOf({ time: T, transfer: null, fare: { minutes: 36, transfers: 1, fare: 1850 } });
  check('요금이 같아도 더 빠르면 알린다', s3 === '💰 최소요금 길은 2분 빠르지만 환승 1회 (1회 더)', s3);
  const s4 = RC.insightOf({ time: T, transfer: null, fare: T });
  check('같은 길이면 아무 말 없음', s4 === '', s4);
  // 실제 자료: 홍대입구→강남
  const hr = RC.findAll(id('홍대입구'), id('강남'), { openOnly: true });
  const msg = RC.insightOf(hr);
  const ok = hr.time && hr.fare && (hr.fare.minutes >= hr.time.minutes || /빠르지만 환승/.test(msg));
  check('실제 홍대입구→강남: 최소요금이 더 빠르면 요약에 "빠르지만 환승" 이 있다', ok,
    hr.time && hr.fare && `최적 ${hr.time.minutes}분·환승 ${hr.time.transfers} / 요금 ${hr.fare.minutes}분·환승 ${hr.fare.transfers} — ${msg}`);
}

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
