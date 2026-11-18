// 회귀(숙제 70, 회장 결정 11-18): 최소요금 탭은 최적보다 20분 넘게 더 걸리는 길을 내지 않는다.
// 그 안에 최적보다 싼 길이 없으면 최소요금 탭 = 최적 길, 탭 안내 '최적과 같음'.
// 검수 때: 신설동→강남 최소요금 93분·1,650원 vs 최적 34분·1,750원(100원 아끼려 59분), 광운대→강남 88분·1,750원 vs 최적 56분.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const ROOT = process.env.KR_RAIL_ROOT || process.cwd();
const read = p => readFileSync(join(ROOT, p), 'utf8');
const lines = JSON.parse(read('data/lines.geojson'));
const stations = JSON.parse(read('data/stations.geojson'));

const ctx = vm.createContext({
  console, Math, Map, Set, Array, Object, JSON, Infinity, Promise,
  document: { getElementById: () => null, createElement: () => ({ style: {}, appendChild() {} }),
    head: { appendChild() {} }, addEventListener() {} },
  window: {},
});
vm.runInContext(read('js/route.js').replace('const RouteFinder', 'globalThis.RouteFinder'), ctx);
vm.runInContext(read('js/route-compare.js').replace('const RouteCompare', 'globalThis.RouteCompare'), ctx);
const RF = ctx.RouteFinder, RC = ctx.RouteCompare;
RF.buildGraph(lines.features, stations.features);
RF.loadHeadways(JSON.parse(read('data/headways.json')));
RF.loadHeadwaysOff(JSON.parse(read('data/headways-off.json')));
RF.loadTransfers(JSON.parse(read('data/transfer-times.json')));
RC.init(RF, stations.features, lines.features);
RC.loadKtxFares(JSON.parse(read('data/ktx-fares.json')));
RC.loadSpecialFares(JSON.parse(read('data/fares-special.json')));

const cap = f => { const [x, y] = f.geometry.coordinates; return x > 126.5 && x < 127.6 && y > 37.0 && y < 38.0; };
const by = n => stations.features.find(f => f.properties.name_ko === n && cap(f)).properties.id;
const CONDS = [];
for (const band of ['peak', 'off']) for (const peakWait of [false, true]) CONDS.push({ band, peakWait });
const CAP = 20;

test('[R-70] 신설동→강남·광운대→강남: 최소요금은 최적 + 20분 안 (네 조건)', () => {
  for (const [a, b] of [['신설동', '강남'], ['광운대', '강남']]) {
    for (const c of CONDS) {
      const all = RC.findAllOpen(by(a), by(b), c);
      assert.ok(all.fare.minutes <= all.time.minutes + CAP,
        `${a}→${b} ${c.band}·배차넣기 ${c.peakWait}: 최소요금 ${all.fare.minutes}분·${all.fare.fare}원 vs 최적 ${all.time.minutes}분·${all.time.fare}원`);
      assert.ok(all.fare.fare <= all.time.fare, `${a}→${b}: 최소요금이 최적보다 비쌈`);
    }
  }
});

test("[R-70] 불변식: 최소요금 ≤ 최적 + 20분 — 표본 쌍 × 네 조건 (개통 예정 포함도)", () => {
  const PAIRS = [['광운대', '선릉'], ['서울', '강남'], ['신설동', '강남'], ['홍대입구', '잠실'], ['노원', '여의도'],
    ['의정부', '삼성'], ['상계', '역삼'], ['수원', '강남'], ['일산', '강남'], ['인천', '서울'], ['부평', '강남'], ['판교', '시청']];
  const bad = [];
  for (const [a, b] of PAIRS) for (const c of CONDS) {
    for (const all of [RC.findAllOpen(by(a), by(b), c), RC.findAll(by(a), by(b), c)]) {
      if (!all.time || !all.fare) continue;
      if (all.fare.minutes > all.time.minutes + CAP) bad.push(`${a}→${b} ${c.band}/${c.peakWait}: ${all.fare.minutes} > ${all.time.minutes}+${CAP}`);
    }
  }
  assert.deepEqual(bad, []);
});

test("[R-70] 상한 안에 더 싼 길이 없으면 최소요금 탭 안내는 '최적과 같음'", () => {
  const src = read('js/route-compare.js');
  assert.match(src, /최적과 같음/);
  // 최소요금 = 최적 길(같은 길)인 쌍 하나 이상에서 같은 객체를 낸다
  let same = 0;
  for (const [a, b] of [['신설동', '강남'], ['광운대', '강남'], ['서울', '강남']]) {
    const all = RC.findAllOpen(by(a), by(b), { band: 'peak', peakWait: false });
    if (all.fare === all.time || all.fare.fareSameAsBest) same++;
  }
  assert.ok(same >= 1);
});

test('[R-70] 세 탭이 같은 잣대(route.js legsOfPath)로 분을 센다 — 상한 20분을 같은 시간으로 견주게', () => {
  const rc = read('js/route-compare.js'), rt = read('js/route.js');
  // 최적 = route.js findRoute → legsOfPath, 최소환승·최소요금 = buildLegs → RF.legsOfPath
  assert.match(rt, /return legsOfPath\(path, edges, peak\)/);
  const buildLegs = rc.slice(rc.indexOf('function buildLegs'), rc.indexOf('function buildLegs') + 400);
  assert.match(buildLegs, /RF\.legsOfPath\(/);
  for (const fn of ['function findMinTransfer', 'function findMinFare']) {
    const i = rc.indexOf(fn), body = rc.slice(i, rc.indexOf('\n  }\n', i));
    assert.match(body, /buildLegs\(stations, edges\)/, fn + ' 가 buildLegs 를 안 씀');
  }
  // 같은 길이면 같은 분: 최소요금이 최적 길을 고르면 분도 같다
  for (const [a, b] of [['신설동', '강남'], ['서울', '강남']]) {
    const all = RC.findAllOpen(by(a), by(b), { band: 'peak', peakWait: false });
    const same = all.fare.path.length === all.time.path.length && all.fare.path.every((x, i) => x === all.time.path[i]);
    if (same) assert.equal(all.fare.minutes, all.time.minutes, `${a}→${b}: 같은 길인데 분이 다름`);
  }
});
