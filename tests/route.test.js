/* 라우팅 골든 테스트 — 의존성 없이 실행: node tests/route.test.js
 *
 * 감사(audit)에서 확인된 실제 오작동을 회귀 방지용 단언으로 고정한다.
 * 여기 적힌 기대값은 "지도에서 눈으로 확인 가능한 사실"이어야 한다.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const lines = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/lines.geojson'), 'utf8'));
const stations = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stations.geojson'), 'utf8'));

const src = fs.readFileSync(path.join(ROOT, 'js/route.js'), 'utf8')
  .replace('const RouteFinder', 'globalThis.RouteFinder');
const ctx = vm.createContext({ console, Math, Map, Set, Array, Object, JSON, Infinity });
vm.runInContext(src, ctx);
const RF = ctx.RouteFinder;

const g = RF.buildGraph(lines.features, stations.features);

const S = stations.features.map(f => ({
  id: f.properties.id, n: f.properties.name_ko, c: f.geometry.coordinates,
  aliases: f.properties.aliases || [],
}));
const nameOf = id => (S.find(s => s.id === id) || {}).n || id;

// 동명이역이 있으므로 좌표로 특정한다
function pick(nameKo, lng, lat) {
  // '서울역'처럼 별칭으로만 남은 이름도 찾을 수 있게 한다
  const c = S.filter(s => s.n === nameKo || (s.aliases || []).includes(nameKo));
  if (!c.length) throw new Error(`역 없음: ${nameKo}`);
  return c.sort((a, b) =>
    (Math.abs(a.c[0] - lng) + Math.abs(a.c[1] - lat)) -
    (Math.abs(b.c[0] - lng) + Math.abs(b.c[1] - lat)))[0];
}

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}  ${detail || ''}`); }
}

function route(a, b) {
  const A = pick(...a), B = pick(...b);
  return RF.findRoute(A.id, B.id);
}

console.log('\n[그래프]');
check('순환선 폐합 엣지가 존재', g.loopEdges >= 1, `loopEdges=${g.loopEdges}`);
check('먼 거리 동명이역 도보연결이 차단됨', g.walkRejected > 0, `walkRejected=${g.walkRejected}`);

console.log('\n[2호선 순환선] 당산에서 끊기지 않아야 함');
let r = route(['당산', 126.9027, 37.5344], ['합정', 126.9137, 37.5497]);
check('당산→합정 10분 이내', r && r.minutes <= 10, r && `${r.minutes}분`);
check('당산→합정 환승 0회', r && r.transfers === 0, r && `${r.transfers}회`);
check('당산→합정이 2호선 직결', r && r.legs.length === 1 && r.legs[0].lineId === 'seoul-subway-line-2',
  r && JSON.stringify(r.legs));

console.log('\n[동명이역] 서울 시청이 부산 시청으로 새지 않아야 함');
r = route(['충정로', 126.9636, 37.5599], ['시청', 126.9772, 37.5657]);
check('충정로→시청 6분 이내', r && r.minutes <= 6, r && `${r.minutes}분`);
check('충정로→시청 환승 0회', r && r.transfers === 0, r && `${r.transfers}회`);

console.log('\n[부산] 1호선 직결');
r = route(['부산역', 129.0403, 35.1151], ['서면', 129.0594, 35.1578]);
check('부산역→서면 14분 이내', r && r.minutes <= 14, r && `${r.minutes}분`);
check('부산역→서면 환승 0회', r && r.transfers === 0, r && `${r.transfers}회`);

console.log('\n[미개통 노선] 착공·계획 노선도 경로에 참여하되, 반드시 표시되어야 함');
// 이 지도는 "지금 운행 중인 노선"이 아니라 "앞으로 존재할 노선"을 그린다.
// 따라서 GTX-B/C 같은 미개통 노선이 경로에 등장하는 것 자체는 정상이다.
// 다만 등장할 때는 leg.unopened = true 가 붙어야 하고, 결과에 unopenedLines 가 채워져야 한다.
const unopened = new Set(
  lines.features.filter(f => ['construction', 'planned', 'proposed'].includes(f.properties.status))
    .map(f => f.properties.id));

let flagged = 0, unflagged = [];
let sawUnopened = false;
for (const [a, b] of [
  [['노원', 127.0617, 37.6554], ['여의도', 126.9244, 37.5216]],
  [['강남', 127.0276, 37.4979], ['홍대입구', 126.9236, 37.5573]],
  [['서울역', 126.9726, 37.5547], ['판교', 127.1112, 37.3948]],
  [['인천대입구', 126.7020, 37.4550], ['평내호평', 127.2440, 37.6420]],
]) {
  const rr = route(a, b);
  if (!rr) continue;
  for (const l of rr.legs) {
    if (!l.lineId || !unopened.has(l.lineId)) continue;
    sawUnopened = true;
    if (l.unopened === true) flagged++; else unflagged.push(`${a[0]}→${b[0]}:${l.lineId}`);
  }
  // unopenedLines 목록도 leg 와 일치해야 한다
  const legUn = rr.legs.filter(l => l.unopened).map(l => l.lineId);
  if (legUn.length && !(rr.unopenedLines || []).length) unflagged.push(`${a[0]}→${b[0]}:unopenedLines 누락`);
}
check('미개통 노선이 그래프에서 배제되지 않음', sawUnopened, 'GTX-B/C 등이 어떤 경로에도 안 나옴');
check('미개통 구간에 unopened 플래그가 붙음', unflagged.length === 0, unflagged.join(', '));
check('플래그된 미개통 구간이 1개 이상', flagged >= 1, `flagged=${flagged}`);

console.log('\n[데이터] FRDB 반영 확인');
const dongbu = lines.features.find(f => f.properties.id === 'dongbu-line');
check('동부선에 FRDB 출처가 기록됨', !!dongbu.properties.frdb_url, dongbu.properties.frdb_url);
const dongbuSt = stations.features.filter(f => (f.properties.lines || []).includes('dongbu-line'));
check('동부선 역이 FRDB 16역과 일치', dongbuSt.length === 16, `${dongbuSt.length}개`);
check('동부선에 FRDB 역명이 전부 존재',
  (dongbu.properties.frdb_stations || []).every(n =>
    dongbuSt.some(s => s.properties.name_ko === n ||
      (s.properties.aliases || []).includes(n))),
  (dongbu.properties.frdb_stations || []).filter(n =>
    !dongbuSt.some(s => s.properties.name_ko === n)).join(','));

console.log('\n[중복] 같은 노선 위 400m 내 중복역이 없어야 함');
function hav(a, b) {
  const R = 6371.0088, r = Math.PI / 180;
  const dp = (b[1] - a[1]) * r, dl = (b[0] - a[0]) * r;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const byLine = new Map();
for (const f of stations.features) for (const lid of (f.properties.lines || [])) {
  if (!byLine.has(lid)) byLine.set(lid, []);
  byLine.get(lid).push(f);
}
let dups = [];
for (const [lid, list] of byLine) {
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    if (a.properties.name_ko !== b.properties.name_ko) continue; // 다른 이름은 별개 역으로 본다
    const d = hav(a.geometry.coordinates, b.geometry.coordinates);
    if (d < 0.05) dups.push(`${lid}:${a.properties.name_ko}`);
  }
}
check('동일 역명·동일 좌표 중복 없음', dups.length === 0, dups.slice(0, 8).join(', '));

console.log('\n[정차역] 선로 근처 역이 아니라 실제 정차역만 붙어 있어야 함');
function stationsOf(lid) {
  return stations.features
    .filter(f => (f.properties.lines || []).includes(lid))
    .map(f => f.properties.name_ko);
}
const gangneung = stationsOf('gangneung-line-ktx');
check('KTX 강릉선에 시청·종로5가·신설동이 없음',
  !gangneung.includes('시청') && !gangneung.includes('종로5가') && !gangneung.includes('신설동'),
  gangneung.join(','));
check('KTX 강릉선 정차역이 15개 이하', gangneung.length <= 15, `${gangneung.length}개`);
check('KTX 강릉선에 강릉·진부·평창이 있음',
  ['강릉', '진부', '평창'].every(n => gangneung.includes(n)), gangneung.join(','));

const gtxA = stationsOf('great-train-express-line-a');
check('GTX-A에 시청·경복궁·광화문이 없음',
  !gtxA.includes('시청') && !gtxA.includes('경복궁') && !gtxA.includes('광화문'), gtxA.join(','));

console.log('\n[GTX] 공식 소요시간이 기하 추정값에 덮이지 않아야 함');
// 광운대→청량리 4분 + 청량리→왕십리 3분 + 왕십리→삼성 2분 = 9분
r = route(['광운대', 127.0615, 37.6236], ['삼성', 127.0631, 37.5088]);
check('광운대→삼성 GTX-C 9분', r && r.minutes === 9, r && `${r.minutes}분`);
check('광운대→삼성 경유역이 청량리·왕십리',
  r && r.path.length === 4, r && r.path.map(nameOf).join('→'));

console.log('\n[동부선] FRDB 순서대로 종합운동장까지 이어져야 함');
r = route(['상봉', 127.0856, 37.5961], ['종합운동장', 127.0737, 37.5111]);
check('상봉→종합운동장 동부선 직결', r && r.transfers === 0, r && `${r.transfers}회`);
check('상봉→종합운동장 경유역이 장한평·성수·청담',
  r && r.path.map(nameOf).join(',') === '상봉,장한평,성수,청담,종합운동장',
  r && r.path.map(nameOf).join(','));

console.log('\n[GTX-D/E/F] chul.mom 좌표 기준 — 역이 실제 위치에 있고 직결로 이어져야 함');
// 좌표는 전부 chul.mom(https://chul.mom) 기준. 보간으로 만든 가짜 좌표는 쓰지 않는다.
const GTX_COORD_SRC = [
  ['영종국제도시', 126.56558, 37.49474],
  ['청라국제업무단지', 126.62522, 37.5292],
  ['광명시흥', 126.84717, 37.46868],
  ['교산', 127.2035, 37.52612],
  ['일패', 127.18059, 37.61457],
  ['풍양', 127.17191, 37.6973],
];
const realCoord = GTX_COORD_SRC.every(([n, lng, lat]) => {
  const c = S.filter(s => s.n === n);
  return c.some(s => Math.abs(s.c[0] - lng) < 1e-4 && Math.abs(s.c[1] - lat) < 1e-4);
});
check('GTX 신설역이 chul.mom 실제 좌표를 가짐', realCoord, '좌표 불일치 역 있음');

r = route(['인천공항1터미널', 126.4528, 37.4472], ['강남', 127.0276, 37.4980]);
check('인천공항1터미널→강남 GTX-D 직결', r && r.transfers === 0, r && `${r.transfers}회`);
check('인천공항1터미널→강남이 영종국제도시를 경유',
  r && r.path.map(nameOf).includes('영종국제도시'), r && r.path.map(nameOf).join(','));

// 강남→원주: GTX-C+KTX 3회환승(49분) 우회가 아니라 GTX-D 직결이어야 한다.
r = route(['강남', 127.0276, 37.4980], ['원주', 127.9228, 37.3164]);
check('강남→원주 GTX-D 직결(환승 0회)', r && r.transfers === 0, r && `${r.transfers}회`);
check('강남→원주가 여주·서원주를 경유',
  r && r.path.map(nameOf).includes('여주') && r.path.map(nameOf).includes('서원주'),
  r && r.path.map(nameOf).join(','));

r = route(['인천공항1터미널', 126.4528, 37.4472], ['덕소', 127.2088, 37.5869]);
check('인천공항1터미널→덕소 GTX-E 직결', r && r.transfers === 0, r && `${r.transfers}회`);
check('GTX-E가 연신내·광운대를 경유',
  r && r.path.map(nameOf).includes('연신내') && r.path.map(nameOf).includes('광운대'),
  r && r.path.map(nameOf).join(','));

r = route(['교산', 127.2035, 37.5261], ['덕소', 127.2088, 37.5869]);
check('교산→덕소 GTX-F 직결', r && r.transfers === 0, r && `${r.transfers}회`);

console.log('\n[환승 페널티] 2분 아끼려고 3번 갈아타는 경로를 고르면 안 됨');
// transferPenalty 는 '경로 선택'에만 쓰이고 표시 시간에는 영향이 없다.
const gangnam = pick('강남', 127.0276, 37.4980);
const wonju = pick('원주', 127.9228, 37.3164);
const cheap = RF.findRoute(gangnam.id, wonju.id, { transferPenalty: 4 });
const sane = RF.findRoute(gangnam.id, wonju.id, { transferPenalty: 8 });
check('페널티 4분이면 3회환승 우회가 뽑힘(문제 재현)', cheap && cheap.transfers >= 2,
  cheap && `${cheap.transfers}회`);
check('페널티 8분이면 0회환승 직결이 뽑힘', sane && sane.transfers === 0, sane && `${sane.transfers}회`);
check('페널티를 올려도 표시 시간은 실제값', sane && sane.minutes >= 40 && sane.minutes <= 70,
  sane && `${sane.minutes}분`);

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
