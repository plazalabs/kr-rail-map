/* 역세권 범위(근사) 계산 검사 — js/station-area.js
 * 실행: node tests/station-area.test.js
 *
 * 브라우저 IIFE 라 vm 샌드박스에 얹고 _debug 의 순수 계산만 검사한다 (modules.test.js 와 같은 방식).
 * 거리 판정은 모듈과 같은 구면 대권거리(R=6371km, coverage.js hav 와 동일)로 한다.
 *   - 범위 경계(꼭짓점·변 중점)가 기준점에서 250m/350m ±1m 안
 *   - 출구 없는 역은 역 좌표 기준으로 대체
 *   - 동명이지만 먼 역을 섞지 않음 (역 ID 단위)
 *   - 노선 필터가 역 점(rail-stations)과 같은 기준(line_id)
 *   - 기준점 원천을 갈아 끼울 수 있음 (승강장 경계 자료 대비)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const STATIONS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stations.geojson'), 'utf8')).features;
const EXITS_FC = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/exits.geojson'), 'utf8'));

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}  ${detail === undefined ? '' : detail}`); }
}

const byStation = new Map();
for (const e of EXITS_FC.features) {
  const k = e.properties.station;
  (byStation.get(k) || byStation.set(k, []).get(k)).push({ no: e.properties.no, c: e.geometry.coordinates });
}
const exitsOf = id => byStation.get(id) || [];

const ctx = {
  console, Math, JSON, Set, Map, Array, Object, String, Number, Float64Array, Uint8Array,
  Infinity, isFinite, isNaN, parseFloat, parseInt, setTimeout: () => 0,
  document: { getElementById: () => null, createElement: () => ({}) },
  StationExits: { isReady: () => true, hasFailed: () => false, exitsOf, geojson: () => EXITS_FC },
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/station-area.js'), 'utf8'), ctx, { filename: 'js/station-area.js' });
const SA = ctx.StationArea, D = SA._debug;
D.setStations(STATIONS);

function polysOf(g) { return g.type === 'Polygon' ? [g.coordinates] : g.coordinates; }
// 꼭짓점·변 중점이 기준점 집합에서 r 만큼 떨어져 있는지 — 최대 오차(m)
function boundaryError(geom, points, r) {
  let wv = 0, wm = 0;
  const dmin = (p) => Math.min(...points.map(q => D.hav(q[0], q[1], p[0], p[1])));
  for (const poly of polysOf(geom)) for (const ring of poly) for (let i = 0; i < ring.length - 1; i++) {
    const v = ring[i], m = [(ring[i][0] + ring[i + 1][0]) / 2, (ring[i][1] + ring[i + 1][1]) / 2];
    wv = Math.max(wv, Math.abs(dmin(v) - r));
    wm = Math.max(wm, Math.abs(dmin(m) - r));
  }
  return [wv, wm];
}
function pointInRing(p, r) {
  let inside = false;
  for (let i = 0, j = r.length - 2; i < r.length - 1; j = i++) {
    const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
    if (((yi > p[1]) !== (yj > p[1])) && (p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function inGeom(p, g) { return polysOf(g).some(poly => pointInRing(p, poly[0]) && !poly.slice(1).some(h => pointInRing(p, h))); }
const isClosed = ring => ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];

console.log('\n[기준] 반경·줌');
check('1차 250m / 2차 350m', SA.RADII.length === 2 && SA.RADII[0] === 250 && SA.RADII[1] === 350, JSON.stringify(SA.RADII));
check('표시 시작 줌 14', SA.MINZOOM === 14);

console.log('\n[원 하나] 역 좌표 기준 (출구 없는 역의 방식)');
{
  const a = D.buildArea({ kind: 'center', points: [[127.0, 37.5]] });
  for (const r of [250, 350]) {
    const g = a.geoms[r];
    check(`${r}m: Polygon 하나, 닫힌 고리`, g && g.type === 'Polygon' && g.coordinates.length === 1 && isClosed(g.coordinates[0]));
    const [ev, em] = boundaryError(g, [[127.0, 37.5]], r);
    check(`${r}m: 꼭짓점 ±1m`, ev <= 1, ev.toFixed(3));
    check(`${r}m: 변 중점 ±1m`, em <= 1, em.toFixed(3));
    // 면적 ≈ πr² (국소 평면, 1% 이내)
    const kx = 6371000 * Math.PI / 180 * Math.cos(37.5 * Math.PI / 180), ky = 6371000 * Math.PI / 180;
    const ring = g.coordinates[0].map(p => [(p[0] - 127) * kx, (p[1] - 37.5) * ky]);
    let s = 0; for (let i = 0; i < ring.length - 1; i++) s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    const area = Math.abs(s / 2), want = Math.PI * r * r;
    check(`${r}m: 면적 ≈ πr² (1% 이내)`, Math.abs(area - want) / want < 0.01, `${area.toFixed(0)} vs ${want.toFixed(0)}`);
  }
}

console.log('\n[합집합] 떨어진 두 기준점');
{
  const pts = [[127.0, 37.5], [127.0, 37.5 + 2000 / 111195]];   // 약 2km
  const a = D.buildArea({ kind: 'exit', points: pts });
  check('2km 떨어진 두 점 → MultiPolygon 2개', a.geoms[250].type === 'MultiPolygon' && a.geoms[250].coordinates.length === 2);
  const [ev, em] = boundaryError(a.geoms[250], pts, 250);
  check('조각마다 꼭짓점·변 중점 ±1m', ev <= 1 && em <= 1, `${ev.toFixed(3)} / ${em.toFixed(3)}`);
  const near = [[127.0, 37.5], [127.0, 37.5 + 200 / 111195]];   // 200m — 겹침
  const b = D.buildArea({ kind: 'exit', points: near });
  check('200m 떨어진 두 점 → 하나로 합쳐진 Polygon', b.geoms[250].type === 'Polygon');
  const [ev2, em2] = boundaryError(b.geoms[250], near, 250);
  check('합쳐진 경계(교점 모서리 포함) ±1m', ev2 <= 1 && em2 <= 1, `${ev2.toFixed(3)} / ${em2.toFixed(3)}`);
}

console.log('\n[실데이터] 전 역 — 방식별 역 수와 경계 오차');
{
  let nExit = 0, nCenter = 0, worstV = 0, worstM = 0, worstName = '', exitOutside = 0, exitTotal = 0;
  const t0 = Date.now();
  for (const s of STATIONS) {
    const anc = D.approxAnchors(s, exitsOf);
    if (anc.kind === 'exit') nExit++; else nCenter++;
    const a = D.buildArea(anc);
    for (const r of [250, 350]) {
      const [ev, em] = boundaryError(a.geoms[r], anc.points, r);
      if (ev > worstV) worstV = ev;
      if (em > worstM) { worstM = em; worstName = s.properties.name_ko + ' ' + r + 'm'; }
    }
    for (const p of anc.points) { exitTotal++; if (!inGeom(p, a.geoms[250])) exitOutside++; }
  }
  check('출구 기준 역 938곳', nExit === 938, nExit);
  check('역 좌표 기준 역 308곳', nCenter === 308, nCenter);
  check('전 역 꼭짓점 오차 ±1m', worstV <= 1, worstV.toFixed(3) + 'm');
  check('전 역 변 중점 오차 ±1m', worstM <= 1, worstM.toFixed(3) + 'm (' + worstName + ')');
  check('모든 기준점(출구·역 좌표)이 자기 1차 범위 안', exitOutside === 0, `${exitOutside}/${exitTotal}`);
  console.log(`    (전 역 ${STATIONS.length}곳 계산 ${Date.now() - t0}ms)`);
}

console.log('\n[대체] 출구 없는 역');
{
  const s = STATIONS.find(x => !exitsOf(x.properties.id).length);
  const anc = D.approxAnchors(s, exitsOf);
  check('kind=center, 기준점 = 역 좌표 하나', anc.kind === 'center' && anc.points.length === 1 &&
    anc.points[0][0] === s.geometry.coordinates[0] && anc.points[0][1] === s.geometry.coordinates[1], s.properties.name_ko);
  const f = D.featuresFor([s]);
  check('feature 2개(250·350) 모두 kind=center', f.length === 2 && f.every(x => x.properties.kind === 'center'));
  const withExit = STATIONS.find(x => exitsOf(x.properties.id).length >= 3);
  const anc2 = D.approxAnchors(withExit, exitsOf);
  check('출구 있는 역은 kind=exit, 기준점 = 출구 수', anc2.kind === 'exit' && anc2.points.length === exitsOf(withExit.properties.id).length);
}

console.log('\n[동명역] 이름으로 섞지 않는다');
{
  const sicheong = STATIONS.filter(s => s.properties.name_ko === '시청');
  const f = D.featuresFor(sicheong);
  check('시청 3곳 → feature 6개, 역 ID 3개', f.length === 6 && new Set(f.map(x => x.properties.sid)).size === 3);
  let ok = true;
  for (const x of f) {
    const own = STATIONS.find(s => s.properties.id === x.properties.sid);
    const anc = D.approxAnchors(own, exitsOf);
    const [ev] = boundaryError(x.geometry, anc.points, x.properties.r);
    if (ev > 1) ok = false;
    // 다른 시청 좌표는 이 범위 안에 없어야 한다
    for (const o of sicheong) if (o !== own && inGeom(o.geometry.coordinates, x.geometry)) ok = false;
  }
  check('각 범위는 자기 역 기준점으로만 만들어짐', ok);
}

console.log('\n[노선 필터] 역 점과 같은 기준(line_id)');
{
  const appJs = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  check('app.js 역 점 필터가 line_id 기준', /\['in', \['get', 'line_id'\]/.test(appJs));
  check('app.js updateFilters 가 StationArea.setLines 를 부름', /StationArea\.setLines\(ids\)/.test(appJs));
  check('app.js restoreCustomLayers 가 StationArea.restore 를 부름', /StationArea\.restore\(\)/.test(appJs));
  const s = STATIONS.find(x => x.properties.name_ko === '강남' && (x.properties.lines || []).includes('seoul-subway-line-2'));
  const f = D.featuresFor([s]);
  check('feature 가 역의 line_id 를 그대로 가짐', f.every(x => x.properties.line_id === s.properties.line_id), s.properties.line_id);
  // 필터 식을 직접 평가 (all / == / in / get / literal 만 쓰인다)
  const ev = (e, ft) => {
    if (e === true) return true;
    switch (e[0]) {
      case 'all': return e.slice(1).every(x => ev(x, ft));
      case '==': return ev(e[1], ft) === ev(e[2], ft);
      case 'in': return ev(e[2], ft).includes(ev(e[1], ft));
      case 'get': return ft.properties[e[1]];
      case 'literal': return e[1];
      default: return e;
    }
  };
  D.setLinesRaw(['seoul-subway-line-9']);
  check('그 노선이 꺼지면 걸러짐', f.every(x => !ev(D.filterFor(x.properties.r), x)));
  D.setLinesRaw([s.properties.line_id]);
  check('그 노선이 켜지면 1차·2차 각각 하나씩 통과',
    f.filter(x => ev(D.filterFor(250), x)).length === 1 && f.filter(x => ev(D.filterFor(350), x)).length === 1);
  D.setLinesRaw(null);
}

console.log('\n[교체 구조] 기준점 원천 갈아 끼우기');
{
  const s = STATIONS.find(x => x.properties.name_ko === '강남' && (x.properties.lines || []).includes('seoul-subway-line-2'));
  // (1) 점 기반 다른 원천
  SA.setAnchorSource(st => ({ kind: 'platform', points: [st.geometry.coordinates] }));
  const f1 = D.featuresFor([s]);
  check('setAnchorSource → 새 원천으로 생성 (kind=platform)', f1.length === 2 && f1.every(x => x.properties.kind === 'platform'));
  SA.setAnchorSource(null);
  const f2 = D.featuresFor([s]);
  check('setAnchorSource(null) → 근사 원천으로 복귀 (kind=exit)', f2.every(x => x.properties.kind === 'exit'));
  // (2) 폴리곤 기준 거리장: 100m×60m 직사각형 '승강장'에서 250m/350m
  const c = s.geometry.coordinates;
  const rect = { kind: 'platform', points: [c], field: (fr) => ({
    bbox: [-50, -30, 50, 30],
    value: (x, y) => { const dx = Math.max(Math.abs(x) - 50, 0), dy = Math.max(Math.abs(y) - 30, 0); return Math.hypot(dx, dy); },
  }) };
  const a = D.buildArea(rect, null, { cell: 5 });
  const fr = D.frame(c[0], c[1]);
  let worst = 0;
  for (const r of [250, 350]) for (const poly of polysOf(a.geoms[r])) for (const ring of poly) for (const p of ring) {
    const q = fr.toXY(p);
    const d = Math.hypot(Math.max(Math.abs(q[0]) - 50, 0), Math.max(Math.abs(q[1]) - 30, 0));
    worst = Math.max(worst, Math.abs(d - r));
  }
  check('폴리곤 거리장으로도 같은 생성부가 동작 (경계 ±1m)', worst <= 1, worst.toFixed(3) + 'm');
}

console.log('\n[역 패널] 1차 안 출구·다른 역 수');
{
  const s = STATIONS.find(x => x.properties.name_ko === '강남' && (x.properties.lines || []).includes('seoul-subway-line-2'));
  const m = SA.summaryOf(s.properties.id);
  check('강남: 출구 기준, 자기 출구는 모두 1차 안', m.kind === 'exit' && m.exits >= m.anchors, JSON.stringify(m));
  const html = SA.panelHtml(s.properties.id);
  check('패널 문구에 근사 고지', /근사/.test(html) && /승강장 경계/.test(html));
}

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
