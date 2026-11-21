// 회귀(숙제 72, 회장 결정 11-19 — 70 질문 ②): 최소요금 탭은 최적 + 20분 안에서만 고른다(숙제 70).
// 그 밖에 더 싼 길이 최소환승 탭에 있으면 최소요금 탭 안내에 한 줄 '더 싸지만 N분 더 걸리는 길은 최소환승 탭'.
// 값(분·원)은 이미 계산된 탭(all.time · all.fare · all.transfer)에서만 — 새 탐색 없음.
// 검수 때: 월계2교→영통(개통 예정 포함) 최소요금 = 최적 4,600원(+ GTX 요금 미정)인데 최소환승 탭은 2,450원 — 안내가 없어 최소요금 탭이 틀린 것처럼 보였다.
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
const HINT = /더 싸지만 (\d+)분 더 걸리는 길은 최소환승 탭/;

test('[R-72] 월계2교→영통(개통 예정 포함): 최소요금 = 최적, 최소환승이 더 쌈 → 안내 한 줄, N = 최소환승 − 최적 분', () => {
  for (const c of CONDS) {
    const all = RC.findAll(by('월계2교'), by('영통'), c);
    const note = RC.fareTabNote(all);
    const m = note.match(HINT);
    assert.ok(m, `${c.band}/${c.peakWait}: 안내 없음 — '${note}' (최적 ${all.time.minutes}분·${all.time.fare}원, 최소환승 ${all.transfer.minutes}분·${all.transfer.fare}원)`);
    assert.equal(Number(m[1]), all.transfer.minutes - all.time.minutes, note);
  }
});

test('[R-72] 상한 밖에 더 싼 길이 없으면 줄 없음 — 신설동→강남·서울→강남 (네 조건)', () => {
  for (const [a, b] of [['신설동', '강남'], ['서울', '강남']]) for (const c of CONDS) {
    const note = RC.fareTabNote(RC.findAllOpen(by(a), by(b), c));
    assert.doesNotMatch(note, /최소환승 탭/, `${a}→${b} ${c.band}/${c.peakWait}: '${note}'`);
  }
});

test('[R-72] 줄이 나오는 조건 = 최소환승 탭 요금 < 최소요금 탭 요금 이고 최적 + 20분 밖 (표본 쌍 × 네 조건 × 개통 예정 포함·뺌)', () => {
  const PAIRS = [['월계2교', '영통'], ['광운대', '강남'], ['일산', '강남'], ['신설동', '강남'], ['서울', '강남'], ['수원', '강남'], ['노원', '여의도'], ['의정부', '삼성']];
  const bad = [];
  let shown = 0;
  for (const [a, b] of PAIRS) for (const c of CONDS) for (const all of [RC.findAllOpen(by(a), by(b), c), RC.findAll(by(a), by(b), c)]) {
    const t = all.time, f = all.fare, x = all.transfer;
    if (!t || !f) continue;
    // 최소환승 길은 요금이 다 정해져 있어야 한다. 최소요금 길의 미정 구간은 요금을 더할 뿐이라 알려진 요금 그대로 견준다
    const want = !!(x && typeof x.fare === 'number' && typeof f.fare === 'number' && !RC.hasPending(x)
      && x.fare < f.fare && x.minutes > t.minutes + CAP);
    const m = RC.fareTabNote(all).match(HINT);
    if (!!m !== want) bad.push(`${a}→${b} ${c.band}/${c.peakWait}: 줄 ${!!m} / 기대 ${want}`);
    if (m) { shown++; if (Number(m[1]) !== x.minutes - t.minutes) bad.push(`${a}→${b}: N ${m[1]} ≠ ${x.minutes - t.minutes}`); }
  }
  assert.ok(shown > 0, '줄이 나오는 쌍이 하나도 없음 — 시험이 비어 있음');
  assert.deepEqual(bad, []);
});
