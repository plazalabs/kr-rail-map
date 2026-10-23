/* '지금 vs 개통 후' 비교 테스트 — 의존성 없이 실행: node tests/nowfuture.test.js
 *
 * 이 지도는 착공·계획 노선까지 그린다. 그래서 지금 상태의 '최단시간'은
 * 아직 없는 노선을 타는 경로일 수 있다. 부동산에서 실제로 묻는 것은
 *   (1) 지금 이 집에서 몇 분인가
 *   (2) 개통되면 얼마나 좋아지는가
 * 이고, 이 둘을 나란히 보여주는 것이 이 기능이다.
 *
 * 여기서 고정하는 것:
 *   - '지금' 경로에는 미개통 노선이 한 개도 섞이지 않는다
 *   - 미개통 노선만 있는 역은 '지금은 갈 수 없음'으로 판정된다
 *   - 이득이 없으면 없다고 말한다 (0분 단축을 '개선'으로 포장하지 않는다)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const lines = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/lines.geojson'), 'utf8'));
const stations = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stations.geojson'), 'utf8'));

// route.js — 그래프·시간모델의 유일한 출처
const rsrc = fs.readFileSync(path.join(ROOT, 'js/route.js'), 'utf8')
  .replace('const RouteFinder', 'globalThis.RouteFinder');
const rctx = vm.createContext({ console, Math, Map, Set, Array, Object, JSON, Infinity });
vm.runInContext(rsrc, rctx);
const RF = rctx.RouteFinder;
RF.buildGraph(lines.features, stations.features);

// route-compare.js — 같은 그래프를 빌려 쓴다
const csrc = fs.readFileSync(path.join(ROOT, 'js/route-compare.js'), 'utf8')
  .replace('const RouteCompare', 'globalThis.RouteCompare');
const cctx = vm.createContext({
  console, Math, Map, Set, Array, Object, JSON, Infinity, RouteFinder: RF,
});
vm.runInContext(csrc, cctx);
const RC = cctx.RouteCompare;
RC.init(RF, stations.features, lines.features);

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
  if (!c.length) throw new Error(`역 없음: ${nameKo}`);
  return c.sort((a, b) =>
    (Math.abs(a.c[0] - lng) + Math.abs(a.c[1] - lat)) -
    (Math.abs(b.c[0] - lng) + Math.abs(b.c[1] - lat)))[0];
}

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${label}${detail ? '  ' + detail : ''}`); }
  else { fail++; console.log(`  ✗ ${label}${detail ? '  ' + detail : ''}`); }
}

const unopenedIn = r => (r.legs || []).filter(l => l.unopened).map(l => l.lineId);

console.log('[경로] openOnly 는 미개통 간선을 건너뛴다');
{
  const a = pick('상봉', 127.08559, 37.59608);
  const b = pick('종합운동장', 127.07372, 37.51106);
  const nowOnly = RF.findRoute(a.id, b.id, { openOnly: true });
  const all = RF.findRoute(a.id, b.id, { transferPenalty: 8 });
  check('지금 경로에 미개통 노선이 없음',
    nowOnly && unopenedIn(nowOnly).length === 0,
    nowOnly && nowOnly.legs.map(l => l.lineId || '도보').join(' → '));
  check('개통 후 경로는 동부선을 씀',
    all && all.legs.some(l => l.lineId === 'dongbu-line'),
    all && all.legs.map(l => l.lineId || '도보').join(' → '));
  check('개통 후가 더 빠름', all && nowOnly && all.minutes < nowOnly.minutes,
    all && nowOnly && `${nowOnly.minutes} → ${all.minutes}분`);
}

console.log('\n[경로] 미개통 노선에만 있는 역은 지금 갈 수 없다');
{
  const san = pick('광산사거리', 127.01975, 37.64502);   // 동부선 단독 역
  const gn = pick('강남', 127.02756, 37.49795);
  check('광산사거리→강남: openOnly 면 경로 없음',
    RF.findRoute(san.id, gn.id, { openOnly: true }) === null);
  check('광산사거리→강남: 전체 그래프에서는 경로 있음',
    RF.findRoute(san.id, gn.id, { transferPenalty: 8 }) !== null);
}

console.log('\n[비교] compareNowFuture 판정');
{
  const cases = [
    ['강남', 127.02756, 37.49795, '원주', 127.92282, 37.31641, 'better'],
    ['부천종합운동장', 126.797, 37.505, '삼성', 127.0631, 37.5089, 'better'],
    ['강남', 127.02756, 37.49795, '역삼', 127.03696, 37.50082, 'same'],
    ['교산', 127.2035, 37.52612, '강남', 127.02756, 37.49795, 'new'],
  ];
  for (const [an, ax, ay, bn, bx, by, want] of cases) {
    const A = pick(an, ax, ay), B = pick(bn, bx, by);
    const c = RC.compareNowFuture(A.id, B.id);
    check(`${an}→${bn} 판정 = ${want}`, c.status === want,
      `${c.status} (${c.now ? c.now.minutes + '분' : '지금 불가'} → ${c.future ? c.future.minutes + '분' : '-'})`);
  }
}

console.log('\n[비교] 숫자가 서로 맞는가');
{
  const A = pick('강남', 127.02756, 37.49795), B = pick('원주', 127.92282, 37.31641);
  const c = RC.compareNowFuture(A.id, B.id);
  check('savedMin = 지금 − 개통 후', c.savedMin === c.now.minutes - c.future.minutes,
    `${c.now.minutes} − ${c.future.minutes} = ${c.savedMin}`);
  check('개통 후 경로가 쓴 미개통 노선을 이름으로 알려줌',
    c.lines.length > 0 && c.lines.every(id => lineName(id) !== id),
    c.lines.map(lineName).join(','));
  const all = RC.findAll(A.id, B.id);
  check('findAll 이 now 를 함께 돌려줌', !!all.now && !!all.time);
  check('now 경로에 미개통 노선이 없음', unopenedIn(all.now).length === 0,
    all.now.legs.map(l => l.lineId || '도보').join(' → '));
}

console.log('\n[표시] nowFutureHtml 문구');
{
  const A = pick('강남', 127.02756, 37.49795), B = pick('원주', 127.92282, 37.31641);
  const hot = RC.nowFutureHtml(RC.compareNowFuture(A.id, B.id));
  check('단축되는 경우 지금·개통 후를 나란히 보여줌',
    hot.includes('지금') && hot.includes('개통 후') && hot.includes('−'));
  check('단축 폭을 분으로 적음', /−\d+분/.test(hot));
  check('어떤 노선 덕분인지 적음', hot.includes('GTX-D'), hot.slice(0, 0) || 'GTX-D');

  const C = pick('강남', 127.02756, 37.49795), D = pick('역삼', 127.03696, 37.50082);
  const flat = RC.nowFutureHtml(RC.compareNowFuture(C.id, D.id));
  check('이득이 없으면 "변화 없음" 이라고 적음', flat.includes('변화 없음'));
  check('이득이 없으면 개통 후 숫자를 중복 표시하지 않음',
    (flat.match(/rc-nf-time/g) || []).length === 1);

  const E = pick('교산', 127.2035, 37.52612), F = pick('강남', 127.02756, 37.49795);
  const nw = RC.nowFutureHtml(RC.compareNowFuture(E.id, F.id));
  check('지금 갈 수 없으면 "갈 수 없음" 이라고 적음', nw.includes('갈 수 없음'));
  check('신규 연결 배지를 붙임', nw.includes('신규 연결'));
}

console.log('\n[표시] 노선 이름 해석·클래스');
{
  const html = RC.nowFutureHtml({
    status: 'better',
    now: { minutes: 30, transfers: 1, legs: [], path: [] },
    future: { minutes: 20, transfers: 0, legs: [], path: [] },
    savedMin: 10,
    lines: ['gtx-d'],
  });
  check('노선 id 를 한글 이름으로 바꿔 보여줌', html.includes('GTX-D'), 'gtx-d → GTX-D');
  check('스타일 클래스가 붙음', html.includes('rc-nf hot'));
  // 사전에 없는 id 라도 화면이 비지 않도록 id 그대로 쓴다
  const unknown = RC.nowFutureHtml({
    status: 'better',
    now: { minutes: 30, transfers: 1, legs: [], path: [] },
    future: { minutes: 20, transfers: 0, legs: [], path: [] },
    savedMin: 10,
    lines: ['no-such-line'],
  });
  check('모르는 노선 id 는 id 그대로 표시', unknown.includes('no-such-line'));
}

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
