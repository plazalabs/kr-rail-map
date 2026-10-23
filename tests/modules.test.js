/* 화면 모듈 계산 검사 — compare / coverage / timeline / diagram
 * 실행: node tests/modules.test.js
 *
 * 이 네 모듈은 브라우저 IIFE 라서 그냥 require 할 수 없다.
 * vm 샌드박스에 최소한의 document 를 만들어 얹고, 각 모듈이 노출하는
 * _debug 헬퍼(순수 계산)만 꺼내서 검사한다. 지도도 DOM 도 필요 없다.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const LINES_FC = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/lines.geojson'), 'utf8'));
const STATIONS_FC = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stations.geojson'), 'utf8'));

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}  ${detail === undefined ? '' : detail}`); }
}

/* ---------- 최소 DOM 스텁 ---------- */
function fakeEl() {
  return {
    style: {}, dataset: {}, children: [], innerHTML: '', textContent: '',
    className: '', id: '', parentNode: null,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild(c) { this.children.push(c); return c; },
    removeChild() {}, remove() {}, insertBefore() {},
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    addEventListener() {}, removeEventListener() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    getBoundingClientRect() { return { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0 }; },
    getContext() { return null; },
  };
}
function loadModule(file) {
  const doc = {
    createElement: fakeEl, createElementNS: fakeEl, createTextNode: () => fakeEl(),
    getElementById: () => fakeEl(), querySelector: () => null, querySelectorAll: () => [],
    body: fakeEl(), documentElement: fakeEl(), head: fakeEl(),
    addEventListener() {}, removeEventListener() {},
  };
  const c = {
    console, Math, JSON, Date, Set, Map, Array, Object, String, Number,
    isNaN, isFinite, parseFloat, parseInt, document: doc,
    requestAnimationFrame: () => 0, cancelAnimationFrame() {}, setTimeout: () => 0,
    clearTimeout() {}, innerWidth: 1440, innerHeight: 900,
    performance: { now: () => 0 },
  };
  c.window = c; c.globalThis = c; c.self = c;
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), c, { filename: file });
  return c;
}

/* ================= LineCompare ================= */
const cmp = loadModule('js/compare.js');
cmp.LineCompare.init(LINES_FC, STATIONS_FC);
const C = cmp.LineCompare._debug;

console.log('\n[노선 비교] stats() — 길이·역수·환승');
const L2 = C.stats('seoul-subway-line-2');
check('2호선 통계가 나옴', !!L2);
check('2호선 길이 55~65km (공식 60.2)', L2 && L2.km > 55 && L2.km < 65, L2 && L2.km.toFixed(1));
check('2호선 역 40개 이상', L2 && L2.stations >= 40, L2 && L2.stations);
check('2호선은 운행중', L2 && L2.status === '운행중', L2 && L2.status);
check('2호선은 도시철도', L2 && L2.category === '도시철도', L2 && L2.category);
check('2호선 평균 역간 1~2km', L2 && L2.avgGap > 1 && L2.avgGap < 2, L2 && L2.avgGap.toFixed(2));
check('2호선 환승역이 10개 이상', L2 && L2.transfers >= 10, L2 && L2.transfers);
check('환승역은 역 수보다 적음', L2 && L2.transfers < L2.stations, `${L2 && L2.transfers}/${L2 && L2.stations}`);

const L1 = C.stats('seoul-metropolitan-subway-line-1');
check('1호선 역이 2호선보다 많음', L1 && L2 && L1.stations > L2.stations,
  `${L1 && L1.stations} vs ${L2 && L2.stations}`);
const G = C.stats('great-train-express-line-a');
check('GTX-A 길이 80km 이상', G && G.km > 80, G && G.km.toFixed(1));
check('GTX-A 는 KTX·고속 분류가 아님', G && G.category !== 'KTX·고속', G && G.category);
check('없는 노선은 null', C.stats('없는-노선-id') === null);

console.log('\n[노선 비교] 상태·분류 한글 라벨');
check('open → 운행중', C.STATUS_KO.open === '운행중');
check('construction → 공사중', C.STATUS_KO.construction === '공사중');
check('planned → 계획중', C.STATUS_KO.planned === '계획중');
check('proposed → 구상중', C.STATUS_KO.proposed === '구상중');
check('ktx → KTX·고속', C.CAT_KO.ktx === 'KTX·고속');

console.log('\n[선형 길이] 공식 영업거리와 비교 — 중복 선형이 섞이면 여기서 걸린다');
// 출처: 각 운영기관 노선 현황. 선형이 두 번 그려지면 길이가 1.5~2배로 튄다.
const OFFICIAL = [
  ['seoul-subway-line-2', 60.2, '2호선 (48.8 본선 + 5.4 성수지선 + 6.0 신정지선)'],
  ['seoul-subway-line-5', 59.7, '5호선 (52.9 본선 + 6.8 마천지선)'],
  ['seoul-subway-line-6', 36.4, '6호선 (35.1 + 응암순환 1.3)'],
  ['arex', 63.8, '인천공항철도 (서울역~인천공항2터미널 + 용유지선)'],
  ['yongin-light-rail-transit', 18.1, '용인경전철'],
  ['suin-bundang-line', 105.8, '수인·분당선 (분당선 52.9 + 수인선 52.9)'],
  ['daegyeong-line', 61.9, '대경선 (경산~구미)'],
];
OFFICIAL.forEach(([id, km, label]) => {
  const s = C.stats(id);
  const got = s ? s.km : 0;
  const err = Math.abs(got - km) / km;
  check(`${label} ≈ ${km}km`, err <= 0.10, `${got.toFixed(1)}km (오차 ${(err * 100).toFixed(0)}%)`);
});

console.log('\n[노선 비교] 두 노선을 같이 재도 서로 안 섞임');
const a1 = C.stats('seoul-subway-line-2').km;
const b1 = C.stats('busan-metro-line-1').km;
const a2 = C.stats('seoul-subway-line-2').km;
check('같은 노선 두 번 → 같은 값', Math.abs(a1 - a2) < 1e-9, `${a1} / ${a2}`);
check('부산 1호선과 서울 2호선은 다른 길이', Math.abs(a1 - b1) > 1, `${a1.toFixed(1)} / ${b1.toFixed(1)}`);

/* ================= CoverageMap ================= */
const cov = loadModule('js/coverage.js');
cov.CoverageMap.init({ on() {}, resize() {}, addLayer() {}, removeLayer() {} },
  STATIONS_FC, LINES_FC);
const V = cov.CoverageMap._debug;

console.log('\n[커버리지] hav() — 대권거리');
const seoulBusan = V.hav(126.9726, 37.5547, 129.0426, 35.1149);
check('서울역→부산역 300~350km', seoulBusan > 300 && seoulBusan < 350, seoulBusan.toFixed(1));
check('같은 점은 0km', V.hav(127, 37, 127, 37) === 0);
check('대칭성 (A→B == B→A)',
  Math.abs(V.hav(127, 37, 129, 35) - V.hav(129, 35, 127, 37)) < 1e-9);
check('위도 1도 ≈ 111km', Math.abs(V.hav(127, 37, 127, 38) - 111) < 2,
  V.hav(127, 37, 127, 38).toFixed(2));

console.log('\n[커버리지] circlePoly() — 반경 원');
const poly = V.circlePoly(127.0, 37.5, 1, 24);
check('점 25개 (steps+1)', poly.length === 25, poly.length);
check('첫 점과 끝 점이 같음 (닫힌 고리)',
  Math.abs(poly[0][0] - poly[24][0]) < 1e-9 && Math.abs(poly[0][1] - poly[24][1]) < 1e-9);
const radii = poly.slice(0, 24).map(p => V.hav(127.0, 37.5, p[0], p[1]));
check('모든 점이 반경 1km 위', radii.every(d => Math.abs(d - 1) < 0.02),
  `${Math.min(...radii).toFixed(3)}~${Math.max(...radii).toFixed(3)}`);
check('반경을 2배로 하면 거리도 2배',
  Math.abs(V.hav(127, 37.5, V.circlePoly(127, 37.5, 2, 4)[0][0], V.circlePoly(127, 37.5, 2, 4)[0][1]) - 2) < 0.05);

console.log('\n[커버리지] unionAreaKm2() — 합집합 면적');
const piR2 = Math.PI * 0.25;
const one = V.unionAreaKm2([[127.0, 37.5]], 0.5);
check('원 하나의 면적 ≈ πr² (오차 8% 이내)', Math.abs(one - piR2) / piR2 < 0.08,
  `${one.toFixed(4)} vs ${piR2.toFixed(4)}`);
const two = V.unionAreaKm2([[127.0, 37.5], [127.0, 37.5]], 0.5);
check('완전히 겹친 두 원의 합집합 = 한 원', Math.abs(two - one) / one < 0.01,
  `${two.toFixed(4)} vs ${one.toFixed(4)}`);
const far = V.unionAreaKm2([[127.0, 37.5], [128.0, 37.5]], 0.5);
check('멀리 떨어진 두 원의 합집합 ≈ 2배', Math.abs(far - 2 * piR2) / (2 * piR2) < 0.08,
  `${far.toFixed(4)} vs ${(2 * piR2).toFixed(4)}`);
const half = V.unionAreaKm2([[127.0, 37.5], [127.0, 37.5045]], 0.5);  // 약 0.5km 떨어짐
check('절반쯤 겹친 두 원은 1~2배 사이', half > one && half < 2 * one, half.toFixed(4));
check('원이 없으면 0', V.unionAreaKm2([], 0.5) === 0);

console.log('\n[커버리지] statusLabel()');
check('open → 운행중', V.statusLabel('open') === '운행중');
check('construction → 공사중', V.statusLabel('construction') === '공사중');
check('planned → 계획중', V.statusLabel('planned') === '계획중');

/* ================= RailTimeline ================= */
const tl = loadModule('js/timeline.js');
const T = tl.RailTimeline._debug;

console.log('\n[타임라인] extractOpeningYear() — note 에 적힌 연도만');
check('"2027-11 개통 예정" → 2027년 11월',
  JSON.stringify(T.extractOpeningYear('2027-11 개통 예정')) === '{"year":2027,"month":11}',
  JSON.stringify(T.extractOpeningYear('2027-11 개통 예정')));
check('"2026년 5월 개통" → 2026년 5월',
  JSON.stringify(T.extractOpeningYear('2026년 5월 개통')) === '{"year":2026,"month":5}',
  JSON.stringify(T.extractOpeningYear('2026년 5월 개통')));
check('"2028년 개통" → 월 없음',
  JSON.stringify(T.extractOpeningYear('2028년 개통')) === '{"year":2028,"month":null}',
  JSON.stringify(T.extractOpeningYear('2028년 개통')));
check('연도가 없으면 null', T.extractOpeningYear('공사중') === null,
  JSON.stringify(T.extractOpeningYear('공사중')));
check('빈 note 는 null', T.extractOpeningYear('') === null);
check('없는 note 도 null', T.extractOpeningYear(undefined) === null);
check('"2030년 준공" 은 개통이 아니므로 null',
  T.extractOpeningYear('2030년 준공') === null,
  JSON.stringify(T.extractOpeningYear('2030년 준공')));

tl.RailTimeline.init(LINES_FC, STATIONS_FC);
console.log('\n[타임라인] buildEntries() — 미개통 노선만');
const entries = T.entries();
check('항목이 1개 이상', entries.length > 0, entries.length);
check('운행중 노선은 타임라인에 없음',
  entries.every(e => e.status !== 'open'),
  entries.filter(e => e.status === 'open').map(e => e.name).join(','));
check('공사중·계획중·구상중만 들어감',
  entries.every(e => ['construction', 'planned', 'proposed'].includes(e.status)),
  [...new Set(entries.map(e => e.status))].join(','));
const withYear = entries.filter(e => e.opening && e.opening.year);
check('연도가 있는 항목은 2020~2040 사이',
  withYear.every(e => e.opening.year >= 2020 && e.opening.year <= 2040),
  withYear.filter(e => e.opening.year < 2020 || e.opening.year > 2040)
    .map(e => `${e.name}:${e.opening.year}`).join(','));
check('개통일 미정 항목은 "미정" 으로 표시',
  entries.filter(e => !e.opening).every(e => e.openingText === '미정'),
  entries.filter(e => !e.opening).slice(0, 3).map(e => e.openingText).join(','));
check('모든 항목에 이름과 색이 있음',
  entries.every(e => e.name && /^#[0-9a-fA-F]{6}$/.test(e.color)));
check('길이가 0인 항목이 없음', entries.every(e => e.km > 0),
  entries.filter(e => !(e.km > 0)).map(e => e.name).join(','));

/* ================= DiagramMode ================= */
const dg = loadModule('js/diagram.js');
const D = dg.DiagramMode._debug;

console.log('\n[개략도] mercY() — 메르카토르 세로 좌표');
check('적도 = 0', Math.abs(D.mercY(0)) < 1e-12, D.mercY(0));
check('위도가 높을수록 커짐', D.mercY(60) > D.mercY(30) && D.mercY(30) > D.mercY(0));
check('남반구는 음수', D.mercY(-30) < 0);
check('대칭 (30 / -30)', Math.abs(D.mercY(30) + D.mercY(-30)) < 1e-12);
check('위도를 85도로 자름', isFinite(D.mercY(89.9)) && D.mercY(89.9) === D.mercY(85));

console.log('\n[개략도] planar() — 경위도를 km 평면으로');
const pl = D.planar([[127.0, 37.5], [128.0, 37.5], [127.0, 38.5]], 37.5);
check('경도 1도 ≈ 88.3km (위도 37.5)', Math.abs(pl[1][0] - pl[0][0] - 88.3) < 1,
  (pl[1][0] - pl[0][0]).toFixed(2));
check('위도 1도 ≈ 110.6km', Math.abs(pl[2][1] - pl[0][1] - 110.57) < 1,
  (pl[2][1] - pl[0][1]).toFixed(2));
check('경도는 위도가 높을수록 좁아짐',
  (D.planar([[127, 38.5], [128, 38.5]], 38.5)[1][0] - D.planar([[127, 38.5], [128, 38.5]], 38.5)[0][0]) <
  (pl[1][0] - pl[0][0]));

console.log('\n[개략도] projectAlong() — 선형 위 위치 찾기');
// 동쪽으로 곧게 뻗은 10km 선 (이미 km 평면)
const line = [[0, 0], [5, 0], [10, 0]];
const cum = [0, 5, 10];
const onLine = D.projectAlong([5, 0], line, cum);
check('선 위의 점은 거리 0', onLine.dist < 1e-9, onLine.dist);
check('선 위의 점의 along = 5', Math.abs(onLine.along - 5) < 1e-9, onLine.along);
const off = D.projectAlong([5, 5.5], line, cum);
check('선에서 5.5km 북쪽 → dist 5.5', Math.abs(off.dist - 5.5) < 1e-9, off.dist);
check('수선의 발이 선 위 (along = 5)', Math.abs(off.along - 5) < 1e-9, off.along);
check('시작점보다 앞은 along 0 으로 잘림', D.projectAlong([-2, 0], line, cum).along === 0,
  D.projectAlong([-2, 0], line, cum).along);
check('끝점보다 뒤는 along 10 으로 잘림', D.projectAlong([14, 0], line, cum).along === 10,
  D.projectAlong([14, 0], line, cum).along);
check('꺾인 점 근처도 가장 가까운 구간을 고름',
  Math.abs(D.projectAlong([4.9, 0.1], line, cum).along - 4.9) < 0.2,
  D.projectAlong([4.9, 0.1], line, cum).along);

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
