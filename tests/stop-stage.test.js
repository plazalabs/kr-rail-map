// 삼성역 정차 단계 (11-15, 평가① P1) — 2027 개통 땐 삼성 무정차, 정차는 2028.
// '그 해까지 개통' 계산에서 2027 엔 삼성에서 타고 내릴 수 없고 서울역↔수서는 직행,
// 2028 부터는 삼성에 선다(직행 없음). '개통 후(전체)'·길찾기 '개통 예정 포함' 은 최종 계획(삼성 정차).
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
const id = n => S.features.find(f => f.properties.name_ko === n).properties.id;
let pass = 0, fail = 0;
const check = (name, ok, info) => { if (ok) pass++; else fail++; console.log((ok ? '  ✓ ' : '  ✗ ') + name + (ok ? '' : ' — ' + JSON.stringify(info))); };

const Y27 = new Set(['gtx-a-seoul-suseo']);
const Y28 = new Set(['gtx-a-seoul-suseo', 'gtx-a-samseong-stop']);
const route = (a, b, opts) => { const r = RF.findRoute(id(a), id(b), Object.assign({ noWait: true }, opts)); return r ? { min: Math.round(r.minutes * 10) / 10, path: r.path.map(p => nm[p]) } : null; };

check('단계 목록에 삼성 정차(2028) 가 있다', RF.stopStages().some(s => s.by === 'gtx-a-samseong-stop' && s.year === 2028), RF.stopStages());
check('stageIds 에 창릉·삼성 둘 다', ['gtx-a-changneung', 'gtx-a-samseong-stop'].every(x => RF.stageIds().includes(x)), RF.stageIds());

const a27 = route('서울', '수서', { openOnly: true, allow: Y27 });
check('2027: 서울역→수서 직행 (삼성 안 거침, 7.9→8분)', a27 && a27.path.join('>') === '서울>수서' && a27.min === 8, a27);
const a28 = route('서울', '수서', { openOnly: true, allow: Y28 });
check('2028: 서울역→삼성→수서 (정차, 10분 — 직행 8분보다 김)', a28 && a28.path.join('>') === '서울>삼성>수서' && a28.min === 10, a28);

const s27 = route('서울', '삼성', { openOnly: true, allow: Y27 });
check('2027: 서울역→삼성은 GTX-A 로 못 감 (삼성에서 못 내림)', s27 && !(s27.path.length === 2), s27);
const s28 = route('서울', '삼성', { openOnly: true, allow: Y28 });
check('2028: 서울역→삼성 GTX-A 한 구간', s28 && s28.path.join('>') === '서울>삼성', s28);

const full = route('서울', '수서', { openOnly: false });
check('개통 후(전체): 최종 계획 = 삼성 정차, 직행 안 씀', full && full.path.includes('삼성') && full.min >= 10, full);
const now = route('서울', '수서', { openOnly: true });
check('지금: GTX-A 서울역~수서 미개통 (직행도 없음)', now && !(now.path.length === 2), now);

// 연도 계산 바닥값: 정차 단계가 들어온 해부터는 앞 해(직행) 값을 끌고 오지 않는다
const yr = read('data/_access_years.json');
check('연도 단추에 2028 이 있다', (yr.years || []).includes(2028), yr.years);
const yrst = yr.stations[id('운정중앙')].y;
check('운정중앙 도심: 창릉 정차(2030) 뒤 지금(20)보다 길어짐 — 숨기지 않음', yrst['2030'][0] > yrst['2027'][0], yrst);
const rk = read('data/rank.json');
check('rank.json 2028 칩 이름: GTX-A 삼성역 정차', rk.lines['gtx-a-samseong-stop'] && /삼성역 정차/.test(rk.lines['gtx-a-samseong-stop'].n), rk.lines['gtx-a-samseong-stop']);

console.log('\n통과 ' + pass + ' · 실패 ' + fail);
process.exit(fail ? 1 : 0);
