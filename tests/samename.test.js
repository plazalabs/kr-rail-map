/* 동명 이역(시청·교대·용산 …) 회귀 시험 (IMPL12 건 2)
 * 실행: node tests/samename.test.js
 *   - 시세·단지·공급: 동명 역 각각 자기 지역 자료만 (다른 도시 역은 '자료 없음')
 *   - 앱 모듈(price.js·dev.js)이 역 ID 로 찾고, 옛 이름 키 자료는 거부
 *   - 인접역: 그 노선 위의 역 ID 로 (서울 2호선 교대 → 부산 교대로 가지 않음)
 *   - 길찾기: GTX-A·B '서울역' 공식 소요시간 간선이 '서울' 역에 붙음
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const ST = read('data/stations.geojson').features;
const PRICE = read('data/station-price.json');
const CX = read('data/station-complex.json');
const DEV = read('data/station-dev.json');
let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}  ${detail === undefined ? '' : detail}`); }
}
const ids = n => ST.filter(s => s.properties.name_ko === n);
const onLine = (n, l) => ids(n).find(s => (s.properties.lines || []).includes(l)).properties.id;

// 지역(시군구코드)이 공식 주소로 알려진 동명 역 표본 — 이름: [이 역(코드)에만, 이 역들은 없음]
const SEOUL_CITYHALL = onLine('시청', 'seoul-metropolitan-subway-line-1');
const BUSAN_CITYHALL = onLine('시청', 'busan-metro-line-1');
const DAEJEON_CITYHALL = onLine('시청', 'daejeon-metro-line-1');
const SEOUL_GYODAE = onLine('교대', 'seoul-subway-line-2');
const BUSAN_GYODAE = onLine('교대', 'donghae-line');
const DAEGU_GYODAE = onLine('교대', 'daegu-metro-line-1');
const SEOUL_YONGSAN = onLine('용산', 'seoul-metropolitan-subway-line-1');
const DAEGU_YONGSAN = onLine('용산', 'daegu-metro-line-2');

console.log('[자료] 키가 역 ID');
for (const [nm, d] of [['시세', PRICE], ['단지', CX], ['공급', DEV]]) {
  const known = new Set(ST.map(s => s.properties.id));
  check(`${nm}: keyed_by=station_id, 키 전부 실제 역 ID`, d.keyed_by === 'station_id' && Object.keys(d.stations).every(k => known.has(k)));
}

console.log('\n[자료] 동명 역은 자기 지역 것만');
const cases = [
  ['시청', SEOUL_CITYHALL, '11140', [BUSAN_CITYHALL, DAEJEON_CITYHALL]],
  ['교대', SEOUL_GYODAE, '11650', [BUSAN_GYODAE, DAEGU_GYODAE]],
  ['용산', SEOUL_YONGSAN, '11170', [DAEGU_YONGSAN]],
];
for (const [nm, own, lawd, others] of cases) {
  const p = PRICE.stations[own];
  check(`시세 ${nm}: 서울 역(${own})에 서울 시군구(${lawd}) 시세`, p && p.lawd === lawd, p && p.lawd);
  check(`시세 ${nm}: 다른 도시 ${nm}역에는 시세 없음`, others.every(o => !PRICE.stations[o]), others.filter(o => PRICE.stations[o]).join(','));
  check(`단지 ${nm}: 서울 역만, 서울 시군구`, (CX.stations[own] || '').startsWith(lawd + '|') && others.every(o => !CX.stations[o]));
}
// 이름이 같은 두 '양평' — 경기 양평군 · 서울 영등포구 — 각자 자기 시군구
const yp = ids('양평').map(s => s.properties.id).map(id => (PRICE.stations[id] || {}).lawd).sort();
check("시세 '양평' 두 역이 서로 다른 시군구 (41830 · 11560)", JSON.stringify(yp) === JSON.stringify(['11560', '41830']), JSON.stringify(yp));

console.log('\n[앱] price.js · dev.js 가 역 ID 로 찾는다');
async function main() {
  const fakeFetch = (doc) => () => Promise.resolve({ ok: true, json: () => Promise.resolve(doc) });
  const loadModule = (file, doc) => {
    const ctx = { console, Math, JSON, Object, String, Number, Array, Promise, Error, window: {}, fetch: fakeFetch(doc), document: undefined };
    ctx.window = ctx;
    vm.createContext(ctx);
    let src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    if (file.endsWith('dev.js')) src = src.replace('const StationDev', 'globalThis.StationDev');
    vm.runInContext(src, ctx);
    return ctx;
  };
  const P = loadModule('js/price.js', PRICE).StationPrice;
  await P.load();
  check('StationPrice.of(서울 시청 ID) = 서울 중구', P.of(SEOUL_CITYHALL) && P.of(SEOUL_CITYHALL).lawd === '11140');
  check('StationPrice.of(부산 시청 ID) = 없음', P.of(BUSAN_CITYHALL) === null);
  check("StationPrice.of('시청') 이름으로는 못 찾음", P.of('시청') === null);
  const P2 = loadModule('js/price.js', Object.assign({}, PRICE, { keyed_by: undefined, stations: { '시청': PRICE.stations[SEOUL_CITYHALL] } })).StationPrice;
  await P2.load();
  check('옛 이름 키 자료는 거부 (동명 역에 남의 시세 금지)', !P2.isReady() && P2.of(SEOUL_CITYHALL) === null);
  const D = loadModule('js/dev.js', DEV).StationDev;
  await D.load();
  check('StationDev.of(서울 교대 ID) 있음 · 부산 교대 없음', !!D.of(SEOUL_GYODAE) && D.of(BUSAN_GYODAE) === null);

  console.log('\n[인접역] 그 노선 위의 역 ID');
  const el = () => ({ style: {}, setAttribute() {}, appendChild() {}, addEventListener() {}, querySelector: () => el(), querySelectorAll: () => [], classList: { add() {}, remove() {}, toggle() {} } });
  const doc = { getElementById: () => null, createElement: el, head: el(), body: el(), addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
  const sdCtx = { console, Math, JSON, Object, String, Number, Array, Infinity, isFinite, parseFloat, document: doc, addEventListener() {} };
  sdCtx.window = sdCtx; sdCtx.global = sdCtx;
  vm.createContext(sdCtx);
  let sd = fs.readFileSync(path.join(ROOT, 'js/station-detail.js'), 'utf8');
  vm.runInContext(sd, sdCtx);
  const SD = sdCtx.StationDetail;
  SD.init(null, read('data/lines.geojson').features, ST);
  const near = ST.find(s => s.properties.name_ko === '서초' && (s.properties.lines || []).includes('seoul-subway-line-2')).properties.id;
  check("서울 2호선 서초 옆 '교대' → 서울 2호선 교대 ID", SD._idOnLine('교대', 'seoul-subway-line-2', near) === SEOUL_GYODAE, SD._idOnLine('교대', 'seoul-subway-line-2', near));
  check("부산 1호선 위 '시청' → 부산 시청 ID", SD._idOnLine('시청', 'busan-metro-line-1', BUSAN_CITYHALL) === BUSAN_CITYHALL);

  console.log('\n[길찾기] GTX 공식 간선');
  const rsrc = fs.readFileSync(path.join(ROOT, 'js/route.js'), 'utf8').replace('const RouteFinder', 'globalThis.RouteFinder');
  const rctx = vm.createContext({ console, Math, Map, Set, Array, Object, JSON, Infinity });
  vm.runInContext(rsrc, rctx);
  const RF = rctx.RouteFinder;
  RF.buildGraph(read('data/lines.geojson').features, ST);
  const seoul = ids('서울')[0].properties.id;
  const off = (lid) => (RF.adjacency().get(seoul) || []).filter(e => e.lineId === lid && e.officialMin != null).map(e => e.officialMin).sort();
  check("GTX-A '서울역' 공식 간선이 '서울' 역에 붙음 (연신내 6분 · 수서 9분, 삼성 무정차)", JSON.stringify(off('great-train-express-line-a')) === '[6,9]', JSON.stringify(off('great-train-express-line-a')));
  check("GTX-B '서울역' 공식 간선이 '서울' 역에 붙음 (용산 3분 · 청량리 5분)", JSON.stringify(off('gtx-b')) === '[3,5]', JSON.stringify(off('gtx-b')));

  console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
  process.exit(fail ? 1 : 0);
}
main();
