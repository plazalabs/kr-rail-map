// 갈림목 방향 제한 (v277, 2026-11-15) — 같은 노선이 두 갈래로 나뉘는 역에서 갈래끼리는 갈아탄다 · 같은 열차로 되돌아가기 금지
//  1호선 구로(경인선↔경부선)·병점(서동탄↔세마) · 경춘선 상봉(광운대↔중랑) · 경의선 가좌(신촌↔홍대입구). 근거: 레일포털 시각표 — 두 갈래를 잇는 열차 없음.
// 실행: node tests/junction-turns.test.js
'use strict';
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const L = read('data/lines.geojson'), S = read('data/stations.geojson');
const ctx = vm.createContext({ console, Math, Map, Set, Array, Object, JSON, Infinity });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/route.js'), 'utf8').replace('const RouteFinder', 'globalThis.RouteFinder'), ctx);
const RF = ctx.RouteFinder;
RF.buildGraph(L.features, S.features);
RF.loadTransfers(read('data/transfer-times.json'));
const nm = Object.fromEntries(S.features.map(f => [f.properties.id, f.properties.name_ko]));
const cap = f => { const [x, y] = f.geometry.coordinates; return x > 126.5 && x < 127.6 && y > 37.0 && y < 38.0; };
const by = n => (S.features.find(f => f.properties.name_ko === n && cap(f)) || {}).properties.id;
let pass = 0, fail = 0;
const check = (name, ok, info) => { if (ok) { pass++; console.log('  ok  ' + name); } else { fail++; console.log('  ✗  ' + name + (info ? ' — ' + info : '')); } };
const route = (a, b) => RF.findRoute(by(a), by(b), { openOnly: true });
const names = r => (r && r.path || []).map(id => nm[id]);
const desc = r => r ? r.minutes + '분 ' + r.legs.map(l => nm[l.from] + '>' + nm[l.to]).join(' | ') : 'null';
RF.loadHeadways(read('data/headways.json'));
const n = r => RF.countTransfers(r.legs);
const at = r => r.legs.slice(1).map(l => nm[l.from]).join(',');

console.log('[갈래끼리는 갈림목에서 갈아탄다]');
[['구일', '가산디지털단지', '구로'], ['개봉', '독산', '구로'], ['서동탄', '세마', '병점'], ['신촌', '홍대입구', '가좌'], ['길동', '둔촌동', '강동'], ['고덕', '방이', '강동']].forEach(([a, b, x]) => {
  const r = route(a, b);
  check(`${a}→${b} 는 ${x} 에서 1번 갈아탄다`, r && n(r) === 1 && at(r) === x, desc(r) + ' 환승 ' + (r && n(r)));
});
console.log('[갈래 → 본선은 이어 달린다 (갈아타지 않음)]');
[['구일', '신도림'], ['가산디지털단지', '신도림'], ['인천', '서울'], ['서동탄', '수원'], ['세마', '수원'], ['신촌', '디지털미디어시티'], ['길동', '천호'], ['둔촌동', '천호']].forEach(([a, b]) => {
  const r = route(a, b);
  check(`${a}→${b} 환승 0 · 구간 하나`, r && n(r) === 0, desc(r) + ' 환승 ' + (r && n(r)));
});
console.log('[같은 열차로 되돌아가기 없음]');
['구일>가산디지털단지', '서동탄>세마', '개봉>독산'].forEach(p => {
  const [a, b] = p.split('>'), r = route(a, b), ps = names(r);
  check(`${p} 길에 같은 역이 두 번 나오지 않음`, new Set(ps).size === ps.length, ps.join('>'));
});
console.log('[결과 구간에 갈림목 표시가 갈래 이름처럼 보이지 않음]');
const g = route('구일', '신도림');
check('구일→신도림 구간 branch 없음', g && g.legs.every(l => !l.branch), JSON.stringify(g && g.legs.map(l => l.branch)));
const gm = route('금천구청', '광명');
check('광명셔틀은 그대로 갈래 이름', gm && gm.legs.some(l => l.branch === '광명셔틀'), desc(gm));

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
