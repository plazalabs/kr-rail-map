// 6호선 응암 순환 한 방향 고리 (v280, 2026-11-15) — 열차는 응암→역촌→불광→독바위→연신내→구산→응암 한 방향으로만 돈다.
//  근거: 서울교통공사 6호선 열차운행시각표·레일포털 시각표. 반대 방향 간선 없음, 구산→응암→역촌은 응암에서 갈아탐.
// 실행: node tests/oneway-loop.test.js
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
const n = r => RF.countTransfers(r.legs);const at = r => r.legs.slice(1).map(l => nm[l.from]).join(',');

console.log('[6호선 응암 순환 = 한 방향 고리]');
const A = RF.adjacency(), L6 = 'seoul-subway-line-6';
const has = (a, b) => (A.get(by(a)) || []).some(e => !e.walk && e.lineId === L6 && e.to === by(b));
const loop = ['응암', '역촌', '불광', '독바위', '연신내', '구산', '응암'];
for (let i = 0; i + 1 < loop.length; i++) {
  check(`${loop[i]}→${loop[i + 1]} 간선 있음`, has(loop[i], loop[i + 1]));
  check(`${loop[i + 1]}→${loop[i]} 간선 없음(반대 방향 열차 없음)`, !has(loop[i + 1], loop[i]));
}
check('새절↔응암 양방향 그대로', has('새절', '응암') && has('응암', '새절'));
let r = route('새절', '구산');
check('새절→구산 = 응암에서 고리 한 바퀴(역촌·불광·독바위·연신내 지남), 무환승, 10분 넘음', r && n(r) === 0 && ['역촌', '불광', '독바위', '연신내'].every(x => names(r).includes(x)) && r.minutes > 10, desc(r));
r = route('구산', '새절');
check('구산→새절 = 응암 지나 바로, 무환승, 6분 안', r && n(r) === 0 && r.minutes <= 6, desc(r));
r = route('구산', '역촌');
check('구산→역촌 = 응암에서 1번 갈아탐 (구산→응암 열차는 새절 쪽으로 감)', r && n(r) === 1 && at(r) === '응암', desc(r) + ' 환승 ' + (r && n(r)));
r = route('불광', '응암');
check('불광→응암 = 독바위·연신내·구산 지나 무환승 (6호선만 쓸 때)', r && names(r).includes('구산') && n(r) === 0, desc(r));
r = route('역촌', '불광');
check('역촌→불광 = 한 칸 무환승', r && n(r) === 0 && r.minutes <= 3, desc(r));
r = route('연신내', '독바위');
check('연신내→독바위 = 6호선 반대 방향 한 칸으로 가지 않음', r && !(r.legs.length === 1 && r.legs[0].lineId === L6 && names(r).length === 2), desc(r));

console.log(`
${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
