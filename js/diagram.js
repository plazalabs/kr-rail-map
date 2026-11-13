/* =========================================================
   개략 노선도(옥타리니어 스키매틱) 렌더러
   - 지리 좌표를 초기값으로 두고, 모든 선분을 0/45/90도에
     맞추도록 반복 완화(relaxation)시킨다.
   - 환승역은 근접 + 동일 역명 기준으로 하나의 노드로 병합.
   - 역명 라벨은 충돌 검사를 거쳐 배치한다.
   사용:
     DiagramMode.init(map, LINES, STATIONS, () => visibleIds)
     DiagramMode.enter() / exit() / isActive()
   ========================================================= */
'use strict';

const DiagramMode = (() => {
  let map = null;
  let LINES = [];
  let STATIONS = [];
  let getVisible = null;
  let active = false;
  let overlay = null;
  let scale = 1;
  let viewW = 0, viewH = 0;

  const PAD = 90;
  const EDGE_LEN = 58;
  const FONT = 11.5;

  function init(m, lines, stations, visibleGetter) {
    map = m || null;
    LINES = lines || [];
    STATIONS = stations || [];
    if (typeof visibleGetter === 'function') {
      getVisible = visibleGetter;
    } else if (typeof visibleLines !== 'undefined' && visibleLines instanceof Set) {
      // app.js 가 인자 없이 초기화한 경우 전역 표시 상태를 그대로 쓴다
      getVisible = () => [...visibleLines];
    } else {
      getVisible = null;
    }
  }
  function isActive() { return active; }

  /* ---------- 좌표 유틸 ---------- */
  function mercY(lat) {
    const s = Math.sin(Math.max(-85, Math.min(85, lat)) * Math.PI / 180);
    return Math.log((1 + s) / (1 - s)) / 2;
  }
  function flatCoords(g) {
    if (!g) return [];
    if (g.type === 'LineString') return g.coordinates;
    if (g.type === 'MultiLineString') return g.coordinates.flat(1);
    return [];
  }
  function planar(coords, lat0) {
    const kx = 111.32 * Math.cos(lat0 * Math.PI / 180);
    const ky = 110.57;
    return coords.map(c => [c[0] * kx, c[1] * ky]);
  }
  function projectAlong(p, pts, cum) {
    let bestD = Infinity, bestAlong = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i][0], ay = pts[i][1];
      const dx = pts[i + 1][0] - ax, dy = pts[i + 1][1] - ay;
      const len2 = dx * dx + dy * dy;
      let t = len2 ? ((p[0] - ax) * dx + (p[1] - ay) * dy) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + t * dx, py = ay + t * dy;
      const d = (p[0] - px) * (p[0] - px) + (p[1] - py) * (p[1] - py);
      if (d < bestD) { bestD = d; bestAlong = cum[i] + t * Math.sqrt(len2); }
    }
    return { along: bestAlong, dist: Math.sqrt(bestD) };
  }

  /* ---------- 환승역 병합 ---------- */
  function buildClusters(usedStations) {
    const byName = new Map();
    usedStations.forEach(s => {
      const n = s.properties.name_ko || s.properties.id;
      if (!byName.has(n)) byName.set(n, []);
      byName.get(n).push(s);
    });
    const clusterOf = new Map();
    const nodes = new Map();
    byName.forEach((list, name) => {
      const groups = [];
      list.forEach(s => {
        const c = s.geometry.coordinates;
        const g = groups.find(grp => {
          const dx = (c[0] - grp.coord[0]) * 88, dy = (c[1] - grp.coord[1]) * 111;
          return Math.hypot(dx, dy) < 0.8;
        });
        if (g) g.items.push(s);
        else groups.push({ coord: c, items: [s] });
      });
      groups.forEach((g, i) => {
        const id = 'n:' + name + (groups.length > 1 ? '#' + i : '');
        // 카드의 출발·도착이 넘길 대표 역 ID — 묶음 안에서 지나는 노선이 가장 많은 역 (같으면 먼저 나온 역)
        const rep = g.items.reduce((a, s) => ((s.properties.lines || []).length > (a.properties.lines || []).length ? s : a));
        nodes.set(id, {
          id, name, coord: g.coord, sid: rep.properties.id,
          lines: new Set(),
        });
        g.items.forEach(s => clusterOf.set(s.properties.id, id));
      });
    });
    return { nodes, clusterOf };
  }

  /* ---------- 네트워크 구성 ---------- */
  function buildNetwork() {
    const visible = getVisible ? new Set(getVisible()) : null;
    const lines = LINES.filter(f => {
      const p = f.properties;
      if (visible && !visible.has(p.id)) return false;
      const st = (p.status || 'open').toLowerCase();
      return st !== 'construction' && st !== 'proposed' && st !== 'planned';
    });

    let latSum = 0, cnt = 0;
    lines.forEach(f => flatCoords(f.geometry).forEach(c => { latSum += c[1]; cnt++; }));
    if (!cnt) return null;
    const lat0 = latSum / cnt;
    const kx = 111.32 * Math.cos(lat0 * Math.PI / 180);
    const ky = 110.57;

    const lineSeqs = [];
    lines.forEach(f => {
      const g = f.geometry || {};
      // 조각마다 (2026-11-14 D8): 예전엔 모든 조각을 한 줄로 이어 붙여 역 순서를 매겨 2호선 같은 순환·지선 노선이 엇갈려 그려졌다
      const rawParts = g.type === 'MultiLineString' ? g.coordinates : g.type === 'LineString' ? [g.coordinates] : [flatCoords(g)];
      const parts = rawParts.filter(c => c && c.length >= 2).map(coords => {
        let pts = coords;
        if (coords.length > 300) {
          const step = Math.ceil(coords.length / 300);
          pts = coords.filter((_, i) => i % step === 0 || i === coords.length - 1);
        }
        const pl = planar(pts, lat0);
        const cum = [0];
        for (let i = 0; i < pl.length - 1; i++) cum.push(cum[i] + Math.hypot(pl[i + 1][0] - pl[i][0], pl[i + 1][1] - pl[i][1]));
        const ring = Math.hypot(pl[0][0] - pl[pl.length - 1][0], pl[0][1] - pl[pl.length - 1][1]) < 0.3 && cum[cum.length - 1] > 3;
        return { pl, cum, ring, mine: [] };
      });
      if (!parts.length) return;
      STATIONS.forEach(s => {
        if (!(s.properties.lines || []).includes(f.properties.id)) return;
        const c = s.geometry.coordinates;
        let best = null;
        parts.forEach(P => { const pr = projectAlong([c[0] * kx, c[1] * ky], P.pl, P.cum); if (!best || pr.dist < best.pr.dist) best = { P, pr }; });
        if (!best || best.pr.dist > 1.6) return;
        best.P.mine.push({ s, along: best.pr.along });
      });
      parts.forEach(P => {
        if (P.mine.length < 2) return;
        P.mine.sort((a, b) => a.along - b.along);
        const st = P.mine.map(m => m.s);
        if (P.ring && st.length > 2) st.push(st[0]);   // 고리는 닫는다
        lineSeqs.push({ line: f, stations: st });
      });
    });
    if (!lineSeqs.length) return null;

    const used = [];
    lineSeqs.forEach(ls => ls.stations.forEach(s => used.push(s)));
    const { nodes, clusterOf } = buildClusters(used);

    const edges = [];
    const edgeKey = new Set();
    lineSeqs.forEach(ls => {
      const lid = ls.line.properties.id;
      const color = ls.line.properties.color || '#8a8f98';
      const seq = [];
      ls.stations.forEach(s => {
        const nid = clusterOf.get(s.properties.id);
        if (!nid) return;
        const node = nodes.get(nid);
        if (node) node.lines.add(lid);
        if (seq[seq.length - 1] !== nid) seq.push(nid);
      });
      ls.nodeIds = seq;
      for (let i = 0; i < seq.length - 1; i++) {
        const k = seq[i] + '>' + seq[i + 1];
        if (edgeKey.has(k)) continue;
        edgeKey.add(k);
        edges.push({ a: seq[i], b: seq[i + 1], lineId: lid, color });
      }
    });

    const arr = [...nodes.values()];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    arr.forEach(n => {
      // 메르카토르는 x·y 를 같은 단위(라디안)로 맞춰야 종횡비가 유지된다
      const c = magnify(n.coord);
      n.mx = c[0] * Math.PI / 180;
      n.my = -mercY(c[1]);
      minX = Math.min(minX, n.mx); maxX = Math.max(maxX, n.mx);
      minY = Math.min(minY, n.my); maxY = Math.max(maxY, n.my);
    });
    const spanX = Math.max(maxX - minX, 1e-6);
    const spanY = Math.max(maxY - minY, 1e-6);
    // 예전 1900×1500 은 간선 길이(EDGE_LEN 58px)에 비해 좁아 수도권 역이 포개졌다 (2026-11-11: 6px 안 겹침 228쌍 → 0)
    const s = Math.min(4400 / spanX, 3500 / spanY);
    arr.forEach(n => {
      n.x = (n.mx - minX) * s + PAD;
      n.y = (n.my - minY) * s + PAD;
      n.ax = n.x; n.ay = n.y;
      n.deg = 0;
    });
    edges.forEach(e => {
      const a = nodes.get(e.a), b = nodes.get(e.b);
      if (a) a.deg++;
      if (b) b.deg++;
    });

    return { nodes: arr, nodeMap: nodes, edges, lines: lineSeqs };
  }

  /* ---------- 돋보기 (역이 몰린 도시를 넓혀 그린다) ----------
   * 전국을 한 장에 맞추면 수도권(약 60km 안에 역 수백 개)이 몇백 px 에 몰려 역이 서로 겹친다.
   * 도시마다 반경 R(km) 안을 Sarkar–Brown 돋보기 g(t) = (m+1)t / (mt+1) 로 넓힌다.
   * g(1) = 1 이라 반경 밖은 그대로고 경계에서 끊기지 않는다. 노선도는 '개략' 이라 거리는 원래도 실제와 다르다. */
  const FOCI = [
    // [경도, 위도, 반경 km, 배율 m]
    [126.98, 37.53, 75, 2.6],   // 수도권
    [129.06, 35.17, 30, 1.6],   // 부산
    [128.60, 35.87, 18, 1.2],   // 대구
    [127.40, 36.35, 15, 1.0],   // 대전
    [126.87, 35.15, 12, 0.9],   // 광주
  ];
  function magnify(coord) {
    let [lng, lat] = coord;
    for (const [flng, flat, R, m] of FOCI) {
      const kx = 111.32 * Math.cos(flat * Math.PI / 180), ky = 110.57;
      const dx = (lng - flng) * kx, dy = (lat - flat) * ky;
      const d = Math.hypot(dx, dy);
      if (d >= R || d === 0) continue;
      const t = d / R, g = (m + 1) * t / (m * t + 1), k = g / t;
      lng = flng + dx * k / kx; lat = flat + dy * k / ky;
    }
    return [lng, lat];
  }

  /* ---------- 완화 ---------- */
  function layout(N) {
    const nodes = N.nodes;
    const idx = new Map(nodes.map((n, i) => [n.id, i]));
    const n = nodes.length;
    const CELL = 34;
    const MIN = 34;

    function repel() {
      const grid = new Map();
      for (let i = 0; i < n; i++) {
        const k = ((nodes[i].x / CELL) | 0) + ',' + ((nodes[i].y / CELL) | 0);
        let b = grid.get(k);
        if (!b) { b = []; grid.set(k, b); }
        b.push(i);
      }
      for (let i = 0; i < n; i++) {
        const a = nodes[i];
        const cx = (a.x / CELL) | 0, cy = (a.y / CELL) | 0;
        for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
          const b = grid.get((cx + ox) + ',' + (cy + oy));
          if (!b) continue;
          for (let bi = 0; bi < b.length; bi++) {
            const j = b[bi];
            if (j <= i) continue;
            const c = nodes[j];
            // 환승역(여러 노선이 겹치는 곳)은 더 넓게 벌린다
            const min = MIN + 5 * ((a.lines.size + c.lines.size) - 2);
            let dx = c.x - a.x, dy = c.y - a.y;
            let d = Math.hypot(dx, dy);
            if (d >= min) continue;
            if (d === 0) { dx = Math.random() - .5; dy = Math.random() - .5; d = 1; }
            const push = (min - d) / d * 0.4;
            a.x -= dx * push; a.y -= dy * push;
            c.x += dx * push; c.y += dy * push;
          }
        }
      }
    }

    const ITER = 320;
    for (let it = 0; it < ITER; it++) {
      const t = it / ITER;
      const wAngle = 0.30 + 0.55 * t;
      const wLen = 0.14;
      const wAnchor = 0.022 * (1 - t * 0.55);

      for (let i = 0; i < n; i++) {
        const a = nodes[i];
        a.x += (a.ax - a.x) * wAnchor;
        a.y += (a.ay - a.y) * wAnchor;
      }

      for (let ei = 0; ei < N.edges.length; ei++) {
        const e = N.edges[ei];
        const a = nodes[idx.get(e.a)], b = nodes[idx.get(e.b)];
        if (!a || !b) continue;
        let dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 0.001;

        const corr = (len - EDGE_LEN) / len * wLen;
        const cdx = dx * corr * .5, cdy = dy * corr * .5;
        a.x += cdx; a.y += cdy; b.x -= cdx; b.y -= cdy;

        const ang = Math.atan2(dy, dx);
        const snap = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4);
        let diff = snap - ang;
        if (diff > Math.PI / 2) diff -= Math.PI;
        if (diff < -Math.PI / 2) diff += Math.PI;
        const rot = diff * wAngle;
        const cosr = Math.cos(rot), sinr = Math.sin(rot);
        const ndx = dx * cosr - dy * sinr;
        const ndy = dx * sinr + dy * cosr;
        const ex = (ndx - dx) * .5, ey = (ndy - dy) * .5;
        a.x -= ex; a.y -= ey; b.x += ex; b.y += ey;
      }

      if (it % 3 === 0) repel();
    }

    function snapAll(w) {
      for (let ei = 0; ei < N.edges.length; ei++) {
        const e = N.edges[ei];
        const a = nodes[idx.get(e.a)], b = nodes[idx.get(e.b)];
        if (!a || !b) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const ang = Math.atan2(dy, dx);
        const snap = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4);
        const diff = snap - ang;
        if (Math.abs(diff) < 1e-4) continue;
        const rot = diff * w;
        const cosr = Math.cos(rot), sinr = Math.sin(rot);
        const ndx = dx * cosr - dy * sinr;
        const ndy = dx * sinr + dy * cosr;
        const ex = (ndx - dx) * .5, ey = (ndy - dy) * .5;
        a.x -= ex; a.y -= ey; b.x += ex; b.y += ey;
      }
    }
    for (let pass = 0; pass < 8; pass++) snapAll(0.92);

    // 마무리: 각도 맞춤과 겹침 밀어내기를 번갈아 한다. 맞춤만 하면 역이 포개지고(예전 243쌍),
    // 밀어내기만 하면 45° 선이 틀어진다. 번갈아 하면 둘 다 대체로 지켜진다.
    for (let pass = 0; pass < 100; pass++) { repel(); snapAll(0.92); }
    // 마지막은 밀어내기 1번 + 맞춤 4번: 겹침 0쌍·45° 맞춤 약 97% (밀어내기로 끝내면 겹침 0 이지만 맞춤 약 60%)
    repel();
    for (let pass = 0; pass < 4; pass++) snapAll(0.92);
    // 마지막 안전망 (2026-11-13): 맞춤이 몇 쌍을 다시 포개는 일이 있다 — 이수역을 합쳐 역이 하나 줄자
    // 한남/마포·당산/문래가 4px 로 겹쳤다. 아주 가까운 쌍(TIGHT px 안)만 정확히 TIGHT 까지 떼어 놓는다.
    // 대상이 몇 쌍뿐이라 45° 맞춤은 거의 그대로다.
    const TIGHT = 12;
    for (let round = 0; round < 6; round++) {
      let moved = 0;
      const grid = new Map();
      for (let i = 0; i < n; i++) {
        const k = ((nodes[i].x / TIGHT) | 0) + ',' + ((nodes[i].y / TIGHT) | 0);
        (grid.get(k) || grid.set(k, []).get(k)).push(i);
      }
      for (let i = 0; i < n; i++) {
        const a = nodes[i], cx = (a.x / TIGHT) | 0, cy = (a.y / TIGHT) | 0;
        for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
          const b = grid.get((cx + ox) + ',' + (cy + oy));
          if (!b) continue;
          for (const j of b) {
            if (j <= i) continue;
            const c = nodes[j];
            let dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy);
            if (d >= TIGHT) continue;
            if (d < 1e-6) { dx = 1; dy = 0; d = 1; }
            const push = (TIGHT - d) / d * 0.5;
            a.x -= dx * push; a.y -= dy * push; c.x += dx * push; c.y += dy * push;
            moved++;
          }
        }
      }
      if (!moved) break;
    }
  }

  /* ---------- SVG ---------- */
  const NS = 'http://www.w3.org/2000/svg';
  function mk(tag, attrs, parent) {
    const el = document.createElementNS(NS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function render(N) {
    const nodes = N.nodes;
    const idx = new Map(nodes.map((n, i) => [n.id, i]));
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(n => {
      minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
      minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
    });
    const offX = PAD - minX + 40, offY = PAD - minY + 40;
    nodes.forEach(n => { n.x += offX; n.y += offY; });
    const W = Math.ceil(maxX - minX + PAD * 2 + 80);
    const H = Math.ceil(maxY - minY + PAD * 2 + 80);

    const cs = getComputedStyle(document.body);
    const bg = cs.getPropertyValue('--surface').trim() || '#f6f7f9';
    const fg = cs.getPropertyValue('--text').trim() || '#16191d';
    const muted = cs.getPropertyValue('--muted').trim() || '#868e96';

    const svg = mk('svg', {
      width: W, height: H, viewBox: `0 0 ${W} ${H}`, xmlns: NS,
      style: 'background:' + bg,
    });
    mk('rect', { x: 0, y: 0, width: W, height: H, fill: bg }, svg);

    const gCasing = mk('g', { fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg);
    const gLines = mk('g', { fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg);
    const gDots = mk('g', {}, svg);
    const gLabels = mk('g', { 'font-family': 'Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif' }, svg);

    N.lines.forEach(ls => {
      const pts = [];
      (ls.nodeIds || []).forEach(nid => {
        const nd = nodes[idx.get(nid)];
        if (nd) pts.push(nd);
      });
      if (pts.length < 2) return;
      const d = 'M' + pts.map(p => p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join('L');
      const lid = ls.line.properties.id;
      mk('path', { d, stroke: bg, 'stroke-width': 13, 'data-line': lid }, gCasing);
      mk('path', { d, stroke: ls.line.properties.color || '#8a8f98', 'stroke-width': 7, opacity: .95, 'data-line': lid, class: 'dg-line' }, gLines);
    });

    nodes.forEach(n => {
      const isTransfer = n.lines.size > 1;
      const g = mk('g', { class: 'dg-station' }, gDots);
      g.dataset.name = n.name;
      if (n.sid) g.dataset.sid = n.sid;
      g.dataset.lines = [...n.lines].join(',');
      // 일반역은 소속 노선 색으로 테두리를 준다
      let ring = '#5b626b';
      if (!isTransfer) {
        const lid = [...n.lines][0];
        const lf = N.lines.find(x => x.line.properties.id === lid);
        if (lf) ring = lf.line.properties.color || ring;
      }
      mk('circle', {
        class: 'dg-dot', cx: n.x, cy: n.y,
        r: isTransfer ? 6.4 : 4.6, fill: '#ffffff',
        stroke: isTransfer ? fg : ring,
        'stroke-width': isTransfer ? 2.6 : 2.2,
      }, g);
      if (isTransfer) mk('circle', { cx: n.x, cy: n.y, r: 2.1, fill: fg }, g);
    });

    labelCtx = { nodes, gLabels, fg, muted };
    placeLabels(1);

    return { svg, W, H, nodeCount: nodes.length, edgeCount: N.edges.length, lineCount: new Set(N.lines.map(ls => ls.line.properties.id)).size };
  }

  /* ---------- 라벨 배치 (확대 수준에 따라 다시 계산) ---------- */
  let labelCtx = null;
  let labelTimer = 0;
  let focusLid = null;   // D8: 고른 노선 (null = 전체)

  function placeLabels(scale) {
    if (!labelCtx) return;
    const { nodes, gLabels, fg, muted } = labelCtx;
    while (gLabels.firstChild) gLabels.removeChild(gLabels.firstChild);

    // 화면에서 일정한 크기로 보이도록 역수를 곱한다
    const dense = scale < 0.52;
    const font = Math.max(6.5, Math.min(30, (focusLid ? 10 : dense ? 9.5 : 11.5) / scale));
    const cell = Math.max(3, 6 / scale);

    const occ = new Set();
    function fits(x, y, w, h) {
      const x0 = Math.floor(x / cell), x1 = Math.floor((x + w) / cell);
      const y0 = Math.floor(y / cell), y1 = Math.floor((y + h) / cell);
      for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) if (occ.has(i + ',' + j)) return false;
      for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) occ.add(i + ',' + j);
      return true;
    }
    nodes.forEach(n => {
      if (focusLid && !n.lines.has(focusLid)) return;   // 흐린 역 자리는 비워 둔다 — 고른 노선 이름이 더 들어가게
      const s = Math.max(7, 4.5 / scale);
      fits(n.x - s, n.y - s, s * 2, s * 2);
    });

    const ordered = [...nodes].sort((a, b) => (focusLid ? (b.lines.has(focusLid) - a.lines.has(focusLid)) : 0) || (b.lines.size - a.lines.size) || (b.deg - a.deg));
    let placed = 0;
    ordered.forEach(n => {
      const isTransfer = n.lines.size > 1;
      const onFocus = !!(focusLid && n.lines.has(focusLid));
      if (focusLid && !onFocus) return;          // 노선을 골랐으면 그 노선 역 이름만
      if (dense && !isTransfer && !onFocus) return;
      const w = n.name.length * font * 0.98 + 4;
      const h = font + 2;
      const gap = Math.max(7, 6 / scale);
      const cands = [
        [gap + 2 / scale, -font * 0.35, 'start'],
        [-gap - 2 / scale - w, -font * 0.35, 'start'],
        [-w / 2, -gap - font * 0.6, 'start'],
        [-w / 2, gap + font * 0.9, 'start'],
        [gap, -gap - font * 0.6, 'start'],
        [gap, gap + font * 0.9, 'start'],
        [-gap - w, -gap - font * 0.6, 'start'],
        [-gap - w, gap + font * 0.9, 'start'],
      ];
      for (let ci = 0; ci < cands.length; ci++) {
        const x = n.x + cands[ci][0], y = n.y + cands[ci][1];
        if (!fits(x, y, w, h)) continue;
        const t = mk('text', {
          x, y: y + font * 0.82, 'font-size': font,
          fill: isTransfer ? fg : muted,
          'font-weight': isTransfer ? 600 : 400,
          'text-anchor': cands[ci][2],
        }, gLabels);
        t.textContent = n.name;
        placed++;
        break;
      }
    });
    return placed;
  }

  function scheduleLabels() {
    clearTimeout(labelTimer);
    labelTimer = setTimeout(() => placeLabels(scale), 90);
  }

  /* ---------- 오버레이 ---------- */
  function enter() {
    if (active) return true;
    if (!LINES.length || !STATIONS.length) {
      if (window.UI) UI.setStatus('노선 데이터를 아직 불러오지 못했습니다.');
      return false;
    }
    const host = document.getElementById('map-wrap');
    if (!host) return false;

    overlay = document.createElement('div');
    overlay.id = 'diagram-overlay';

    const bar = document.createElement('div');
    bar.className = 'dg-bar';
    bar.innerHTML =
      '<span class="dg-title">개략 노선도</span>' +
      '<span class="dg-hint">계산 중…</span>' +
      '<span class="dg-spacer"></span>' +
      '<button id="dg-zoom-out" aria-label="축소">−</button>' +
      '<button id="dg-zoom-in" aria-label="확대">＋</button>' +
      '<label class="dg-pick-l"><span class="sr-only">노선 고르기</span><select id="dg-pick" aria-label="노선 고르기 — 고른 노선만 진하게"><option value="">전체 노선</option></select></label>' +
      '<button id="dg-fit">화면 맞춤</button>' +
      '<button id="dg-save">PNG</button>' +
      '<button id="dg-close">닫기</button>';

    const scroll = document.createElement('div');
    scroll.className = 'dg-scroll';

    const legend = document.createElement('div');
    legend.className = 'dg-legend';
    legend.innerHTML = '<span><i style="background:#16191d"></i>환승역</span>' +
      '<span><i style="background:#5b626b"></i>일반역</span>' +
      '<span class="dg-tip">역을 누르면 지나는 노선을 보고, 출발·도착으로 정하거나 역 정보를 열 수 있어요</span>';

    overlay.append(bar, scroll, legend);
    host.appendChild(overlay);
    host.classList.add('dg-on');
    placeOverlay();
    window.addEventListener('resize', placeOverlay);
    active = true;
    syncButton();

    requestAnimationFrame(() => {
      const t0 = performance.now();
      try {
        const net = buildNetwork();
        if (!net) throw new Error('표시할 노선이 없습니다');
        layout(net);
        const out = render(net);
        const canvas = document.createElement('div');
        canvas.className = 'dg-canvas';
        canvas.appendChild(out.svg);
        scroll.appendChild(canvas);
        viewW = out.W; viewH = out.H;
        bar.querySelector('.dg-hint').textContent =
          '노선 ' + out.lineCount + '개 · 역 ' + out.nodeCount + '곳 · ' + Math.round(performance.now() - t0) + 'ms';
        centerOnCore();
        bindStationClick(scroll);
        const pick = bar.querySelector('#dg-pick');
        if (pick) {
          [...new Map(net.lines.map(ls => [ls.line.properties.id, ls.line.properties])).values()].sort((a, c) => (a.name_ko || '').localeCompare(c.name_ko || '', 'ko', { numeric: true }))
            .forEach(p => { const o = document.createElement('option'); o.value = p.id; o.textContent = p.name_ko || p.id; pick.appendChild(o); });
          pick.onchange = () => focusLine(pick.value || null);
        }
      } catch (e) {
        console.error('[DiagramMode]', e);
        scroll.innerHTML = '<p style="padding:40px;text-align:center;color:var(--muted)">' +
          '노선도를 만들 수 없습니다: ' + esc(e.message || e) + '</p>';
      }
    });

    bar.querySelector('#dg-close').onclick = () => exit();
    bar.querySelector('#dg-zoom-in').onclick = () => zoomBy(1.25);
    bar.querySelector('#dg-zoom-out').onclick = () => zoomBy(1 / 1.25);
    bar.querySelector('#dg-fit').onclick = () => fit();
    bar.querySelector('#dg-save').onclick = () => {
      if (typeof DiagramExport !== 'undefined') DiagramExport.save();
    };
    // 휠 = 커서 위치 기준 확대/축소 (지도처럼)
    scroll.addEventListener('wheel', e => {
      e.preventDefault();
      const rect = scroll.getBoundingClientRect();
      const ox = e.clientX - rect.left;
      const oy = e.clientY - rect.top;
      zoomAt(ox, oy, e.deltaY < 0 ? 1.14 : 1 / 1.14);
    }, { passive: false });

    // 드래그 = 이동
    let drag = null;
    scroll.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      // 역 노드·역 카드(출발/도착 버튼) 위에서는 드래그를 시작하지 않는다 — setPointerCapture 가 클릭을 가로챈다
      if (e.target.closest('.dg-station, .dg-card')) return;
      drag = { x: e.clientX, y: e.clientY, l: scroll.scrollLeft, t: scroll.scrollTop, moved: 0 };
      scroll.setPointerCapture(e.pointerId);
      scroll.style.cursor = 'grabbing';
    });
    scroll.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
      scroll.scrollLeft = drag.l - dx;
      scroll.scrollTop = drag.t - dy;
    });
    const endDrag = () => {
      if (!drag) return;
      drag = null;
      scroll.style.cursor = '';
    };
    scroll.addEventListener('pointerup', endDrag);
    scroll.addEventListener('pointercancel', endDrag);

    return true;
  }

  /* 전체를 한 화면에 (개요) */
  function fit() {
    const canvas = overlay && overlay.querySelector('.dg-canvas');
    const scroll = overlay && overlay.querySelector('.dg-scroll');
    if (!canvas || !scroll) return;
    const availW = scroll.clientWidth - 20;
    const availH = scroll.clientHeight - 20;
    if (!viewW || availW <= 0 || availH <= 0) return;
    scale = Math.min(availW / viewW, availH / viewH);
    if (scale > 1.4) scale = 1.4;
    if (scale < 0.08) scale = 0.08;
    applyScale();
    scroll.scrollLeft = 0; scroll.scrollTop = 0;
    // 가운데 놓기 (68점 평가 13번: 화면 맞춤에서 오른쪽에 큰 빈 공간) — 남는 너비·높이의 절반만큼 띄운다
    canvas.style.marginLeft = Math.max(0, (scroll.clientWidth - viewW * scale) / 2) + 'px';
    canvas.style.marginTop = Math.max(0, (scroll.clientHeight - viewH * scale) / 2) + 'px';
  }

  /* D8: 노선 하나만 진하게 — 나머지 선·역은 흐리게, 그 노선 역 이름을 모두 쓰고 그 노선에 맞춘다. null 이면 전체로 */
  function focusLine(lid) {
    focusLid = lid || null;
    const svg = overlay && overlay.querySelector('.dg-canvas svg');
    if (!svg || !labelCtx) return;
    svg.querySelectorAll('path[data-line]').forEach(p => { p.style.opacity = !focusLid || p.getAttribute('data-line') === focusLid ? '' : '0.12'; });
    svg.querySelectorAll('.dg-station').forEach(g => { const on = !focusLid || (g.dataset.lines || '').split(',').includes(focusLid); g.style.opacity = on ? '' : '0.18'; });
    if (!focusLid) { placeLabels(scale); return; }
    const ns = labelCtx.nodes.filter(n => n.lines.has(focusLid));
    if (ns.length) fitBox(Math.min(...ns.map(n => n.x)), Math.min(...ns.map(n => n.y)), Math.max(...ns.map(n => n.x)), Math.max(...ns.map(n => n.y)));
    else placeLabels(scale);
  }
  // 그림 좌표 상자를 화면 가운데에 맞춘다 (여백 60)
  function fitBox(x0, y0, x1, y1) {
    const scroll = overlay && overlay.querySelector('.dg-scroll');
    if (!scroll) return;
    const w = Math.max(40, x1 - x0) + 120, h = Math.max(40, y1 - y0) + 120;
    scale = Math.max(0.08, Math.min(1.6, Math.min(scroll.clientWidth / w, scroll.clientHeight / h)));
    applyScale();
    scroll.scrollLeft = Math.max(0, ((x0 + x1) / 2) * scale - scroll.clientWidth / 2);
    scroll.scrollTop = Math.max(0, ((y0 + y1) / 2) * scale - scroll.clientHeight / 2);
  }

  /* 서울 도심(환승역 밀집 지역)을 화면 중앙에 두고 1:1 로 시작 */
  function centerOnCore() {
    const canvas = overlay && overlay.querySelector('.dg-canvas');
    const scroll = overlay && overlay.querySelector('.dg-scroll');
    if (!canvas || !scroll || !labelCtx) return;
    const tr = labelCtx.nodes.filter(n => n.lines.size > 1);
    const pool = tr.length ? tr : labelCtx.nodes;
    const cx = pool.reduce((s, n) => s + n.x, 0) / pool.length;
    const cy = pool.reduce((s, n) => s + n.y, 0) / pool.length;
    // 화면이 좁으면 더 넓게 보여준다
    scale = Math.max(0.34, Math.min(1, scroll.clientWidth / 980));
    applyScale();
    scroll.scrollLeft = Math.max(0, cx * scale - scroll.clientWidth / 2);
    scroll.scrollTop = Math.max(0, cy * scale - scroll.clientHeight / 2);
  }
  function zoomBy(k) {
    scale = Math.max(0.08, Math.min(3.2, scale * k));
    applyScale();
  }

  // 커서 아래 지점을 고정한 채 확대/축소
  function zoomAt(ox, oy, k) {
    const scroll = overlay && overlay.querySelector('.dg-scroll');
    if (!scroll) return;
    const before = scale;
    scale = Math.max(0.08, Math.min(3.2, scale * k));
    const r = scale / before;
    applyScale();
    scroll.scrollLeft = (scroll.scrollLeft + ox) * r - ox;
    scroll.scrollTop = (scroll.scrollTop + oy) * r - oy;
  }
  function applyScale() {
    const canvas = overlay && overlay.querySelector('.dg-canvas');
    if (canvas) { canvas.style.transform = 'scale(' + scale + ')'; canvas.style.marginLeft = ''; canvas.style.marginTop = ''; }
    scheduleLabels();
  }

  function bindStationClick(scroll) {
    let card = null;
    scroll.addEventListener('click', e => {
      const g = e.target.closest('.dg-station');
      if (card) { card.remove(); card = null; }
      if (!g) return;
      const name = g.dataset.name;
      const sid = g.dataset.sid || null;
      const ids = (g.dataset.lines || '').split(',').filter(Boolean);
      const colorOf = id => {
        const l = LINES.find(f => f.properties.id === id);
        return l ? (l.properties.color || '#8a8f98') : '#8a8f98';
      };
      const nameOf = id => {
        const l = LINES.find(f => f.properties.id === id);
        return l ? (l.properties.name_ko || id) : id;
      };
      card = document.createElement('div');
      card.className = 'dg-card';
      card.style.cssText =
        'position:absolute;z-index:5;min-width:172px;background:var(--panel);color:var(--text);' +
        'border:1px solid var(--border);border-radius:10px;box-shadow:var(--shadow-lg);padding:10px 12px;font-size:var(--fs-sm)';
      const r = g.getBoundingClientRect();
      const sr = scroll.getBoundingClientRect();
      card.style.left = Math.max(8, r.left - sr.left + scroll.scrollLeft - 70) + 'px';
      card.style.top = (r.top - sr.top + scroll.scrollTop + 18) + 'px';
      card.innerHTML =
        '<div style="font-weight:700;font-size:var(--fs-md);margin-bottom:6px">' + esc(name) + '</div>' +
        ids.map(id => '<div style="display:flex;align-items:center;gap:5px;margin:2px 0">' +
          '<i style="width:7px;height:7px;border-radius:50%;background:' + colorOf(id) + '"></i>' +
          esc(nameOf(id)) + '</div>').join('') +
        '<div style="display:flex;gap:5px;margin-top:8px">' +
        '<button data-act="from" style="flex:1;padding:5px 0;border:1px solid var(--border);border-radius:6px;background:var(--input);font-size:var(--fs-xs);font-weight:600;color:var(--text)">출발</button>' +
        '<button data-act="to" style="flex:1;padding:5px 0;border:1px solid var(--border);border-radius:6px;background:var(--input);font-size:var(--fs-xs);font-weight:600;color:var(--text)">도착</button>' +
        '<button data-act="info" style="flex:1.3;padding:5px 0;border:1px solid var(--border);border-radius:6px;background:var(--input);font-size:var(--fs-xs);font-weight:600;color:var(--text)">역 정보</button>' +
        '</div>';
      card.querySelectorAll('button').forEach(b => {
        b.onclick = ev => {
          ev.stopPropagation();
          const act = b.dataset.act;
          exit();
          // 이름이 아니라 역 ID 로 넘긴다 (동명역 구분 — 역 상세 패널의 onAction 과 같은 방식)
          if (typeof api.onAction === 'function') { api.onAction(act, name, sid); return; }
          if (act === 'info') return;
          const el = document.getElementById(act === 'from' ? 'route-from' : 'route-to');
          if (el) { el.value = name; if (sid) el.dataset.sid = sid; }
          const rp = document.getElementById('route-panel');
          if (rp) rp.hidden = false;
        };
      });
      scroll.appendChild(card);
    });
  }

  /* 노선도가 상단(데스크톱)·하단(모바일) 툴바를 덮지 않게 툴바 줄을 비워 둔다.
     툴바는 .dg-on 동안 오버레이 위로 올라간다(css) — 드롭다운 메뉴도 노선도 위에 뜬다. */
  function placeOverlay() {
    if (!overlay) return;
    const host = overlay.parentNode;
    const tb = document.getElementById('toolbar');
    overlay.style.top = ''; overlay.style.bottom = '';
    if (!host || !tb) return;
    const hr = host.getBoundingClientRect(), tr = tb.getBoundingClientRect();
    if (!tr.width || !tr.height) return;
    if (tr.top - hr.top < hr.height / 2) overlay.style.top = Math.max(0, Math.round(tr.bottom - hr.top + 8)) + 'px';
    else overlay.style.bottom = Math.max(0, Math.round(hr.bottom - tr.top)) + 'px';
  }

  // 툴바 '노선도' 버튼 켜짐 표시 — 여닫는 모든 경로(버튼·막대 닫기·Esc·카드)가 enter/exit 를 지난다
  function syncButton() {
    const btn = typeof document !== 'undefined' && document.getElementById('diagram-btn');
    if (btn && btn.classList) btn.classList.toggle('active', active);
  }

  function exit() {
    if (!active) return;
    window.removeEventListener('resize', placeOverlay);
    if (overlay && overlay.parentNode) overlay.parentNode.classList.remove('dg-on');
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
    active = false;
    syncButton();
    scale = 1;
    if (map && typeof map.resize === 'function') {
      try { map.resize(); } catch (e) {}
    }
  }

  const api = {
    init, enter, exit, isActive, focusLine, focused: () => focusLid,   // D8 노선 고르기
    // 카드의 출발·도착 버튼 → (act, 역 이름, 역 ID). app.js 가 연결한다.
    onAction: null,
    // 테스트용 — 좌표 변환·역 묶음만 검사한다
    _debug: { mercY, flatCoords, planar, projectAlong, buildClusters },
  };
  return api;
})();

if (typeof window !== 'undefined') window.DiagramMode = DiagramMode;
