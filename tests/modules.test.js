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

console.log('\n[노선 비교] init() — app.js 처럼 피처 배열로 넘겨도 노선이 잡힘 (버그 ④)');
{
  const cmpA = loadModule('js/compare.js');
  cmpA.LineCompare.init(LINES_FC.features, STATIONS_FC.features);
  const s2 = cmpA.LineCompare._debug.stats('seoul-subway-line-2');
  check('배열로 init → 2호선 통계가 나옴', !!s2 && s2.stations >= 40, s2 && s2.stations);
  check('배열로 init → FC 로 init 한 값과 같음', !!s2 && Math.abs(s2.km - L2.km) < 1e-9 && s2.stations === L2.stations,
    s2 && `${s2.km.toFixed(2)} / ${L2.km.toFixed(2)}`);
  const app = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  check('app.js 는 LineCompare.init(LINES, STATIONS) — 피처 배열을 넘김', /LineCompare\.init\(LINES, STATIONS\)/.test(app)
    && /LINES = l\.features; STATIONS = s\.features;/.test(app));
}

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

console.log('\n[개략도] buildClusters() — 노드가 역 ID 를 가짐 (버그 ⑤ · 동명역)');
{
  const all = STATIONS_FC.features;
  const { nodes } = D.buildClusters(all);
  const sicheong = [...nodes.values()].filter(n => n.name === '시청');
  const truth = all.filter(f => f.properties.name_ko === '시청');
  check('시청 노드 3개 (서울·부산·대전)', sicheong.length === 3, sicheong.length);
  check('시청 노드마다 서로 다른 역 ID', new Set(sicheong.map(n => n.sid)).size === 3, sicheong.map(n => n.sid).join(','));
  check('각 노드의 역 ID 는 그 자리의 시청역',
    sicheong.every(n => { const s = truth.find(f => f.properties.id === n.sid); return s && s.geometry.coordinates[0] === n.coord[0] && s.geometry.coordinates[1] === n.coord[1]; }));
  const byId = new Map(all.map(f => [f.properties.id, f]));
  check('모든 노드가 같은 이름의 실제 역 ID 를 가짐',
    [...nodes.values()].every(n => byId.has(n.sid) && byId.get(n.sid).properties.name_ko === n.name));
  const dsrc = fs.readFileSync(path.join(ROOT, 'js/diagram.js'), 'utf8');
  check('diagram.js 에 없는 UI.openPanel 호출이 남아 있지 않음', !/UI\.openPanel/.test(dsrc));
  check('드래그 시작 예외에 역 카드(.dg-card) 포함', /closest\('\.dg-station, \.dg-card'\)/.test(dsrc));
  const app = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  check('app.js 가 DiagramMode.onAction 을 routeFromStation(…, stationId) 로 연결',
    /DiagramMode\.onAction = \(action, stationName, stationId\) => \{[\s\S]{0,120}routeFromStation\(stationName, action, stationId\)/.test(app));
}

console.log('\n[개략도] 노선도를 켜도 툴바가 가려지지 않음 (버그 ⑥)');
{
  const dsrc = fs.readFileSync(path.join(ROOT, 'js/diagram.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
  const ov = Number((css.match(/#diagram-overlay \{[^}]*z-index: (\d+)/) || [])[1]);
  const tb = Number((css.match(/#map-wrap\.dg-on #toolbar \{ z-index: (\d+)/) || [])[1]);
  check('노선도 켠 동안 툴바 z-index > 오버레이 z-index', tb > ov, `${tb} / ${ov}`);
  check('enter() 가 dg-on 을 달고 placeOverlay() 로 툴바 줄을 비움, exit() 가 dg-on 을 뗌',
    /classList\.add\('dg-on'\);\s*placeOverlay\(\);/.test(dsrc) && /classList\.remove\('dg-on'\)/.test(dsrc));
}

console.log('\n[커버리지] 버튼 켜짐 표시를 show()/hide() 가 맡음 (버그 ⑧)');
{
  const cls = new Set();
  const btn = fakeEl();
  btn.classList = { add: c => cls.add(c), remove: c => cls.delete(c),
    toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)), contains: c => cls.has(c) };
  // 패널 안 요소(#cv-close 등)를 찾을 수 있는 스텁
  const elQ = () => Object.assign(fakeEl(), { querySelector: () => fakeEl() });
  const doc = {
    createElement: elQ, createElementNS: elQ, createTextNode: () => fakeEl(),
    getElementById: id => (id === 'coverage-btn' ? btn : fakeEl()), querySelector: () => null, querySelectorAll: () => [],
    body: fakeEl(), documentElement: fakeEl(), head: fakeEl(), addEventListener() {}, removeEventListener() {},
  };
  const c = { console, Math, JSON, Date, Set, Map, Array, Object, String, Number, isNaN, isFinite, parseFloat, parseInt,
    document: doc, requestAnimationFrame: () => 0, cancelAnimationFrame() {}, setTimeout: () => 0, clearTimeout() {} };
  c.window = c; c.globalThis = c; c.self = c;
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/coverage.js'), 'utf8'), c, { filename: 'js/coverage.js' });
  const fakeMap = { on() {}, getSource() { return { setData() {} }; }, addSource() {}, addLayer() {}, getLayer() { return null; },
    removeLayer() {}, removeSource() {}, fitBounds() {} };
  c.CoverageMap.init(fakeMap, STATIONS_FC.features, LINES_FC.features);
  c.CoverageMap.show();
  check('show() → 버튼 active', cls.has('active') && c.CoverageMap.isActive());
  c.CoverageMap.hide();   // 패널 ✕ 가 부르는 함수
  check('hide()(패널 ✕) → 버튼 active 해제', !cls.has('active') && !c.CoverageMap.isActive());
  c.CoverageMap.show();
  check('다시 show() → 버튼 active', cls.has('active'));
  const app = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  check('app.js 메뉴 핸들러가 버튼 클래스를 따로 만지지 않음',
    !/getElementById\('coverage-btn'\)\.classList/.test(app));
}

console.log('\n[스타일] ?style=local QA 모드 제거 (버그 ⑨)');
{
  const app = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  check('app.js 에 qa-style.json·QA_LOCAL_STYLE 참조가 없음', !/qa-style|QA_LOCAL_STYLE|qa-local/.test(app));
  check('README 에 ?style=local 안내가 없음', !/style=local/.test(readme));
  check('저장소에 qa-style.json 이 없음 (모드가 기댈 파일 없음)', !fs.existsSync(path.join(ROOT, 'qa-style.json')));
}

console.log('\n[그리기] 테마·배경 전환(setStyle) 후 그린 노선 복원 (추가 건)');
{
  // 가짜 지도: setStyle 은 소스·레이어를 모두 지운다
  const sources = new Map(), layers = new Set();
  const fakeMap = {
    on() {}, getCanvas: () => ({ style: {} }), doubleClickZoom: { enable() {}, disable() {} },
    getSource: id => sources.get(id), getLayer: id => (layers.has(id) ? {} : undefined),
    addSource(id, def) { sources.set(id, { _data: def.data, setData(d) { this._data = d; } }); },
    addLayer(def) { layers.add(def.id); }, removeLayer(id) { layers.delete(id); }, removeSource(id) { sources.delete(id); },
    setPaintProperty() {},
    _styleSwap() { sources.clear(); layers.clear(); },
  };
  const saved = { seq: 3, myLines: [
    { id: 'my-1', name: '나의 노선 1', color: '#e91e63', dashKey: '실선', coords: [[126.97, 37.55], [126.98, 37.56]], stations: [] },
    { id: 'my-2', name: '나의 노선 2', color: '#3f51b5', dashKey: '파선', coords: [[127.0, 37.5], [127.01, 37.51]], stations: [] },
  ] };
  const store = { 'kr-rail-map-mylines-v1': JSON.stringify(saved) };
  const doc = {
    createElement: fakeEl, createElementNS: fakeEl, createTextNode: () => fakeEl(),
    getElementById: () => fakeEl(), querySelector: () => null, querySelectorAll: () => [],
    body: fakeEl(), documentElement: fakeEl(), head: fakeEl(), addEventListener() {}, removeEventListener() {},
  };
  const c = { console, Math, JSON, Date, Set, Map, Array, Object, String, Number, isNaN, isFinite, parseFloat, parseInt,
    document: doc, localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } } };
  c.window = c; c.globalThis = c; c.self = c;
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/draw.js'), 'utf8') + '\n;this.__DT = DrawTools;', c, { filename: 'js/draw.js' });
  const DT = c.__DT;
  DT.init(fakeMap, () => {});
  DT.refreshMyLines();
  const n0 = (sources.get('mylines') && sources.get('mylines')._data.features.length) || 0;
  fakeMap._styleSwap();
  DT.restyle();
  const n1 = (sources.get('mylines') && sources.get('mylines')._data.features.length) || 0;
  check('전환 전 그린 노선 2개 표시', n0 === 2, n0);
  check('setStyle 뒤 restyle() → 그린 노선 2개 다시 표시', n1 === 2, n1);
  check('선 모양별 레이어 3개 다시 생김', ['mylines-solid', 'mylines-dash', 'mylines-dot'].every(id => layers.has(id)));
  check('그리는 중이 아니면 미리보기 소스를 만들지 않음', !sources.has('draw-preview'));
  check('같은 스타일에서 restyle() 을 또 불러도 2개 (중복 없음)', (DT.restyle(), sources.get('mylines')._data.features.length === 2));

  const app = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  check('내 위치 소스를 마지막 위치(myLocationData)로 다시 만듦',
    /addSource\('my-location', \{ type: 'geojson', data: myLocationData\(\) \}\)/.test(app));
  check('위치를 찍으면 lastLocation 에 기억', /lastLocation = \[lng, lat\];/.test(app));
  check('찍은 적이 없으면 빈 소스 (features: [])', /lastLocation \? \[\{[\s\S]{0,140}\}\] : \[\]/.test(app));
}

console.log('\n[지연 로딩] 역 상세 전용 데이터는 첫 화면에서 받지 않음 (IMPL9 건 1)');
{
  const app = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  const sd = fs.readFileSync(path.join(ROOT, 'js/station-detail.js'), 'utf8');
  const inv = fs.readFileSync(path.join(ROOT, 'js/invest.js'), 'utf8');
  // dataPromise(첫 화면) 구간: 'const extra = [];' 부터 그 블록의 'return Promise.all(extra);' 까지
  const a = app.indexOf('const extra = [];'), z = app.indexOf('return Promise.all(extra);', a);
  const boot = app.slice(a, z);
  check('첫 화면 구간에 시세·단지·접근성·공급 로드가 없음',
    a > 0 && z > a && !/station-price|station-complex|access\.json|station-dev/.test(boot));
  const fn = app.slice(app.indexOf('function loadDetailData()'), app.indexOf('function loadDetailData()') + 900);
  check('loadDetailData() 가 4종을 한 번만 받음',
    /detailDataRequested = true/.test(fn) && ['station-price.json', 'station-complex.json', 'access.json', 'station-dev.json'].every(f => fn.includes(f)));
  check('역 상세를 열 때(beforeShow)와 투자분석을 켤 때 loadDetailData() 호출',
    /StationDetail\.beforeShow = loadDetailData/.test(app) && /if \(on\) loadDetailData\(\)/.test(app) && /api\.beforeShow\(feature\)/.test(sd));
  check('자료 도착 시 투자분석 결과도 다시 그림 (InvestAnalyzer.refresh)',
    /InvestAnalyzer\.refresh\(\)/.test(app) && /refresh\(\) \{\s*if \(!lastPoint/.test(inv));
}

console.log('\n[동명역 지역] data/station-region.json (IMPL9 건 3)');
{
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/station-region.json'), 'utf8'));
  const all = STATIONS_FC.features;
  const cnt = {}; all.forEach(s => { cnt[s.properties.name_ko] = (cnt[s.properties.name_ko] || 0) + 1; });
  const byId = new Map(all.map(s => [s.properties.id, s]));
  const ids = Object.keys(reg.stations);
  check('모든 항목이 실제 역 ID', ids.every(id => byId.has(id)));
  check('모든 항목이 이름이 겹치는 역 (동명 없는 역에는 안 붙음)', ids.every(id => cnt[byId.get(id).properties.name_ko] >= 2));
  check('항목의 이름이 그 역 이름과 같음', ids.every(id => reg.stations[id].name === byId.get(id).properties.name_ko));
  const dupStations = all.filter(s => cnt[s.properties.name_ko] >= 2).length;
  check('붙임 + 못 붙임 = 동명 역 전체', reg.summary.labeled + reg.summary.unlabeled === dupStations && reg.summary.dup_stations === dupStations,
    `${reg.summary.labeled} + ${reg.summary.unlabeled} / ${dupStations}`);
  check('붙임 수 = 항목 수', reg.summary.labeled === ids.length);
  const seoulSi = all.find(s => s.properties.name_ko === '시청' && s.properties.lines.includes('seoul-subway-line-2')).properties.id;
  check("서울 시청 → '서울 중구'", reg.stations[seoulSi] && reg.stations[seoulSi].label === '서울 중구');
  const app = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  check('app.js 가 역 ID 로 지역을 찾음 (이름으로 찾지 않음)', /regionOf\.get\(it\.id\)/.test(app) && /regionOf\.get\(p\.id\)/.test(app));
}

console.log('\n[자동완성] 동명역은 지도 중심에 가까운 역부터 (IMPL9 건 4)');
{
  const app = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  check('정렬: 정확 → 시작 → 이름 그룹 처음 순서 → 거리 (그룹 밖 순서 유지)',
    /\(b\.exact - a\.exact\) \|\| \(b\.starts - a\.starts\) \|\|\s*\(firstAt\.get\(a\.name\) - firstAt\.get\(b\.name\)\) \|\| \(a\.d - b\.d\)/.test(app));
  check('거리 기준은 지금 지도 중심', /const ctr = map\.getCenter\(\)/.test(app));
}

console.log('\n[즐겨찾기] 역 즐겨찾기를 역 ID 로 (IMPL9 건 5)');
{
  const app = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  check('새 항목은 { name, id } 로 저장', /favorites\.stations\.push\(id \? \{ name, id \} : name\)/.test(app));
  check('옛 이름 문자열: 이름이 하나뿐이면 ID 로, 동명이면 그대로',
    /typeof e !== 'string'\) return e;[\s\S]{0,160}same\.length === 1 \? \{ name: e, id: same\[0\]\.properties\.id \} : e/.test(app));
  check('역 상세·팝업의 ⭐ 가 역 ID 를 넘김',
    /toggleFavStation\(stationName, stationId\)/.test(app) && /toggleFavStation\(sname, p\.id\)/.test(app) && /isFavStation\(sname, p\.id\)/.test(app));
  check('사이드바 항목 클릭은 ID 로 역을 찾음', /const s = byId \|\| STATIONS\.find/.test(app));
}

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
