/* 그리기 (나만의 노선) + 측정 (거리/면적) */
'use strict';

const DrawTools = (() => {
  const PALETTE = ['#e91e63', '#9c27b0', '#3f51b5', '#03a9f4', '#009688', '#ff9800', '#795548'];
  const DASHES = { '실선': [], '파선': [3, 2], '점선': [0.2, 2] };

  let map = null, mode = null;       // 'draw' | 'measure' | null
  let pts = [];
  let color = PALETTE[0], dashKey = '실선';
  let myLines = [];                  // {id, name, color, dashKey, coords}
  let seq = 1;
  let onUpdate = null;               // 상태 표시 콜백

  function setStatus(msg) { if (onUpdate) onUpdate(msg); }

  function hav(ax, ay, bx, by) {
    const r = Math.PI / 180;
    const dLat = (by - ay) * r, dLon = (bx - ax) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(ay * r) * Math.cos(by * r) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(h));
  }
  function totalKm(coords) {
    let t = 0;
    for (let i = 0; i < coords.length - 1; i++) t += hav(coords[i][0], coords[i][1], coords[i + 1][0], coords[i + 1][1]);
    return t;
  }
  // 구면 근사 면적 (km²)
  function areaKm2(coords) {
    if (coords.length < 3) return 0;
    const r = Math.PI / 180, R = 6371;
    let a = 0;
    for (let i = 0; i < coords.length; i++) {
      const [x1, y1] = coords[i], [x2, y2] = coords[(i + 1) % coords.length];
      a += (x2 - x1) * r * (2 + Math.sin(y1 * r) + Math.sin(y2 * r));
    }
    return Math.abs(a * R * R / 2);
  }

  function ensurePreview() {
    if (map.getSource('draw-preview')) return;
    map.addSource('draw-preview', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'draw-preview-line', type: 'line', source: 'draw-preview',
      paint: { 'line-color': color, 'line-width': 4, 'line-dasharray': DASHES[dashKey] } });
    map.addLayer({ id: 'draw-preview-pts', type: 'circle', source: 'draw-preview',
      paint: { 'circle-radius': 5, 'circle-color': '#fff', 'circle-stroke-color': color, 'circle-stroke-width': 2 } });
  }
  function refreshPreview() {
    ensurePreview();
    const feats = [];
    if (pts.length >= 2) feats.push({ type: 'Feature', properties: {},
      geometry: { type: 'LineString', coordinates: pts } });
    pts.forEach(p => feats.push({ type: 'Feature', properties: {},
      geometry: { type: 'Point', coordinates: p } }));
    map.getSource('draw-preview').setData({ type: 'FeatureCollection', features: feats });
    map.setPaintProperty('draw-preview-line', 'line-color', color);
    map.setPaintProperty('draw-preview-line', 'line-dasharray', DASHES[dashKey]);
    map.setPaintProperty('draw-preview-pts', 'circle-stroke-color', color);
  }
  function clearPreview() {
    if (map.getSource('draw-preview'))
      map.getSource('draw-preview').setData({ type: 'FeatureCollection', features: [] });
  }

  const MYLINE_LAYERS = ['mylines-solid', 'mylines-dash', 'mylines-dot'];
  function ensureMyLines() {
    if (map.getSource('mylines')) return;
    map.addSource('mylines', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    // line-dasharray는 data-driven 미지원이라 스타일별 레이어 분리
    const defs = [
      ['mylines-solid', '실선', []],
      ['mylines-dash', '파선', [3, 2]],
      ['mylines-dot', '점선', [0.2, 2]],
    ];
    defs.forEach(([id, key, dash]) => {
      map.addLayer({ id, type: 'line', source: 'mylines',
        filter: ['==', ['get', 'dashKey'], key],
        paint: { 'line-color': ['get', 'color'], 'line-width': 4, 'line-dasharray': dash } });
    });
  }
  function refreshMyLines() {
    ensureMyLines();
    map.getSource('mylines').setData({ type: 'FeatureCollection', features: myLines.map(l => ({
      type: 'Feature', properties: { color: l.color, dashKey: l.dashKey },
      geometry: { type: 'LineString', coordinates: l.coords }
    }))});
  }

  function hint() {
    return mode === 'draw'
      ? '그리기: 지도 클릭으로 점 추가 · Enter 완료 · Backspace 되돌리기 · Esc 취소'
      : mode === 'measure'
      ? '측정: 지도 클릭으로 점 추가 · Enter 완료(면적도 표시) · Backspace 되돌리기 · Esc 취소'
      : '';
  }

  function start(m) {
    cancel(true);
    mode = m; pts = [];
    ensurePreview();
    refreshPreview();
    map.getCanvas().style.cursor = 'crosshair';
    if (m === 'measure') map.doubleClickZoom.disable();
    setStatus(hint());
    document.getElementById('draw-panel').hidden = (m !== 'draw');
    document.getElementById('draw-btn').classList.toggle('active', m === 'draw');
    document.getElementById('measure-btn').classList.toggle('active', m === 'measure');
  }
  function cancel(silent) {
    if (!mode && !silent) return;
    mode = null; pts = [];
    clearPreview();
    map.getCanvas().style.cursor = '';
    if (map.doubleClickZoom) map.doubleClickZoom.enable();
    document.getElementById('draw-panel').hidden = true;
    document.getElementById('draw-btn').classList.remove('active');
    document.getElementById('measure-btn').classList.remove('active');
    if (!silent) setStatus('');
  }

  function onClick(lngLat) {
    if (!mode) return;
    pts.push([lngLat.lng, lngLat.lat]);
    refreshPreview();
    if (mode === 'measure') {
      const km = totalKm(pts);
      setStatus(`측정 중: ${km.toFixed(2)} km ${hint()}`);
    } else setStatus(hint());
  }

  function undo() {
    if (!mode || !pts.length) return;
    pts.pop();
    refreshPreview();
    setStatus(hint());
  }

  function finish() {
    if (!mode || pts.length < 2) { setStatus('점을 2개 이상 찍어주세요. ' + hint()); return; }
    if (mode === 'measure') {
      const km = totalKm(pts);
      const a = areaKm2(pts);
      setStatus(`측정 완료: 거리 ${km.toFixed(2)} km${pts.length >= 3 ? ` · 면적 약 ${a.toFixed(2)} km²` : ''}`);
      // 측정선은 미리보기에 남겨둠 (다음 측정/취소 시 지워짐)
      mode = null;
      map.getCanvas().style.cursor = '';
      map.doubleClickZoom.enable();
      document.getElementById('measure-btn').classList.remove('active');
      return;
    }
    // 그리기 완료 → 나의 노선으로 저장
    const line = { id: 'my-' + (seq), name: '나의 노선 ' + (seq), color, dashKey, coords: [...pts] };
    seq++;
    myLines.push(line);
    refreshMyLines();
    renderMyLineList();
    mode = null; pts = [];
    clearPreview();
    map.getCanvas().style.cursor = '';
    document.getElementById('draw-panel').hidden = true;
    document.getElementById('draw-btn').classList.remove('active');
    setStatus(`"${line.name}" 저장됨 (사이드바 나의 노선 목록에서 삭제 가능)`);
  }

  function renderMyLineList() {
    const box = document.getElementById('myline-list');
    box.innerHTML = '';
    myLines.forEach(l => {
      const row = document.createElement('div');
      row.className = 'line-item';
      const sw = document.createElement('span');
      sw.className = 'swatch'; sw.style.background = l.color;
      const del = document.createElement('button');
      del.className = 'mini-del'; del.textContent = '✕'; del.title = '삭제';
      del.addEventListener('click', () => {
        myLines = myLines.filter(x => x.id !== l.id);
        refreshMyLines(); renderMyLineList();
      });
      row.append(sw, document.createTextNode(l.name), del);
      box.appendChild(row);
    });
    document.getElementById('myline-count').textContent = myLines.length ? `(${myLines.length})` : '';
  }

  function onKey(e) {
    if (!mode) return;
    const tag = (document.activeElement || {}).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'Enter') { e.preventDefault(); finish(); }
    else if (e.key === 'Backspace') { e.preventDefault(); undo(); }
    else if (e.key === 'Escape') { cancel(); }
  }

  function init(m, statusCb) {
    map = m; onUpdate = statusCb;
    map.on('click', e => onClick(e.lngLat));
    document.addEventListener('keydown', onKey);
    // 그리기 패널: 색상 팔레트 + 선 스타일
    const pal = document.getElementById('draw-palette');
    pal.innerHTML = '';
    PALETTE.forEach(c => {
      const b = document.createElement('button');
      b.className = 'pal' + (c === color ? ' active' : '');
      b.style.background = c; b.title = c;
      b.addEventListener('click', () => {
        color = c;
        pal.querySelectorAll('.pal').forEach(x => x.classList.toggle('active', x === b));
        refreshPreview();
      });
      pal.appendChild(b);
    });
    const sel = document.getElementById('draw-dash');
    Object.keys(DASHES).forEach(k => {
      const o = document.createElement('option'); o.value = k; o.textContent = k;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => { dashKey = sel.value; refreshPreview(); });
    document.getElementById('draw-btn').addEventListener('click', () =>
      mode === 'draw' ? cancel() : start('draw'));
    document.getElementById('measure-btn').addEventListener('click', () =>
      mode === 'measure' ? cancel() : start('measure'));
  }

  function restyle() {
    // 베이스맵 교체(setStyle) 시 커스텀 레이어가 날아가므로 복원
    if (map.getSource('draw-preview')) {
      map.removeLayer('draw-preview-pts'); map.removeLayer('draw-preview-line');
      map.removeSource('draw-preview');
      ensurePreview();
      refreshPreview(); // 현재 pts 기준 (완료된 측정선도 pts에 남아 있음)
    }
    if (map.getSource('mylines')) {
      MYLINE_LAYERS.forEach(id => { if (map.getLayer(id)) map.removeLayer(id); });
      map.removeSource('mylines');
      refreshMyLines();
    }
  }

  return { init, renderMyLineList, restyle };
})();
