// 한 역→모든 역(allTimesFrom: 순위·접근성·통근권) 과 길찾기(findRoute) 가 같은 분을 말하는가 (11-15, P19 점검)
// 같은 대기 규칙(기본: 환승 대기 포함)에서 비교한다. 순위는 회장님 결정(11-12)으로 noWait(타고 가는 시간만)라
// findRoute 와 직접 비교하면 안 된다 — 그 차이는 의도된 것이고 화면에 '기다리는 시간 빠짐' 으로 적혀 있다.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const L = read('data/lines.geojson'), S = read('data/stations.geojson');
const src = fs.readFileSync(path.join(ROOT, 'js/route.js'), 'utf8').replace('const RouteFinder', 'globalThis.RouteFinder');
const ctx = vm.createContext({ console, Math, Map, Set, Array, Object, JSON, Infinity });
vm.runInContext(src, ctx);
const RF = ctx.RouteFinder;
RF.buildGraph(L.features, S.features);
RF.loadTransfers(read('data/transfer-times.json'));
RF.loadHeadways(read('data/headways.json'));
const nm = Object.fromEntries(S.features.map(f => [f.properties.id, f.properties.name_ko]));
const cap = S.features.filter(f => { const [x, y] = f.geometry.coordinates; return x > 126.5 && x < 127.4 && y > 37.2 && y < 37.8; }).map(f => f.properties.id);
let seed = 11; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const srcs = Array.from({ length: 12 }, () => cap[Math.floor(rnd() * cap.length)]);
const tgts = Array.from({ length: 12 }, () => cap[Math.floor(rnd() * cap.length)]);
const modes = [
  ['지금', { openOnly: true }],
  ['개통 후', { openOnly: false }],
  ['2027 (삼성 무정차)', { openOnly: true, allow: new Set(['gtx-a-seoul-suseo', 'dongbuk-line']) }],
  ['2028 (삼성 정차)', { openOnly: true, allow: new Set(['gtx-a-seoul-suseo', 'dongbuk-line', 'gtx-a-samseong-stop']) }],
];
let fail = 0, pass = 0;
for (const [name, o] of modes) {
  let n = 0, bad = [], off1 = 0;
  for (const s of srcs) {
    const m = RF.allTimesFrom(s, o);
    for (const t of tgts) {
      if (s === t) continue;
      const r = RF.findRoute(s, t, o), a = m.get(t);
      if (!r || a == null) continue;
      n++;
      // 탐색 비용이 같은 두 길(동률) 중 어느 쪽을 고르느냐로 1분 차이가 날 수 있다 (강변→청구 23/22) — 1분까지는 허용, 그 이상은 버그
      if (Math.abs(a - r.minutes) > 1) bad.push(nm[s] + '→' + nm[t] + ' ' + a + ' vs ' + r.minutes);
      else if (a !== r.minutes) off1++;
    }
  }
  const ok = bad.length === 0 && n > 50 && off1 / n <= 0.02;
  if (ok) pass++; else fail++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + ': ' + n + '쌍 ±1분 안 (1분 차이 ' + off1 + ')' + (ok ? '' : ' — 다름 ' + bad.length + ': ' + bad.slice(0, 4).join(', ')));
}
console.log('\n통과 ' + pass + ' · 실패 ' + fail);
process.exit(fail ? 1 : 0);
