/* '최적' 길은 다른 탭(최소환승·최소요금)에 시간·환승·요금 모두에서 밀리면 안 된다 (E-11, CLAUDE.md 3장)
 * 실행: node tests/route-dominance.test.js
 * 광운대→강남: 최적 56분·2,550원 vs 최소환승 55분·1,950원(환승 같거나 적음) — 셋 다 밀렸다.
 * 밀리면 그 길을 최적으로 낸다.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
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
const by = n => { const f = stations.features.find(f => f.properties.name_ko === n && cap(f)); return f && f.properties.id; };

let pass = 0, fail = 0;
const check = (name, ok, info) => { if (ok) { pass++; console.log('  ok  ' + name); } else { fail++; console.log('  ✗  ' + name + (info ? ' — ' + info : '')); } };
const s = r => `${r.minutes}분·${r.transfers}회·${r.fare}원`;
const dominates = (o, b) => o.minutes <= b.minutes && o.transfers <= b.transfers && o.fare <= b.fare &&
  (o.minutes < b.minutes || o.transfers < b.transfers || o.fare < b.fare);

const PAIRS = [
  ['광운대', '강남'], ['서울', '강남'], ['광운대', '선릉'], ['신설동', '강남'], ['홍대입구', '잠실'],
  ['수원', '강남'], ['동작', '서현'], ['의정부', '삼성'], ['인천', '서울'], ['노원', '여의도'],
  ['일산', '강남'], ['부평', '광화문'], ['서현', '종로3가'], ['김포공항', '삼성'], ['상계', '역삼'],
];

for (const band of ['peak', 'off']) for (const peakWait of [false, true]) for (const include of [false, true]) {
  console.log(`[band ${band} · 배차 넣기 ${peakWait ? '켬' : '끔'} · 개통 예정 ${include ? '포함' : '빼고'}]`);
  for (const [a, b] of PAIRS) {
    const A = by(a), B = by(b);
    if (!A || !B) { check(`${a}→${b} 역 찾기`, false); continue; }
    const all = include ? RC.findAll(A, B, { peakWait, band }) : RC.findAllOpen(A, B, { peakWait, band });
    const best = all.time;
    if (!best) continue;
    const beaten = ['transfer', 'fare'].map(k => [k, all[k]]).filter(([, o]) => o && dominates(o, best));
    check(`${a}→${b} 최적 ${s(best)}`, !beaten.length, beaten.map(([k, o]) => `${k} ${s(o)}`).join(', '));
  }
}

console.log('[안내 문구에 요금 차이 (숙제 42)]');
{
  const T = { minutes: 40, transfers: 2, fare: 1550 };
  const a = RC.insightOf({ time: T, transfer: { minutes: 45, transfers: 1, fare: 2150 }, fare: null });
  check('최소환승이 600원 비싸면 "600원 더 비쌈"', /환승 1회 절약 · 600원 더 비쌈/.test(a), a);
  const b = RC.insightOf({ time: T, transfer: { minutes: 45, transfers: 1, fare: 1450 }, fare: null });
  check('최소환승이 100원 싸면 "100원 쌈"', /환승 1회 절약 · 100원 쌈/.test(b), b);
  const c = RC.insightOf({ time: T, transfer: { minutes: 45, transfers: 1, fare: 1550 }, fare: null });
  check('같으면 "요금 같음"', /요금 같음/.test(c), c);
}

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
