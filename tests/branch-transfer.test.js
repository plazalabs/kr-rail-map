/* 갈래 운행(성수지선)에서 본선으로 갈아타는 것은 세 탭 모두 환승으로 센다 (E-13)
 * 실행: node tests/branch-transfer.test.js
 * 최적 탭(route.js)은 v266 부터 성수에서 갈아탔지만, 최소환승·최소요금 탭은 노선 id 만 봐서
 * '1호선 → 신설동 | 2호선 15개역 → 강남' 환승 1회로 성수 갈아타기를 빼먹었다.
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
const nameOf = id => (stations.features.find(f => f.properties.id === id) || {}).properties.name_ko;
const L2 = 'seoul-subway-line-2';
// 경로가 2호선으로 성수를 지나며 갈래(용답·신답·용두·신설동)와 본선(뚝섬·건대입구) 둘 다 타면 성수에서 갈아탄 것
const BR = new Set(['용답', '신답', '용두', '신설동']), MAIN = new Set(['뚝섬', '건대입구', '한양대', '구의']);
function crossesSeongsu(r) {
  let br = false, main = false;
  for (const l of r.legs) {
    if (l.lineId !== L2 || l.walk) continue;
    const i = r.path.indexOf(l.from), j = r.path.indexOf(l.to, i);
    const names = r.path.slice(i, j + 1).map(nameOf);
    if (!names.includes('성수')) continue;
    if (names.some(n => BR.has(n))) br = true;
    if (names.some(n => MAIN.has(n))) main = true;
  }
  return br && main;
}
const legsOn2 = r => r.legs.filter(l => l.lineId === L2 && !l.walk).length;

for (const band of ['peak', 'off']) {
  console.log(`[band ${band}]`);
  for (const [a, b] of [['신설동', '강남'], ['광운대', '강남'], ['용두', '잠실'], ['신답', '건대입구']]) {
    const all = RC.findAllOpen(by(a), by(b), { band });
    for (const k of ['time', 'transfer', 'fare']) {
      const r = all[k];
      if (!r) continue;
      const lines2 = r.legs.filter(l => l.lineId === L2 && !l.walk);
      // 2호선 한 구간 안에 갈래 역과 본선 역이 같이 있으면 안 된다
      const mixed = lines2.some(l => {
        const i = r.path.indexOf(l.from), j = r.path.indexOf(l.to, i);
        const names = r.path.slice(i, j + 1).map(nameOf);
        return names.some(n => BR.has(n)) && names.some(n => MAIN.has(n));
      });
      check(`${a}→${b} ${k}: 2호선 한 구간에 성수지선·본선이 섞이지 않음 (${r.minutes}분·환승 ${r.transfers}회)`, !mixed,
        r.legs.filter(l => !l.walk).map(l => `${l.lineId.replace('seoul-', '')}:${nameOf(l.from)}→${nameOf(l.to)}`).join(' | '));
      if (crossesSeongsu(r)) check(`${a}→${b} ${k}: 성수에서 갈아탐을 환승으로 셈`, legsOn2(r) >= 2 && r.transfers >= 1);
    }
  }
}
console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
