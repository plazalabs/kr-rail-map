/* 경로 품질 점검 — 실제로 말이 되는 경로가 나오는지 눈으로 확인한다.
 * 실행: node tests/inspect.js
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
RF.buildGraph(lines.features, stations.features);

const S = stations.features.map(f => ({
  id: f.properties.id, n: f.properties.name_ko, c: f.geometry.coordinates,
}));
const nameOf = id => (S.find(s => s.id === id) || {}).n || id;
const lineName = id => {
  const f = lines.features.find(x => x.properties.id === id);
  return f ? f.properties.name_ko : id;
};

function pick(nameKo, lng, lat) {
  const c = S.filter(s => s.n === nameKo);
  if (!c.length) return null;
  return c.sort((a, b) =>
    (Math.abs(a.c[0] - lng) + Math.abs(a.c[1] - lat)) -
    (Math.abs(b.c[0] - lng) + Math.abs(b.c[1] - lat)))[0];
}

const CASES = [
  ['강남', 127.0276, 37.4979, '홍대입구', 126.9236, 37.5573],
  ['노원', 127.0617, 37.6554, '여의도', 126.9244, 37.5216],
  ['서울역', 126.9726, 37.5547, '판교', 127.1112, 37.3948],
  ['인천대입구', 126.7020, 37.4550, '평내호평', 127.2440, 37.6420],
  ['수원', 126.9999, 37.2658, '청량리', 127.0483, 37.5806],
  ['강남', 127.0276, 37.4979, '수원', 126.9999, 37.2658],
  ['상봉', 127.0856, 37.5961, '종합운동장', 127.0737, 37.5111],
  ['광운대', 127.0615, 37.6236, '삼성', 127.0631, 37.5088],
  ['대곡', 126.8103, 37.6318, '김포공항', 126.8013, 37.5626],
  ['부산역', 129.0403, 35.1151, '서면', 129.0594, 35.1578],
];

for (const [an, alng, alat, bn, blng, blat] of CASES) {
  const A = pick(an, alng, alat), B = pick(bn, blng, blat);
  if (!A || !B) { console.log(`\n${an} → ${bn}: 역 없음`); continue; }
  const r = RF.findRoute(A.id, B.id);
  console.log(`\n${an} → ${bn}`);
  if (!r) { console.log('  경로 없음'); continue; }
  console.log(`  ${r.minutes}분 / 환승 ${r.transfers}회 / 경유 ${r.path.length - 2}역` +
    (r.unopenedLines.length ? `  ⚠미개통 ${r.unopenedLines.map(lineName).join(',')}` : ''));
  r.legs.forEach(l => {
    if (l.walk) { console.log(`   🚶 ${nameOf(l.from)} → ${nameOf(l.to)}`); return; }
    console.log(`   ${nameOf(l.from)} → ${lineName(l.lineId)}${l.unopened ? ' [미개통]' : ''} → ${nameOf(l.to)}`);
  });
}
