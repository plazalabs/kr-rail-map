/* 역 출구 좌표 — 데이터 정합성 + StationExits 모듈 동작
 *
 * 출구 좌표는 부동산 거리 계산의 기준점이다. 여기가 틀리면 '도보 5분'
 * 이라는 문장 자체를 믿을 수 없다. 그래서 개수보다 '엉뚱한 역에 붙었는지'
 * 를 본다.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ✓ ' + name + (detail ? '  [' + detail + ']' : '')); }
  else { fail++; console.log('  ✗ ' + name + (detail ? '  [' + detail + ']' : '')); }
}
function section(t) { console.log('\n[' + t + ']'); }

const readJson = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const exits = readJson('data/exits.geojson');
const stations = readJson('data/stations.geojson');
const lines = readJson('data/lines.geojson');

const R = 6371;
function hav(ax, ay, bx, by) {
  const r = Math.PI / 180;
  const dLat = (by - ay) * r, dLon = (bx - ax) * r;
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(ay * r) * Math.cos(by * r) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

section('데이터');
check('exits.geojson 이 있다', !!exits && Array.isArray(exits.features));
check('출구가 3,000개 이상', exits.features.length >= 3000, exits.features.length + '개');

const sidx = new Map(stations.features.map(f => [f.properties.id, f]));
const orphans = exits.features.filter(f => !sidx.has(f.properties.station));
check('모든 출구가 실재하는 역을 가리킴', orphans.length === 0, orphans.length + '개 고아');

const badCoord = exits.features.filter(f => {
  const c = f.geometry && f.geometry.coordinates;
  return !c || c.length !== 2 || !(c[0] > 125 && c[0] < 131) || !(c[1] > 33 && c[1] < 39);
});
check('모든 출구 좌표가 한반도 범위 안', badCoord.length === 0, badCoord.length + '개 이탈');

// 번호가 없는 출구도 있다(엘리베이터·이름 없는 출입구). 다만 있으면 숫자여야 한다.
const badNo = exits.features.filter(f => {
  const n = f.properties.no;
  return n !== '' && !/^\d+$/.test(n || '');
});
check('출구 번호가 숫자이거나 비어 있음', badNo.length === 0, badNo.length + '개 비정상');
const numbered = exits.features.filter(f => /^\d+$/.test(f.properties.no || '')).length;
check('번호 있는 출구가 95% 이상', numbered / exits.features.length >= 0.95,
  Math.round(numbered / exits.features.length * 100) + '%');

// 출구가 역에서 너무 멀면 매칭이 틀린 것이다
const far = exits.features
  .map(f => ({ f, d: hav(f.geometry.coordinates[0], f.geometry.coordinates[1],
    sidx.get(f.properties.station).geometry.coordinates[0],
    sidx.get(f.properties.station).geometry.coordinates[1]) }))
  .filter(x => x.d > 0.7);
check('역 중심에서 700m 넘는 출구가 없음', far.length === 0,
  far.length ? far.map(x => x.f.properties.name + ' ' + Math.round(x.d * 1000) + 'm').slice(0, 3).join(', ') : '0개');

const byStation = new Map();
exits.features.forEach(f => {
  const k = f.properties.station;
  byStation.set(k, (byStation.get(k) || 0) + 1);
});
const covered = byStation.size;
const ratio = covered / stations.features.length;
check('출구가 있는 역이 60% 이상', ratio >= 0.6, covered + '/' + stations.features.length +
  ' (' + Math.round(ratio * 100) + '%)');

// 대표 역 — 실제 출구 수와 대조 (2024년 기준)
const nameOf = id => (sidx.get(id) || { properties: {} }).properties.name_ko;
function countOf(name) {
  let n = 0;
  byStation.forEach((c, id) => { if (nameOf(id) === name) n = Math.max(n, c); });
  return n;
}
const KNOWN = [['강남', 10], ['잠실', 10], ['홍대입구', 8], ['서울', 12]];
KNOWN.forEach(([nm, min]) => {
  const got = countOf(nm);
  check(nm + '역 출구 ' + min + '개 이상', got >= min, got + '개');
});

// 같은 이름의 역이 여럿이면 각각 따로 붙어야 한다 (동백: 용인·부산)
const dongbaek = stations.features.filter(f => f.properties.name_ko === '동백');
check('동명이역(동백)이 2개 이상', dongbaek.length >= 2, dongbaek.length + '개');
check('동명이역마다 출구가 따로 붙음',
  dongbaek.filter(f => byStation.has(f.properties.id)).length >= 2,
  dongbaek.map(f => byStation.get(f.properties.id) || 0).join('/'));

// 미개통 노선 역에는 출구가 없어야 정상이다
const catOf = new Map(lines.features.map(f => [f.properties.id, f.properties.category || f.properties.cat]));
const statusOf = new Map(lines.features.map(f => [f.properties.id, f.properties.status || 'open']));
const plannedOnly = stations.features.filter(f => {
  const ls = f.properties.lines || [];
  return ls.length && ls.every(l => statusOf.get(l) !== 'open');
});
const plannedWithExit = plannedOnly.filter(f => byStation.has(f.properties.id));
check('미개통 노선 전용 역에는 출구가 없음',
  plannedWithExit.length <= plannedOnly.length * 0.1,
  plannedWithExit.length + '/' + plannedOnly.length);

section('StationExits 모듈');
const src = fs.readFileSync(path.join(ROOT, 'js/exits.js'), 'utf8');
function makeCtx(geo) {
  const ctx = vm.createContext({
    console, Math, Map, Set, Array, Object, JSON, Promise, Number, String,
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve(geo) }),
  });
  vm.runInContext(src, ctx);
  // 최상위 const 는 컨텍스트 객체에 붙지 않는다(전역 렉시컬 스코프). 식으로 꺼낸다.
  return vm.runInContext('StationExits', ctx);
}
const geo = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [127.0000, 37.0000] },
      properties: { station: 'A', name: '가', no: '1' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [127.0020, 37.0000] },
      properties: { station: 'A', name: '가', no: '2' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [127.0020, 37.0000] },
      properties: { station: 'A', name: '가', no: '12' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [129.0000, 35.0000] },
      properties: { station: 'B', name: '나', no: '1' } },
  ],
};
const E = makeCtx(geo);

(async () => {
  check('load 전에는 isReady 가 false', E.isReady() === false);
  await E.load('x');
  check('load 후 isReady 가 true', E.isReady() === true);
  check('전체 출구 수', E.totalExits() === 4, E.totalExits());
  check('역별 출구 수', E.exitsOf('A').length === 3, E.exitsOf('A').length);
  check('없는 역은 빈 배열', Array.isArray(E.exitsOf('Z')) && E.exitsOf('Z').length === 0);

  // 2번 출구(127.002)가 1번 출구(127.000)보다 가깝다
  const near = E.nearestExit('A', 127.0021, 37.0000);
  check('가장 가까운 출구를 고름', near && near.exit.no === '2', near && near.exit.no);
  check('거리 계산이 맞음', near && Math.abs(near.km * 1000 - 8.9) < 2,
    near && (near.km * 1000).toFixed(1) + 'm');

  const d = E.distanceTo(
    { properties: { id: 'A' }, geometry: { coordinates: [127.0010, 37.0000] } },
    127.0021, 37.0000);
  check('distanceTo 가 출구 기준', d.kind === 'exit' && d.exitNo === '2', d.kind + '/' + d.exitNo);

  // 출구가 없는 역은 중심점으로 물러나고 그 사실을 알린다
  const dc = E.distanceTo(
    { properties: { id: 'Z' }, geometry: { coordinates: [127.0010, 37.0000] } },
    127.0021, 37.0000);
  check('출구 없는 역은 kind=center', dc.kind === 'center', dc.kind);

  const sm = E.summary('A');
  check('summary 개수', sm.count === 3, sm.count);
  check('summary 번호 정렬', sm.numbers.join(',') === '1,2,12', sm.numbers.join(','));
  check('summary 분산 계산', Math.abs(sm.spreadKm * 1000 - 178) < 3,
    Math.round(sm.spreadKm * 1000) + 'm');

  // 실패해도 앱이 죽지 않아야 한다
  const ctx2 = vm.createContext({
    console, Math, Map, Set, Array, Object, JSON, Promise, Number, String,
    fetch: () => Promise.reject(new Error('boom')),
  });
  vm.runInContext(src, ctx2);
  const E2 = vm.runInContext('StationExits', ctx2);
  await E2.load('x');
  check('fetch 실패 시 hasFailed', E2.hasFailed() === true);
  check('fetch 실패해도 isReady 는 false', E2.isReady() === false);
  check('fetch 실패해도 조회는 빈 배열', E2.exitsOf('A').length === 0);

  section('투자 분석기 보행거리');
  const inv = fs.readFileSync(path.join(ROOT, 'js/invest.js'), 'utf8');
  check('우회계수를 곱한다', /DETOUR\s*=\s*1\.25/.test(inv), '1.25');
  check('출구 기반 거리를 쓴다', /StationExits\.distanceTo/.test(inv));
  check('출구 없으면 중심점으로 물러난다', /km == null[\s\S]{0,80}geometry\.coordinates/.test(inv));

  // 보행 4km/h → 1km 는 15분
  const wm = inv.match(/function walkMin\(km\)\s*\{\s*return Math\.round\(km \/ WALK_KMH \* 60\);/);
  check('도보 속도 상수 사용', !!wm);

  console.log('\n결과: ' + pass + ' 통과 / ' + fail + ' 실패');
  process.exit(fail ? 1 : 0);
})();
