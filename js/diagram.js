/* 다이어그램 모드: 노선을 45도 schematic(노선도 스타일)으로 보여주는 독립 모듈.
 * 사용법:
 *   DiagramMode.init(map, LINES, STATIONS);  // 앱 시작 후 1회
 *   DiagramMode.enter();                     // 다이어그램 진입
 *   DiagramMode.exit();                      // 원래 지도로 복귀
 *   DiagramMode.isActive();                  // 활성 여부
 * 다른 파일 수정 없이 동작. index.html에 <script src="js/diagram.js"></script> 추가 필요.
 */
'use strict';

const DiagramMode = (() => {
  let map = null;
  let LINES = [];
  let STATIONS = [];
  let active = false;
  let overlay = null;   // 컨테이너 div
  let scale = 1;

  const ROW_H = 64;       // 노선 한 줄 높이
  const X_GAP = 104;      // 역 간격
  const MARGIN = 70;      // 여백
  const R = 7;            // 역 원 반지름

  function init(m, lines, stations) {
    map = m || null;
    LINES = lines || [];
    STATIONS = stations || [];
  }

  function isActive() { return active; }

  /* ---------- 기하 유틸 ---------- */
  function hav(ax, ay, bx, by) {
    const r = Math.PI / 180;
    const dLat = (by - ay) * r, dLon = (bx - ax) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(ay * r) * Math.cos(by * r) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(h));
  }
  function flatCoords(geom) {
    if (!geom) return [];
    if (geom.type === 'LineString') return geom.coordinates;
    if (geom.type === 'MultiLineString') return geom.coordinates.flat(1);
    return [];
  }
  // 점 p를 선형에 투영 → 선형 따라 거리(km). route.js의 project()와 같은 방식.
  function projectAlong(p, coords) {
    let bestAlong = 0, bestDist = Infinity, acc = 0;
    for (let i = 0; i < coords.length - 1; i++) {
      const [ax, ay] = coords[i], [bx, by] = coords[i + 1];
      const segLen = hav(ax, ay, bx, by);
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;
      let t = len2 ? ((p[0] - ax) * dx + (p[1] - ay) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const d = hav(p[0], p[1], ax + t * dx, ay + t * dy);
      if (d < bestDist) { bestDist = d; bestAlong = acc + t * segLen; }
      acc += segLen;
    }
    return bestAlong;
  }

  /* ---------- 노선별 역 순서 ---------- */
  // 각 노선 → along 순서로 정렬된 역 feature 배열
  function orderedStations(lineId, coords) {
    const seen = new Map(); // name_ko -> feature (중복 제거)
    for (const s of STATIONS) {
      const lines = s.properties.lines || [];
      if (!lines.includes(lineId)) continue;
      const nm = s.properties.name_ko;
      if (!seen.has(nm)) seen.set(nm, s);
    }
    const arr = [...seen.values()];
    // 성능: 좌표가 많으면 다운샘플링 (최대 200점) — 순서 파악용이므로 정밀도 무관
    let projCoords = coords;
    if (coords.length > 200) {
      const step = Math.ceil(coords.length / 200);
      projCoords = coords.filter((_, i) => i % step === 0);
    }
    arr.forEach(s => { s._along = projectAlong(s.geometry.coordinates, projCoords); });
    arr.sort((a, b) => a._along - b._along);
    return arr;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ---------- SVG 생성 ---------- */
  function build() {
    const NS = 'http://www.w3.org/2000/svg';
    const mk = (tag, attrs, parent) => {
      const el = document.createElementNS(NS, tag);
      for (const k in attrs) el.setAttribute(k, attrs[k]);
      if (parent) parent.appendChild(el);
      return el;
    };

    // 노선별 역 목록 (역 있는 노선만)
    const rows = [];
    for (const f of LINES) {
      const p = f.properties;
      const coords = flatCoords(f.geometry);
      if (!coords.length) continue;
      const sts = orderedStations(p.id, coords);
      if (!sts.length) continue;
      rows.push({ line: f, props: p, stations: sts });
    }

    const maxN = Math.max(...rows.map(r => r.stations.length), 1);
    const W = MARGIN * 2 + 200 + maxN * X_GAP;
    const H = MARGIN * 2 + rows.length * ROW_H;

    const svg = mk('svg', {
      width: W, height: H, viewBox: `0 0 ${W} ${H}`,
      style: 'display:block;background:#0f172a;'
    });

    // 환승역 위치 기록: name_ko -> [{x, y, feature}]
    const byName = new Map();

    rows.forEach((row, i) => {
      const y = MARGIN + i * ROW_H + ROW_H / 2;
      const color = row.props.color || '#888888';
      const n = row.stations.length;
      const x0 = MARGIN + 200;

      // 노선 라벨
      const label = mk('text', {
        x: MARGIN + 190, y: y + 5, 'text-anchor': 'end',
        fill: color, 'font-size': 15, 'font-weight': 'bold',
        'font-family': 'sans-serif'
      }, svg);
      label.textContent = row.props.name_ko || row.props.id;

      // 노선 직선
      mk('line', {
        x1: x0 - R, y1: y, x2: x0 + (n - 1) * X_GAP + R, y2: y,
        stroke: color, 'stroke-width': 5, 'stroke-linecap': 'round'
      }, svg);

      row.stations.forEach((s, j) => {
        const x = x0 + j * X_GAP;
        const nm = s.properties.name_ko;
        if (!byName.has(nm)) byName.set(nm, []);
        byName.get(nm).push({ x, y, feature: s });

        const g = mk('g', { class: 'dg-station', style: 'cursor:pointer' }, svg);
        g.dataset.stationId = s.properties.id;
        g.dataset.nameKo = nm;

        // 흰색 바탕 원 (환승역은 굵은 테두리)
        mk('circle', { cx: x, cy: y, r: R + 3.5, fill: '#ffffff' }, g);
        mk('circle', { cx: x, cy: y, r: R, fill: color, stroke: '#ffffff', 'stroke-width': 2 }, g);

        // 역명 라벨 (45도 회전 느낌: 아래에 비스듬히)
        const t = mk('text', {
          x: x + 10, y: y + 22, fill: '#e2e8f0', 'font-size': 12,
          'font-family': 'sans-serif', transform: `rotate(35 ${x + 10} ${y + 22})`
        }, g);
        t.textContent = nm;

        g.addEventListener('click', () => onStationClick(s));
      });
    });

    // 환승 연결선: 같은 역명이 2개 이상 노선에 있으면 점선으로 연결
    const linkLayer = mk('g', { opacity: 0.55 }, svg);
    svg.insertBefore(linkLayer, svg.firstChild);
    byName.forEach(list => {
      if (list.length < 2) return;
      // 환승역 표시: 바깥 원 추가
      list.forEach(pt => {
        mk('circle', {
          cx: pt.x, cy: pt.y, r: R + 6.5, fill: 'none',
          stroke: '#ffffff', 'stroke-width': 2.5
        }, svg);
      });
      // 점선 연결
      for (let k = 0; k < list.length - 1; k++) {
        mk('line', {
          x1: list[k].x, y1: list[k].y, x2: list[k + 1].x, y2: list[k + 1].y,
          stroke: '#94a3b8', 'stroke-width': 2, 'stroke-dasharray': '6 5'
        }, linkLayer);
      }
    });

    return { svg, W, H, rows: rows.length };
  }

  /* ---------- 역 클릭 → 기존 팝업 연동 ---------- */
  function onStationClick(feature) {
    try {
      if (typeof window.openStationPopup === 'function') {
        const [lng, lat] = feature.geometry.coordinates;
        window.openStationPopup(feature, { lng, lat });
        exit(); // 팝업을 보여주기 위해 다이어그램 닫기
        return;
      }
    } catch (e) { /* 무시하고 폴백 */ }
    // 폴백: 역명을 클립보드에 복사
    try {
      const nm = feature.properties.name_ko || '';
      if (navigator.clipboard) navigator.clipboard.writeText(nm);
    } catch (e) {}
  }

  /* ---------- 오버레이 ---------- */
  function enter() {
    if (active) return true;
    try {
      if (!LINES.length || !STATIONS.length) {
        console.error('[DiagramMode] 데이터 없음');
        return false;
      }

      const mapEl = document.getElementById('map');
      if (!mapEl) {
        console.error('[DiagramMode] #map 없음');
        return false;
      }

      overlay = document.createElement('div');
      overlay.id = 'diagram-overlay';
      overlay.style.cssText =
        'position:absolute;inset:0;z-index:30;overflow:auto;background:#0f172a;';

      // 상단 컨트롤 바
      const bar = document.createElement('div');
      bar.style.cssText =
        'position:sticky;top:0;z-index:2;display:flex;gap:8px;align-items:center;' +
        'padding:8px 12px;background:rgba(15,23,42,0.92);color:#e2e8f0;' +
        'font-family:sans-serif;font-size:14px;border-bottom:1px solid #334155;';
      const title = document.createElement('b');
      title.textContent = '다이어그램 모드';
      const zoomOut = document.createElement('button'); zoomOut.textContent = '－';
      const zoomIn = document.createElement('button'); zoomIn.textContent = '＋';
      const closeBtn = document.createElement('button'); closeBtn.textContent = '✕ 닫기';
      [zoomOut, zoomIn, closeBtn].forEach(b => {
        b.style.cssText = 'cursor:pointer;padding:4px 10px;border-radius:6px;border:1px solid #475569;background:#1e293b;color:#e2e8f0;';
      });
      const hint = document.createElement('span');
      hint.style.cssText = 'color:#94a3b8;font-size:12px;';
      hint.textContent = '역을 클릭하면 정보 팝업 · 흰 테두리=환승역 · 점선=환승 연결';
      bar.append(title, zoomOut, zoomIn, closeBtn, hint);
      overlay.appendChild(bar);

      // 로딩 표시
      const loading = document.createElement('div');
      loading.style.cssText = 'color:#e2e8f0;padding:40px;text-align:center;font-family:sans-serif;';
      loading.textContent = '노선도 생성 중...';
      overlay.appendChild(loading);

      mapEl.style.position = 'relative';
      mapEl.appendChild(overlay);
      active = true;

      // 비동기로 SVG 빌드 (UI 블로킹 방지)
      setTimeout(() => {
        try {
          const built = build();
          const wrap = document.createElement('div');
          wrap.style.cssText = 'transform-origin:0 0;';
          const applyScale = () => { wrap.style.transform = `scale(${scale})`; };
          wrap.appendChild(built.svg);
          zoomIn.onclick = () => { scale = Math.min(3, scale * 1.2); applyScale(); };
          zoomOut.onclick = () => { scale = Math.max(0.3, scale / 1.2); applyScale(); };
          loading.remove();
          overlay.appendChild(wrap);
        } catch (e) {
          console.error('[DiagramMode] build 실패:', e);
          loading.textContent = '노선도 생성 실패: ' + (e.message || e);
          loading.style.color = '#f87171';
        }
      }, 50);

      closeBtn.onclick = () => exit();
      return true;
    } catch (e) {
      console.error('[DiagramMode] enter 실패:', e);
      return false;
    }
  }

  function exit() {
    if (!active) return;
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
    active = false;
    scale = 1;
    if (map && typeof map.resize === 'function') {
      try { map.resize(); } catch (e) {}
    }
  }

  return { init, enter, exit, isActive };
})();

if (typeof window !== 'undefined') window.DiagramMode = DiagramMode;
