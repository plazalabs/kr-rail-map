// 가짜 이웃 연결 고치기 (v276, 2026-11-15) — 레일포털 시각표의 '바로 다음 역' 으로 수도권 코레일·민자 노선 지도 연결 바로잡기
//  지도 선 조각에 역이 살짝 떨어져 붙어 역을 건너뛴 가짜 간선이 생겼다(별내별가람→상계 한 칸, 경의중앙 한국항공대→홍대입구 한 칸 등).
//  급행 정차 쌍(노량진–영등포 등)은 시각표에 있어도 이웃이 아니다 — 역 위치로 거른다(레일포털 초는 급행도 일반과 같다).
//  서해선은 김포공항(시각표 이름 '신김포')을 건너뛰었다 → 능곡 390초 김포공항 270초 원종.
// 실행: node tests/kric-topology.test.js
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
const names = r => (r.path || []).map(id => nm[id]);
const desc = r => r ? r.minutes + '분 ' + names(r).join('>') : 'null';

console.log('[가짜 이웃 지움 — 사이 역을 지나간다]');
[['별내별가람', '상계', '불암산'], ['한국항공대', '홍대입구', '가좌'], ['서강대', '효창공원앞', '공덕'], ['한남', '응봉', '옥수'],
 ['회기', '상봉', '중랑'], ['석계', '월계', '광운대']].forEach(([a, b, via]) => {
  const r = route(a, b);
  check(`${a}→${b} 는 ${via} 를 지난다`, r && names(r).includes(via), desc(r));
});

console.log('[급행 정차 쌍은 이웃이 아니다]');
[['노량진', '영등포', '대방'], ['부평', '송내', '부개'], ['광운대', '창동', '월계'], ['동인천', '주안', '제물포']].forEach(([a, b, via]) => {
  const r = route(a, b);
  check(`${a}→${b} 는 ${via} 를 지난다(가짜 급행 한 칸 없음)`, r && names(r).includes(via), desc(r));
});

console.log('[서해선 김포공항 정차]');
const sh = route('능곡', '원종');
check('능곡→원종 은 김포공항을 지난다', sh && names(sh).includes('김포공항'), desc(sh));
check('능곡→원종 = 시각표 390+270초 + 정차 ≈ 11~12분', sh && sh.minutes >= 11 && sh.minutes <= 12, desc(sh));
const gp = route('김포공항', '원종');
check('김포공항→원종 서해선 한 번(갈아타지 않음)', gp && gp.legs.filter(l => !l.walk).length === 1 && gp.legs[0].lineId === 'seoul-metropolitan-subway-seohae-line', gp && JSON.stringify(gp.legs.map(l => l.lineId)));

console.log('[끊기지 않음]');
[['별내별가람', '상계'], ['능곡', '원종'], ['서강대', '가좌'], ['구일', '신도림']].forEach(([a, b]) => {
  const r = route(a, b);
  check(`${a}→${b} 길 있음, 30분 안`, r && r.minutes <= 30, desc(r));
});

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
