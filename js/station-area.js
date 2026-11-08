/* 역세권 범위 (근사) — 1차 250m / 2차 350m
 *
 * 기준: 서울시 『안심주택의 역세권 범위』(2025.08)의 거리 기준(기본 250m, 심의 시 350m).
 * 단, 공식 기준점은 '승강장 경계'인데 그 도형 자료(행안부 지하철역사)는 신청형이라
 * 아직 없다. 그래서 지금은 근사로 그린다:
 *   - 출구가 있는 역: 출구마다 원을 그려 합집합
 *   - 출구가 없는 역: 역 좌표 하나에서 원
 * 범례에 '근사'임을 반드시 밝힌다.
 *
 * 구조 — 나중에 승강장 경계가 오면 ①만 갈아 끼우면 된다.
 *   ① 기준점 원천 anchorSource(station) → { kind, points } 또는 { kind, field }
 *        지금은 approxAnchors (출구/역 좌표). setAnchorSource(fn) 로 교체.
 *   ② 거리장 field(x, y) → 가장 가까운 기준까지의 거리(m).
 *        점 기준이면 pointField. 폴리곤 기준이면 '폴리곤까지 거리' 함수를 원천이 직접 준다.
 *   ③ 범위 생성 buildArea → 거리장의 250·350 등치선(marching squares)을 Polygon/MultiPolygon 으로.
 *        기준이 무엇이든 '거리 = r 인 선' 이므로 이 부분은 바뀌지 않는다.
 *   ④ 지도 레이어·범례·토글 — 원천과 무관.
 *
 * 환승역 묶기: 이름으로 묶지 않는다(동명역 함정). 역 데이터에서 환승역은 이미 역 ID 하나
 * (lines 배열에 여러 노선)이고, 같은 이름·300m 이내의 별도 역은 0쌍이다(2026-11-07 실측).
 * 그래서 범위는 역 ID 단위로 만든다.
 */
(function () {
  'use strict';

  const R_EARTH = 6371000;               // coverage.js hav() 와 같은 구면 반지름 (m)
  const RAD = Math.PI / 180;
  const RADII = [250, 350];              // 1차, 2차 (m)
  const MINZOOM = 14;
  const CELL_M = 10;                     // 격자 간격 (m). 꼭짓점은 원 위로 보정·교점 삽입하므로
                                         // 10m 격자로도 경계 오차 0.62m 이하 (전 역 실측)
  const SIMPLIFY_M = 0.3;                // 단순화 허용 오차 (m)
  const COLORS = { 250: '#e53935', 350: '#1e63d6' };
  const SRC = 'station-area';
  const LAYERS = ['station-area-fill', 'station-area-r2', 'station-area-r1',
    'station-area-label-r2', 'station-area-label-r1'];

  let map = null, ST = [], byId = new Map();
  let on = false, lineIds = null, legendEl = null, toggleEl = null, retry = 0;
  const cache = new Map();               // stationId -> { kind, n, geoms: {250, 350} }

  function hav(lng1, lat1, lng2, lat2) {   // m
    const dLat = (lat2 - lat1) * RAD, dLon = (lng2 - lng1) * RAD;
    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2;
    return R_EARTH * 2 * Math.asin(Math.sqrt(h));
  }

  /* ---------- ① 기준점 원천 ---------- */
  // 근사: 출구가 있으면 출구 좌표들, 없으면 역 좌표 하나.
  // exitsOf(stationId) → [{ no, c: [lng, lat] }]
  function approxAnchors(station, exitsOf) {
    const ex = exitsOf ? (exitsOf(station.properties.id) || []) : [];
    if (ex.length) return { kind: 'exit', points: ex.map(e => e.c) };
    return { kind: 'center', points: [station.geometry.coordinates] };
  }
  let anchorSource = approxAnchors;
  function setAnchorSource(fn) { anchorSource = fn || approxAnchors; cache.clear(); }

  /* ---------- 로컬 평면 (역 근처 수백 m 에서는 등장방형으로 충분) ---------- */
  function frame(lng0, lat0) {
    const kx = R_EARTH * RAD * Math.cos(lat0 * RAD), ky = R_EARTH * RAD;
    return {
      toXY: p => [(p[0] - lng0) * kx, (p[1] - lat0) * ky],
      toLL: q => [lng0 + q[0] / kx, lat0 + q[1] / ky],
    };
  }

  /* ---------- ② 거리장 ---------- */
  // 점 집합까지의 최소 거리. snap 은 등치선 꼭짓점을 가장 가까운 점의 원 위로 정확히 옮긴다.
  function pointField(xy) {
    function nearest(x, y) {
      let best = -1, bd = Infinity;
      for (let i = 0; i < xy.length; i++) {
        const dx = x - xy[i][0], dy = y - xy[i][1], d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = i; }
      }
      return [best, Math.sqrt(bd)];
    }
    return {
      bbox: xy.reduce((b, p) => [Math.min(b[0], p[0]), Math.min(b[1], p[1]),
        Math.max(b[2], p[0]), Math.max(b[3], p[1])], [Infinity, Infinity, -Infinity, -Infinity]),
      value: (x, y) => {   // 격자 전체에서 불리므로 배열을 만들지 않는다
        let bd = Infinity;
        for (let i = 0; i < xy.length; i++) {
          const dx = x - xy[i][0], dy = y - xy[i][1], d = dx * dx + dy * dy;
          if (d < bd) bd = d;
        }
        return Math.sqrt(bd);
      },
      // 고리 꼭짓점을 원 위로 옮기고, 이웃 꼭짓점이 서로 다른 원에 붙어 있으면
      // 두 원의 교점(합집합 경계의 뾰족한 모서리)을 사이에 넣는다. 격자만으로는
      // 이 모서리를 깎아 먹어 변 중간이 1~3m 바깥으로 나갔다(실측).
      refine: (ring, level) => {
        const n = ring.length - 1;           // 마지막 = 첫 점
        const sn = [], id = [];
        for (let k = 0; k < n; k++) {
          const [i, d] = nearest(ring[k][0], ring[k][1]);
          const c = xy[i];
          sn.push(d > 0 ? [c[0] + (ring[k][0] - c[0]) * level / d, c[1] + (ring[k][1] - c[1]) * level / d] : ring[k]);
          id.push(i);
        }
        const out = [];
        for (let k = 0; k < n; k++) {
          const k2 = (k + 1) % n;
          out.push(sn[k]);
          if (id[k] === id[k2]) continue;
          const A = xy[id[k]], B = xy[id[k2]];
          const dx = B[0] - A[0], dy = B[1] - A[1], dd = Math.hypot(dx, dy);
          if (!(dd > 0) || dd >= 2 * level) continue;
          const hl = Math.sqrt(level * level - dd * dd / 4);
          const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2, ux = -dy / dd, uy = dx / dd;
          const P = [(sn[k][0] + sn[k2][0]) / 2, (sn[k][1] + sn[k2][1]) / 2];
          const c1 = [mx + ux * hl, my + uy * hl], c2 = [mx - ux * hl, my - uy * hl];
          const I = Math.hypot(c1[0] - P[0], c1[1] - P[1]) <= Math.hypot(c2[0] - P[0], c2[1] - P[1]) ? c1 : c2;
          // 다른 원 안쪽에 묻힌 교점이면 경계가 아니다 / 두 꼭짓점에서 너무 멀면 다른 모서리다
          const seg = Math.hypot(sn[k2][0] - sn[k][0], sn[k2][1] - sn[k][1]);
          if (nearest(I[0], I[1])[1] < level - 1e-6) continue;
          if (Math.hypot(I[0] - P[0], I[1] - P[1]) > seg + 1e-9) continue;
          out.push(I);
        }
        out.push(out[0].slice());
        return out;
      },
    };
  }

  /* ---------- ③ 등치선 → 고리 ---------- */
  // 격자 값 v[j][i] 에서 level 등치선을 닫힌 고리들로 뽑는다 (marching squares).
  function contourRings(v, nx, ny, x0, y0, h, level) {
    const pts = new Map();               // edgeKey -> [x, y]
    const adj = new Map();               // edgeKey -> [edgeKey, ...]
    const val = (i, j) => v[j * (nx + 1) + i] - level;
    function edgePoint(key, i1, j1, i2, j2) {
      if (pts.has(key)) return key;
      const a = val(i1, j1), b = val(i2, j2);
      const t = a / (a - b);
      pts.set(key, [x0 + (i1 + (i2 - i1) * t) * h, y0 + (j1 + (j2 - j1) * t) * h]);
      return key;
    }
    function link(k1, k2) {
      (adj.get(k1) || adj.set(k1, []).get(k1)).push(k2);
      (adj.get(k2) || adj.set(k2, []).get(k2)).push(k1);
    }
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const a = val(i, j), b = val(i + 1, j), c = val(i + 1, j + 1), d = val(i, j + 1);
        const idx = (a < 0 ? 1 : 0) | (b < 0 ? 2 : 0) | (c < 0 ? 4 : 0) | (d < 0 ? 8 : 0);
        if (idx === 0 || idx === 15) continue;
        const B = () => edgePoint('h' + i + ',' + j, i, j, i + 1, j);         // 아래
        const R = () => edgePoint('v' + (i + 1) + ',' + j, i + 1, j, i + 1, j + 1); // 오른쪽
        const T = () => edgePoint('h' + i + ',' + (j + 1), i, j + 1, i + 1, j + 1); // 위
        const L = () => edgePoint('v' + i + ',' + j, i, j, i, j + 1);         // 왼쪽
        switch (idx) {
          case 1: case 14: link(L(), B()); break;
          case 2: case 13: link(B(), R()); break;
          case 3: case 12: link(L(), R()); break;
          case 4: case 11: link(R(), T()); break;
          case 6: case 9: link(B(), T()); break;
          case 7: case 8: link(L(), T()); break;
          case 5: case 10: {
            // 안장점: 칸 중심값으로 갈래를 정한다
            const centerIn = (a + b + c + d) / 4 < 0;
            const isolateBD = (idx === 5) === centerIn;   // a·c 안쪽+중심 안쪽 → b·d 를 떼어냄
            if (isolateBD) { link(B(), R()); link(L(), T()); }
            else { link(L(), B()); link(R(), T()); }
            break;
          }
        }
      }
    }
    // 고리 잇기
    const used = new Set(), rings = [];
    for (const start of adj.keys()) {
      if (used.has(start)) continue;
      const ring = [];
      let prev = null, cur = start;
      while (cur && !used.has(cur)) {
        used.add(cur); ring.push(pts.get(cur));
        const nb = adj.get(cur);
        const next = nb.find(k => k !== prev && !used.has(k));
        prev = cur; cur = next;
      }
      if (ring.length >= 3) { ring.push(ring[0].slice()); rings.push(ring); }
    }
    return rings;
  }

  function ringArea(r) {   // 부호 있는 면적 (반시계 +)
    let s = 0;
    for (let i = 0; i < r.length - 1; i++) s += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
    return s / 2;
  }
  function pointInRing(p, r) {
    let inside = false;
    for (let i = 0, j = r.length - 2; i < r.length - 1; j = i++) {
      const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
      if (((yi > p[1]) !== (yj > p[1])) && (p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  // 닫힌 고리 Douglas-Peucker
  function simplifyRing(r, tol) {
    if (r.length <= 5) return r;
    const pts = r.slice(0, -1), n = pts.length;
    // 서로 가장 먼 두 점으로 고리를 둘로 나눠 각각 단순화
    let far = 0, fd = -1;
    for (let i = 1; i < n; i++) {
      const d = (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2;
      if (d > fd) { fd = d; far = i; }
    }
    const keep = new Uint8Array(n); keep[0] = 1; keep[far] = 1;
    function dp(a, b) {   // a→b (b 는 a 보다 뒤, 고리 순환 인덱스)
      const len = (b - a + n) % n;
      if (len < 2) return;
      const A = pts[a], B = pts[b % n];
      const dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy || 1e-12;
      let mi = -1, md = -1;
      for (let k = 1; k < len; k++) {
        const P = pts[(a + k) % n];
        const t = Math.max(0, Math.min(1, ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / L2));
        const ex = A[0] + t * dx - P[0], ey = A[1] + t * dy - P[1], d = ex * ex + ey * ey;
        if (d > md) { md = d; mi = (a + k) % n; }
      }
      if (md > tol * tol) { keep[mi] = 1; dp(a, mi < a ? mi + n : mi); dp(mi, b); }
    }
    dp(0, far); dp(far, n);
    const out = [];
    for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i]);
    out.push(out[0].slice());
    return out.length >= 4 ? out : r;
  }

  // 고리들을 바깥/구멍으로 정리해 GeoJSON 기하로
  function ringsToGeometry(rings, toLL) {
    if (!rings.length) return null;
    const depth = rings.map((r, i) => rings.reduce((n, o, k) => n + (k !== i && pointInRing(r[0], o) ? 1 : 0), 0));
    const polys = [];
    rings.forEach((r, i) => {
      if (depth[i] % 2) return;
      const outer = ringArea(r) < 0 ? r.slice().reverse() : r;   // 바깥 = 반시계
      const holes = rings.filter((h, k) => depth[k] === depth[i] + 1 && pointInRing(h[0], r))
        .map(h => ringArea(h) > 0 ? h.slice().reverse() : h);     // 구멍 = 시계
      polys.push([outer, ...holes].map(x => x.map(toLL)));
    });
    return polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] }
      : { type: 'MultiPolygon', coordinates: polys };
  }

  // 기준(anchors) → { kind, n, geoms: { r: Geometry } }
  function buildArea(anchors, radii, opts) {
    radii = radii || RADII;
    const h = (opts && opts.cell) || CELL_M;
    const tol = opts && opts.simplify != null ? opts.simplify : SIMPLIFY_M;
    const pts = anchors.points || [];
    const o = pts.length ? pts[0] : (anchors.origin || [0, 0]);
    const fr = frame(o[0], o[1]);
    const field = anchors.field ? anchors.field(fr) : pointField(pts.map(fr.toXY));
    const maxR = Math.max(...radii);
    const pad = maxR + 3 * h;
    const bx = field.bbox;
    const x0 = bx[0] - pad, y0 = bx[1] - pad;
    const nx = Math.ceil((bx[2] + pad - x0) / h), ny = Math.ceil((bx[3] + pad - y0) / h);
    const v = new Float64Array((nx + 1) * (ny + 1));
    for (let j = 0; j <= ny; j++) {
      const y = y0 + j * h;
      for (let i = 0; i <= nx; i++) v[j * (nx + 1) + i] = field.value(x0 + i * h, y);
    }
    const geoms = {};
    for (const r of radii) {
      let rings = contourRings(v, nx, ny, x0, y0, h, r);
      if (field.refine) rings = rings.map(ring => field.refine(ring, r));
      if (tol > 0) rings = rings.map(ring => simplifyRing(ring, tol));
      geoms[r] = ringsToGeometry(rings, fr.toLL);
    }
    return { kind: anchors.kind, n: pts.length, geoms };
  }

  /* ---------- 역 단위 계산 + 캐시 ---------- */
  function exitsReady() { return typeof StationExits !== 'undefined' && StationExits.isReady(); }
  function exitsFailed() { return typeof StationExits !== 'undefined' && StationExits.hasFailed && StationExits.hasFailed(); }
  function exitsOf(id) { return exitsReady() ? StationExits.exitsOf(id) : []; }

  function areaOf(station) {
    const id = station.properties.id;
    if (cache.has(id)) return cache.get(id);
    const a = buildArea(anchorSource(station, exitsOf));
    // 출구 자료가 아직 안 왔으면 임시 결과는 저장하지 않는다 (나중에 출구 기준으로 다시)
    if (exitsReady() || exitsFailed()) cache.set(id, a);
    return a;
  }

  // ui.js 의 공용 함수를 쓴다 (없으면 같은 규칙의 대체 — 시험 샌드박스용)
  function linesKeyOf(p) {
    if (typeof UI !== 'undefined' && UI.linesKey) return UI.linesKey(p);
    const ls = (p && Array.isArray(p.lines) && p.lines.length) ? p.lines : (p && p.line_id ? [p.line_id] : []);
    return '|' + ls.filter(Boolean).join('|') + '|';
  }
  function lineFilterOf(ids) {
    if (typeof UI !== 'undefined' && UI.lineFilterExpr) return UI.lineFilterExpr(ids);
    if (!ids.length) return ['==', 1, 0];
    return ['any'].concat(ids.map(id => ['in', '|' + id + '|', ['get', 'lines_key']]));
  }

  function featuresFor(stations) {
    const out = [];
    for (const s of stations) {
      const a = areaOf(s);
      for (const r of RADII) {
        if (!a.geoms[r]) continue;
        out.push({ type: 'Feature', geometry: a.geoms[r],
          properties: { sid: s.properties.id, name: s.properties.name_ko,
            line_id: s.properties.line_id, lines_key: linesKeyOf(s.properties), r, kind: a.kind } });
      }
    }
    return out;
  }

  // 역 패널 한 줄: 1차(250m) 안 출구 수 · 다른 역 수 (coverage.js otherLineStationsIn 과 같은 '반경 안' 판정)
  function summaryOf(stationId) {
    const s = byId.get(stationId);
    if (!s) return null;
    const anc = anchorSource(s, exitsOf);
    const r1 = RADII[0];
    const within = (lng, lat) => anc.points.some(p => hav(p[0], p[1], lng, lat) <= r1);
    let exits = 0;
    if (exitsReady()) {
      for (const f of StationExits.geojson().features) {
        const c = f.geometry.coordinates;
        if (within(c[0], c[1])) exits++;
      }
    }
    let others = 0;
    for (const o of ST) {
      if (o.properties.id === stationId) continue;
      const c = o.geometry.coordinates;
      if (within(c[0], c[1])) others++;
    }
    return { kind: anc.kind, anchors: anc.points.length, exits, others, exitsKnown: exitsReady() };
  }
  function panelHtml(stationId) {
    const m = summaryOf(stationId);
    if (!m) return '';
    const basis = m.kind === 'exit' ? '출구 ' + m.anchors + '개 기준' : '역 좌표 기준';
    return '<div class="sd-sec"><h3>역세권 범위 <span class="sa-approx">근사</span></h3>' +
      '<div class="sd-note">1차(250m) 안 ' + (m.exitsKnown ? '출구 ' + m.exits + '개 · ' : '') +
      '다른 역 ' + m.others + '개</div>' +
      '<div class="sd-note">※ ' + basis + ' 직선거리 근사입니다. 공식 기준점(승강장 경계)과 다를 수 있습니다.</div></div>';
  }

  /* ---------- ④ 지도 레이어 ---------- */
  function lineFilter() {
    // 역 점과 같은 기준: 그 역이 지나는 노선(lines) 중 하나라도 켜져 있으면 보인다
    return lineIds ? lineFilterOf(lineIds) : true;
  }
  function filterFor(r) { return ['all', ['==', ['get', 'r'], r], lineFilter()]; }

  function ensureLayers() {
    if (!map || !map.getStyle()) return false;
    if (!map.getSource(SRC)) map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    const before = map.getLayer('rail-lines') ? 'rail-lines' : undefined;
    const add = (layer) => { if (!map.getLayer(layer.id)) map.addLayer(layer, before); };
    add({ id: 'station-area-fill', type: 'fill', source: SRC, minzoom: MINZOOM, filter: filterFor(250),
      paint: { 'fill-color': COLORS[250], 'fill-opacity': 0.08 } });
    add({ id: 'station-area-r2', type: 'line', source: SRC, minzoom: MINZOOM, filter: filterFor(350),
      paint: { 'line-color': COLORS[350], 'line-width': 1.6, 'line-dasharray': [3, 2] } });
    add({ id: 'station-area-r1', type: 'line', source: SRC, minzoom: MINZOOM, filter: filterFor(250),
      paint: { 'line-color': COLORS[250], 'line-width': 1.8, 'line-dasharray': [3, 2] } });
    // 거리 라벨. 위성 스타일도 glyphs 가 있다(버그 ⑦ 수정, dfd46a8).
    const label = (id, r) => add({ id, type: 'symbol', source: SRC, minzoom: MINZOOM, filter: filterFor(r),
      layout: { 'symbol-placement': 'line', 'symbol-spacing': 260, 'text-field': r + 'm',
        'text-font': ['Noto Sans Regular'], 'text-size': 10.5, 'text-keep-upright': true },
      paint: { 'text-color': COLORS[r], 'text-halo-color': '#ffffff', 'text-halo-width': 1.4 } });
    label('station-area-label-r2', 350);
    label('station-area-label-r1', 250);
    return true;
  }
  function removeLayers() {
    if (!map) return;
    LAYERS.forEach(id => { if (map.getLayer(id)) map.removeLayer(id); });
    if (map.getSource(SRC)) map.removeSource(SRC);
  }
  function applyFilters() {
    if (!map) return;
    const set = (id, r) => { if (map.getLayer(id)) map.setFilter(id, filterFor(r)); };
    set('station-area-fill', 250); set('station-area-r1', 250); set('station-area-label-r1', 250);
    set('station-area-r2', 350); set('station-area-label-r2', 350);
  }

  // 화면 안(+여유) 역만 계산해 그린다. 줌 14 미만이면 그리지 않는다.
  function refresh() {
    if (!on || !map || !map.getSource(SRC)) return;
    if (!exitsReady() && !exitsFailed() && retry < 20) {   // 출구 자료 대기 (최대 약 10초)
      retry++; setTimeout(refresh, 500); return;
    }
    let feats = [];
    if (map.getZoom() >= MINZOOM - 0.5) {
      const b = map.getBounds();
      const padLng = 0.006, padLat = 0.005;   // 약 500m 여유
      const vis = ST.filter(s => {
        const c = s.geometry.coordinates;
        return c[0] >= b.getWest() - padLng && c[0] <= b.getEast() + padLng &&
          c[1] >= b.getSouth() - padLat && c[1] <= b.getNorth() + padLat;
      });
      feats = featuresFor(vis);
    }
    map.getSource(SRC).setData({ type: 'FeatureCollection', features: feats });
    updateLegendHint();
  }

  /* ---------- 범례 카드 ---------- */
  function ensureLegend() {
    if (legendEl) return legendEl;
    legendEl = document.createElement('div');
    legendEl.id = 'sa-legend';
    legendEl.className = 'sa-legend';
    legendEl.setAttribute('role', 'region');
    legendEl.setAttribute('aria-label', '역세권 범위 범례');
    legendEl.hidden = true;
    legendEl.innerHTML =
      '<div class="sa-head"><b>역세권 범위</b><span class="sa-approx">근사</span>' +
      '<button class="sa-close" type="button" aria-label="역세권 범위 끄기" title="끄기">✕</button></div>' +
      '<div class="sa-row"><span class="sa-sw" style="border-color:' + COLORS[250] + '"></span>1차 250m</div>' +
      '<div class="sa-row"><span class="sa-sw" style="border-color:' + COLORS[350] + '"></span>2차 350m</div>' +
      '<p class="sa-note"><b>승강장 경계 기준이 아닌 근사 표시</b>입니다. ' +
      '출구가 있는 역은 출구별 원의 합집합, 없는 역은 역 좌표 기준 원(직선거리)입니다.</p>' +
      '<p class="sa-note">거리 기준: 서울시 『안심주택의 역세권 범위』(2025.08) — 기본 250m, 심의 시 350m.</p>' +
      '<p class="sa-hint" id="sa-hint" hidden>지도를 확대(줌 14 이상)하면 범위가 보입니다.</p>';
    legendEl.querySelector('.sa-close').addEventListener('click', () => setOn(false));
    const host = document.getElementById('map-wrap') || document.body;
    host.appendChild(legendEl);
    return legendEl;
  }
  function updateLegendHint() {
    if (!legendEl || !map) return;
    const hint = legendEl.querySelector('#sa-hint');
    if (hint) hint.hidden = map.getZoom() >= MINZOOM;
  }

  /* ---------- 켜기/끄기 ---------- */
  function setOn(v) {
    on = !!v;
    if (toggleEl) toggleEl.checked = on;
    ensureLegend().hidden = !on;
    if (on) { retry = 0; ensureLayers(); applyFilters(); refresh(); }
    else removeLayers();
  }
  function isOn() { return on; }

  // 스타일 교체(테마·배경) 뒤 app.js restoreCustomLayers 에서 부른다
  function restore() { if (on && ensureLayers()) { applyFilters(); refresh(); } }
  // 노선 체크와 연동 (app.js updateFilters 에서 부른다). 역 점(rail-stations)과 같은 기준.
  function setLines(ids) { lineIds = ids ? ids.slice() : null; applyFilters(); }

  function init(m, stations, opts) {
    map = m; ST = stations || []; byId = new Map(ST.map(s => [s.properties.id, s]));
    toggleEl = (opts && opts.toggle) || document.getElementById('layer-station-area');
    if (toggleEl) toggleEl.addEventListener('change', () => setOn(toggleEl.checked));
    map.on('moveend', () => { if (on) refresh(); });
  }

  window.StationArea = {
    init, setOn, isOn, restore, setLines, refresh, panelHtml, summaryOf, setAnchorSource,
    RADII, MINZOOM,
    // 테스트용 — 지도 없이 계산만 검사한다
    _debug: { hav, approxAnchors, pointField, buildArea, contourRings, simplifyRing, ringsToGeometry,
      featuresFor, filterFor, frame, setStations: (s) => { ST = s; byId = new Map(s.map(x => [x.properties.id, x])); },
      setLinesRaw: (ids) => { lineIds = ids; } },
  };
})();
