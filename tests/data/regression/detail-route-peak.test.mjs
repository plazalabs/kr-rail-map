// 회귀(E-06, 숙제 14): 역 상세 '지금' 분 = 길찾기 기본(출근 배차) '최적' 분.
// 검수 때: 서울역→강남 상세 30분 vs 길찾기 31분, 광운대→선릉 40분 vs 45분 — 상세는 출근 배차, 길찾기 기본은 '지금 시각'(밤엔 평시)이었다.
// 회장 결정(11-18): 갈아탈 때 대기는 모두 출근(7~9시) 배차. 길찾기 기본도 출근, 평시는 고를 때만.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const ROOT = process.env.KR_RAIL_ROOT || process.cwd();
const read = p => readFileSync(join(ROOT, p), 'utf8');
const lines = JSON.parse(read('data/lines.geojson'));
const stations = JSON.parse(read('data/stations.geojson'));
const access = JSON.parse(read('data/access.json'));

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
const dest = id => access.destinations.find(d => d.id === id);
const membersOf = d => [d.station_id, ...(d.member_ids || [])].filter(Boolean);

// 역 상세 표 한 칸(업무지구 = 묶음 안에서 가장 빨리 닿는 역) = 그 묶음 역들로 길찾기 '최적'을 돌린 값 중 가장 작은 값
const PAIRS = [['서울', 'gbd'], ['광운대', 'gbd'], ['의정부', 'gbd'], ['수원', 'gbd'], ['노원', 'cbd'],
  ['홍대입구', 'gbd'], ['잠실', 'ybd'], ['일산', 'cbd'], ['상계', 'ybd'], ['부평', 'gbd']];

test('[R-E06] 역 상세 지금 분 = 길찾기 기본(출근 배차) 최적 분 — 10쌍', () => {
  const bad = [];
  for (const [st, dId] of PAIRS) {
    const sid = by(st), d = dest(dId);
    const i = access.destinations.indexOf(d);
    const detail = access.stations[sid].now[i];
    const mins = membersOf(d).map(m => m === sid ? 0 : RC.findAllOpen(sid, m, { band: 'peak', peakWait: false }).time.minutes);
    const route = Math.min(...mins);
    if (detail !== route) bad.push(`${st}→${dId}: 상세 ${detail}분 / 길찾기 ${route}분`);
  }
  assert.deepEqual(bad, []);
});

test('[R-E06] 길찾기 시간대 기본값은 출근 — 지금 시각(auto)은 고르는 칸으로만', () => {
  const html = read('index.html');
  const sel = html.match(/<select id="route-band"[^>]*>([\s\S]*?)<\/select>/)[1];
  assert.match(sel, /<option value="peak" selected>/, '출근 칸이 기본(selected)');
  assert.match(sel, /<option value="auto">/, '지금 시각은 고를 수 있게 남김');
  const app = read('js/app.js');
  // 고른 값이 없을 때의 기본 = peak
  assert.match(app, /const v = routeBandEl \? routeBandEl\.value : 'peak'/);
  assert.doesNotMatch(html, /기본은 지금 시각/, '안내 문구가 옛 기본(지금 시각)을 말하지 않음');
});

test("[R-E06] 역 상세 각주가 '길찾기와 같은 기준'이라 하지 않는다 — 상세는 한 역→모든 역 계산(allTimesFrom), 길찾기는 findRoute+최적 고르기로 다른 함수", () => {
  const src = read('js/access.js');
  assert.doesNotMatch(src, /길찾기와 같은 기준/);
});
