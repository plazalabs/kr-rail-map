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
}));
const nameOf = id => (S.find(s => s.id === id) || {}).n || id;

// 동명이역이 있으므로 좌표로 특정한다
function pick(nameKo, lng, lat) {
  const c = S.filter(s => s.n === nameKo);
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

console.log('\n[미개통 노선] GTX-B/C 는 경로에 등장하면 안 됨');
const unopened = new Set(
  lines.features.filter(f => ['construction', 'planned', 'proposed'].includes(f.properties.status))
    .map(f => f.properties.id));
let leaked = [];
for (const [a, b] of [
  [['노원', 127.0617, 37.6554], ['여의도', 126.9244, 37.5216]],
  [['강남', 127.0276, 37.4979], ['홍대입구', 126.9236, 37.5573]],
  [['서울역', 126.9726, 37.5547], ['판교', 127.1112, 37.3948]],
]) {
  const rr = route(a, b);
  if (rr) for (const l of rr.legs) if (l.lineId && unopened.has(l.lineId)) leaked.push(`${a[0]}→${b[0]}:${l.lineId}`);
}
check('미개통 노선 미사용', leaked.length === 0, leaked.join(', '));

console.log('\n[데이터] FRDB 반영 확인');
const dongbu = lines.features.find(f => f.properties.id === 'dongbu-line');
check('동부선에 FRDB 출처가 기록됨', !!dongbu.properties.frdb_url, dongbu.properties.frdb_url);
const dongbuSt = stations.features.filter(f => (f.properties.lines || []).includes('dongbu-line'));
check('동부선 역이 10개 이하 (오귀속 제거)', dongbuSt.length <= 10, `${dongbuSt.length}개`);

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
