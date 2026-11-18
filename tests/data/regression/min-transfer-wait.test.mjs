// 회귀(E-12): '최소환승' 탭은 같은 환승 수의 길 가운데 화면에 나오는 시간(갈아탈 때 기다림·환승 도보 포함)이 가장 짧은 길을 고른다.
// 검수 때 광운대→선릉: 최적 45분(회기→왕십리) / 최소환승 80분(청량리에서 수인분당 — 출근 배차 120분, 기다림 60분).
// 최소환승 탐색이 승차 분만 견주어 청량리 길을 골랐고, 화면 시간엔 그 기다림이 붙었다.
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

test('[R-E12] 광운대→선릉 최소환승은 청량리에서 수인분당으로 갈아타지 않는다 (네 조건)', () => {
  // 청량리 수인분당 공식 배차: 출근 120분·평시 94.7분 (data/headways*.json). 1회 환승 길 가운데 시청 2호선 길이 더 빠르다.
  for (const c of CONDS) {
    const r = RC.findAllOpen(by('광운대'), by('선릉'), c).transfer;
    const viaChr = r.legs.some(l => l.lineId === 'suin-bundang-line' && l.from === by('청량리'));
    assert.ok(!viaChr, `${c.band}·배차넣기 ${c.peakWait}: 최소환승 ${r.minutes}분 — 청량리 수인분당 길`);
    assert.equal(r.transfers, 1);
  }
});

test('[R-E12] 최소환승은 환승 수가 같거나 적은 최적 길보다 느리지 않다', () => {
  const PAIRS = [['광운대', '선릉'], ['광운대', '강남'], ['서울', '강남'], ['신설동', '강남'], ['홍대입구', '잠실'],
    ['노원', '여의도'], ['의정부', '삼성'], ['상계', '역삼'], ['수원', '강남'], ['일산', '강남']];
  const bad = [];
  for (const c of CONDS) for (const [a, b] of PAIRS) {
    const all = RC.findAllOpen(by(a), by(b), c);
    if (!all.time || !all.transfer) continue;
    if (all.time.transfers <= all.transfer.transfers && all.time.minutes < all.transfer.minutes)
      bad.push(`${a}→${b} ${c.band}·${c.peakWait}: 최적 ${all.time.minutes}분·${all.time.transfers}회 < 최소환승 ${all.transfer.minutes}분·${all.transfer.transfers}회`);
  }
  assert.deepEqual(bad, []);
});
