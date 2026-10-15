/* 노선 영향권 히트맵 — 선택 노선의 전 역에 반경 원을 그려 역세권 커버리지 시각화 */
(function () {
  'use strict';

  let map = null, ST = [], LN = [];
  let panel = null, selEl = null, sliderEl = null, radiusLabel = null, statsEl = null;
  let active = false, curLineId = null, radiusM = 500;
  const RADII = [300, 500, 800, 1000];
  const R_KM = 6371;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function hav(lng1, lat1, lng2, lat2) {
    const r = Math.PI / 180;
    const dLat = (lat2 - lat1) * r, dLon = (lng2 - lng1) * r;
    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
    return R_KM * 2 * Math.asin(Math.sqrt(h));
  }

  function statusLabel(st) {
    return st === 'open' ? '운행중' : st === 'construction' ? '공사중'
      : st === 'planned' ? '계획중' : '구상중';
  }

  function lineById(id) {
    return LN.find(l => l.properties.id === id) || null;
  }

  // 노선에 속한 역 (역명 기준 중복 제거)
  function lineStations(lineId) {
    const seen = new Map();
    for (const s of ST) {
      const lines = s.properties.lines || [];
      if (!lines.includes(lineId)) continue;
      const nm = s.properties.name_ko;
      if (!nm) continue;
      if (!seen.has(nm)) seen.set(nm, s);
    }
    return [...seen.values()];
  }

  // 반경 원 폴리곤 (GeoJSON)
  function circlePoly(lng, lat, rKm, steps) {
    steps = steps || 48;
    const coords = [];
    const rLat = Math.PI / 180;
    for (let i = 0; i <= steps; i++) {
      const b = (i / steps) * 2 * Math.PI;
      const lat2 = Math.asin(Math.sin(lat * rLat) * Math.cos(rKm / R_KM) +
        Math.cos(lat * rLat) * Math.sin(rKm / R_KM) * Math.cos(b));
      const lng2 = lng * rLat + Math.atan2(Math.sin(b) * Math.sin(rKm / R_KM) * Math.cos(lat * rLat),
        Math.cos(rKm / R_KM) - Math.sin(lat * rLat) * Math.sin(lat2));
      coords.push([lng2 / rLat, lat2 / rLat]);
    }
    return coords;
  }

  // 원들의 합집합 면적 근사 (격자 샘플링, km²)
  function unionAreaKm2(pts, rKm) {
    if (!pts.length) return 0;
    let minLng = 1e9, maxLng = -1e9, minLat = 1e9, maxLat = -1e9;
    for (const p of pts) {
      if (p[0] < minLng) minLng = p[0]; if (p[0] > maxLng) maxLng = p[0];
      if (p[1] < minLat) minLat = p[1]; if (p[1] > maxLat) maxLat = p[1];
    }
    const meanLat = (minLat + maxLat) / 2, rLat = Math.PI / 180;
    const kx = 111.32 * Math.cos(meanLat * rLat), ky = 110.57;
    const x0 = minLng * kx - rKm, x1 = maxLng * kx + rKm;
    const y0 = minLat * ky - rKm, y1 = maxLat * ky + rKm;
    const wKm = x1 - x0, hKm = y1 - y0;
    let cell = Math.max(rKm / 4, 0.05);
    if ((wKm / cell) * (hKm / cell) > 250000) cell = Math.sqrt(wKm * hKm / 250000);
    const nx = Math.ceil(wKm / cell), ny = Math.ceil(hKm / cell);
    const px = pts.map(p => [p[0] * kx, p[1] * ky]);
    const r2 = rKm * rKm;
    let inside = 0;
    for (let iy = 0; iy < ny; iy++) {
      const y = y0 + (iy + 0.5) * cell;
      for (let ix = 0; ix < nx; ix++) {
        const x = x0 + (ix + 0.5) * cell;
        for (let k = 0; k < px.length; k++) {
          const dx = x - px[k][0], dy = y - px[k][1];
          if (dx * dx + dy * dy <= r2) { inside++; break; }
        }
      }
    }
    return inside * cell * cell;
  }

  // 커버리지 안의 타노선 역 수 (역명 기준 중복 제거)
  function otherLineStationsIn(lineId, pts, rKm) {
    const seen = new Set();
    const centers = pts.map(p => ({ lng: p[0], lat: p[1] }));
    for (const s of ST) {
      const lines = s.properties.lines || [];
      if (lines.includes(lineId)) continue;
      const nm = s.properties.name_ko;
      if (!nm || seen.has(nm)) continue;
      const c = s.geometry.coordinates;
      for (const ctr of centers) {
        if (hav(c[0], c[1], ctr.lng, ctr.lat) <= rKm) { seen.add(nm); break; }
      }
    }
    return seen.size;
  }

  function injectCss() {
    if (document.getElementById('cv-style')) return;
    const st = document.createElement('style');
    st.id = 'cv-style';
    st.textContent = `
#cv-panel{position:absolute;top:70px;right:12px;width:300px;max-height:calc(100% - 140px);overflow-y:auto;
background:var(--panel-bg,#fff);color:var(--text,#222);border:1px solid var(--border,#ddd);border-radius:10px;
box-shadow:0 4px 18px rgba(0,0,0,.25);z-index:40;font-size:13px}
#cv-head{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;font-weight:700;
border-bottom:1px solid var(--border,#ddd)}
#cv-close{background:none;border:none;font-size:16px;cursor:pointer;color:var(--muted,#888)}
#cv-body{padding:10px 12px}
#cv-lines{width:100%;padding:6px;border-radius:6px;border:1px solid var(--border,#ddd);
background:var(--bg,#fff);color:var(--text,#222);font-size:13px;margin-bottom:10px}
.cv-row{margin-bottom:10px}
.cv-row label{display:block;font-size:12px;color:var(--muted,#888);margin-bottom:4px}
#cv-radius{width:100%}
.cv-ticks{display:flex;justify-content:space-between;font-size:11px;color:var(--muted,#888)}
#cv-radius-label{font-weight:700}
.cv-card{background:var(--bg,#f5f5f5);border-radius:8px;padding:8px 10px;margin-bottom:8px}
.cv-stat{display:flex;justify-content:space-between;padding:3px 0}
.cv-stat b{font-size:15px}
.cv-note{font-size:11px;color:var(--muted,#888);margin-top:6px;line-height:1.5}
@media(max-width:768px){#cv-panel{top:auto;bottom:12px;right:12px;left:12px;width:auto;max-height:55%}}
`;
    document.head.appendChild(st);
  }

  function ensurePanel() {
    injectCss();
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = 'cv-panel';
    panel.style.display = 'none';
    const opts = [...LN]
      .sort((a, b) => (a.properties.name_ko || '').localeCompare(b.properties.name_ko || '', 'ko'))
      .map(l => {
        const p = l.properties;
        const st = p.status && p.status !== 'open' ? ' (' + statusLabel(p.status) + ')' : '';
        return `<option value="${esc(p.id)}">${esc(p.name_ko || p.id)}${esc(st)}</option>`;
      }).join('');
    panel.innerHTML = `
<div id="cv-head">노선 영향권 <button id="cv-close" title="닫기">✕</button></div>
<div id="cv-body">
  <div class="cv-row">
    <label>노선 선택</label>
    <select id="cv-lines">${opts}</select>
  </div>
  <div class="cv-row">
    <label>영향 반경 <span id="cv-radius-label">500m</span></label>
    <input type="range" id="cv-radius" min="0" max="3" step="1" value="1">
    <div class="cv-ticks"><span>300m</span><span>500m</span><span>800m</span><span>1km</span></div>
  </div>
  <div class="cv-card" id="cv-stats"></div>
  <div class="cv-note">원은 역 좌표 기준 직선거리 반경입니다. 겹치는 부분은 색이 진해집니다.
  면적은 격자 샘플링 근사치입니다.</div>
</div>`;
    document.body.appendChild(panel);
    selEl = panel.querySelector('#cv-lines');
    sliderEl = panel.querySelector('#cv-radius');
    radiusLabel = panel.querySelector('#cv-radius-label');
    statsEl = panel.querySelector('#cv-stats');
    panel.querySelector('#cv-close').addEventListener('click', hide);
    selEl.addEventListener('change', () => { curLineId = selEl.value; render(); });
    sliderEl.addEventListener('input', () => {
      radiusM = RADII[parseInt(sliderEl.value, 10)];
      radiusLabel.textContent = radiusM >= 1000 ? '1km' : radiusM + 'm';
      render();
    });
    return panel;
  }

  function ensureLayers() {
    if (!map.getSource('cv-circles')) {
      map.addSource('cv-circles', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'cv-circles', type: 'fill', source: 'cv-circles',
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.22 }
      });
    }
    if (!map.getSource('cv-line')) {
      map.addSource('cv-line', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'cv-line', type: 'line', source: 'cv-line',
        paint: { 'line-color': ['get', 'color'], 'line-width': 7, 'line-opacity': 0.85 }
      });
    }
    if (!map.getSource('cv-stations')) {
      map.addSource('cv-stations', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'cv-stations', type: 'circle', source: 'cv-stations',
        paint: { 'circle-radius': 4, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 }
      });
    }
  }

  function render() {
    ensurePanel();
    if (!curLineId) { statsEl.innerHTML = '노선을 선택하세요.'; return; }
    const line = lineById(curLineId);
    if (!line) { statsEl.innerHTML = '노선을 찾을 수 없습니다.'; return; }
    const color = line.properties.color || '#888888';
    const stations = lineStations(curLineId);
    const rKm = radiusM / 1000;

    // 원 + 역점 + 노선 하이라이트
    ensureLayers();
    const circleFeats = stations.map(s => {
      const c = s.geometry.coordinates;
      return {
        type: 'Feature',
        properties: { color },
        geometry: { type: 'Polygon', coordinates: [circlePoly(c[0], c[1], rKm)] }
      };
    });
    const stFeats = stations.map(s => ({
      type: 'Feature',
      properties: { color },
      geometry: { type: 'Point', coordinates: s.geometry.coordinates }
    }));
    map.getSource('cv-circles').setData({ type: 'FeatureCollection', features: circleFeats });
    map.getSource('cv-stations').setData({ type: 'FeatureCollection', features: stFeats });
    map.getSource('cv-line').setData({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: { color }, geometry: line.geometry }]
    });

    // 통계
    const pts = stations.map(s => s.geometry.coordinates);
    let areaTxt = '계산 중…', otherTxt = '계산 중…';
    statsEl.innerHTML = `
<div class="cv-stat"><span>역 수</span><b>${stations.length}개</b></div>
<div class="cv-stat"><span>커버리지 면적 (근사)</span><b id="cv-area">${areaTxt}</b></div>
<div class="cv-stat"><span>커버리지 내 타노선 역</span><b id="cv-other">${otherTxt}</b></div>`;
    // 무거운 계산은 비동기로 (UI 블로킹 방지)
    setTimeout(() => {
      if (curLineId !== selEl.value) return;
      const area = unionAreaKm2(pts, rKm);
      const other = otherLineStationsIn(curLineId, pts, rKm);
      const aEl = document.getElementById('cv-area'), oEl = document.getElementById('cv-other');
      if (aEl) aEl.textContent = '약 ' + area.toFixed(1) + ' km²';
      if (oEl) oEl.textContent = other + '개';
    }, 30);

    // 해당 노선 범위로 이동
    if (pts.length) {
      let minLng = 1e9, maxLng = -1e9, minLat = 1e9, maxLat = -1e9;
      for (const p of pts) {
        if (p[0] < minLng) minLng = p[0]; if (p[0] > maxLng) maxLng = p[0];
        if (p[1] < minLat) minLat = p[1]; if (p[1] > maxLat) maxLat = p[1];
      }
      map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 60, duration: 600 });
    }
  }

  function show(lineId) {
    ensurePanel();
    if (lineId && lineById(lineId)) {
      curLineId = lineId;
      selEl.value = lineId;
    } else if (!curLineId && LN.length) {
      curLineId = [...LN].sort((a, b) =>
        (a.properties.name_ko || '').localeCompare(b.properties.name_ko || '', 'ko'))[0].properties.id;
      selEl.value = curLineId;
    }
    panel.style.display = 'block';
    active = true;
    render();
  }

  function hide() {
    active = false;
    curLineId = null;
    if (panel) panel.style.display = 'none';
    if (map) {
      for (const sid of ['cv-circles', 'cv-line', 'cv-stations']) {
        try {
          if (map.getSource(sid)) map.getSource(sid).setData({ type: 'FeatureCollection', features: [] });
        } catch (e) { /* style 변경 중 무시 */ }
      }
    }
  }

  function isActive() { return active; }

  function init(m, stations, lines) {
    map = m; ST = stations || []; LN = lines || [];
    // 베이스맵 교체 시 레이어 복원
    map.on('style.load', () => { if (active && curLineId) render(); });
  }

  window.CoverageMap = { init, show, hide, isActive };
})();
