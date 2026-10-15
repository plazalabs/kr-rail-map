/* 그리기 (나만의 노선) + 측정 (거리/면적) */
'use strict';

const DrawTools = (() => {
  const PALETTE = ['#e91e63', '#9c27b0', '#3f51b5', '#03a9f4', '#009688', '#ff9800', '#795548'];
  const DASHES = { '실선': [], '파선': [3, 2], '점선': [0.2, 2] };

  let map = null, mode = null;       // 'draw' | 'measure' | 'radius' | 'memo' | null
  let pts = [];
  let color = PALETTE[0], dashKey = '실선';
  let myLines = [];                  // {id, name, color, dashKey, coords}
  let memos = [];                    // {id, lng, lat, text}
  let seq = 1;
  let onUpdate = null;               // 상태 표시 콜백
  let allStations = [];              // 역 스냅용 + 반경 내 역 계산용
  const LS_KEY = 'kr-rail-map-mylines-v1';
  const MEMO_KEY = 'kr-rail-map-memos-v1';
  const SNAP_PX = 25;                // 스냅 반경 (픽셀)

  function setStatus(msg) { if (onUpdate) onUpdate(msg); }

  function saveMyLines() {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ seq, myLines })); } catch (_) {}
  }
  function loadMyLines() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (Array.isArray(d.myLines)) { myLines = d.myLines; seq = d.seq || (myLines.length + 1); }
    } catch (_) {}
  }

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
    // 메모 핀 레이어
    if (!map.getSource('memos')) {
      map.addSource('memos', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'memo-pins', type: 'symbol', source: 'memos',
        layout: { 'text-field': '📌', 'text-size': 24, 'text-allow-overlap': true }
      });
    }
  }
  function refreshPreview() {
    ensurePreview();
    const feats = [];
    const coords = pts.map(p => p.coord);
    if (coords.length >= 2) feats.push({ type: 'Feature', properties: {},
      geometry: { type: 'LineString', coordinates: coords } });
    pts.forEach(p => feats.push({ type: 'Feature',
      properties: { name: p.name || '' },
      geometry: { type: 'Point', coordinates: p.coord } }));
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
      : mode === 'radius'
      ? '반경: 중심점 클릭 → 반경 끝점 클릭 (Esc 취소)'
      : mode === 'memo'
      ? '메모: 지도 클릭으로 핀 추가 (Esc 취소)'
      : '';
  }

  // 메모 핀 관리
  function saveMemos() {
    try { localStorage.setItem(MEMO_KEY, JSON.stringify(memos)); } catch {}
  }
  function loadMemos() {
    try { memos = JSON.parse(localStorage.getItem(MEMO_KEY) || '[]'); } catch { memos = []; }
  }
  function refreshMemos() {
    if (!map.getSource('memos')) return;
    map.getSource('memos').setData({
      type: 'FeatureCollection',
      features: memos.map(m => ({
        type: 'Feature',
        properties: { id: m.id, text: m.text },
        geometry: { type: 'Point', coordinates: [m.lng, m.lat] }
      }))
    });
    renderMemoList();
  }
  function renderMemoList() {
    const box = document.getElementById('memo-list');
    if (!box) return;
    box.innerHTML = memos.length ? `<b>내 메모 (${memos.length})</b>` : '';
    memos.forEach(m => {
      const div = document.createElement('div');
      div.className = 'memo-item';
      div.textContent = `📌 ${m.text}`;
      const del = document.createElement('button');
      del.textContent = '✕'; del.className = 'memo-del';
      del.onclick = () => { memos = memos.filter(x => x.id !== m.id); saveMemos(); refreshMemos(); };
      div.appendChild(del);
      div.onclick = (e) => { if (e.target !== del) map.flyTo({ center: [m.lng, m.lat], zoom: 14 }); };
      box.appendChild(div);
    });
  }

  // 반경 원 그리기 (GeoJSON Polygon 근사)
  function circlePolygon(center, radiusKm, steps) {
    steps = steps || 64;
    const coords = [];
    const [clng, clat] = center;
    const R = 6371, r = Math.PI / 180;
    for (let i = 0; i <= steps; i++) {
      const brng = (i / steps) * 2 * Math.PI;
      const lat2 = Math.asin(Math.sin(clat*r)*Math.cos(radiusKm/R) +
        Math.cos(clat*r)*Math.sin(radiusKm/R)*Math.cos(brng));
      const lng2 = clng*r + Math.atan2(Math.sin(brng)*Math.sin(radiusKm/R)*Math.cos(clat*r),
        Math.cos(radiusKm/R) - Math.sin(clat*r)*Math.sin(lat2));
      coords.push([lng2/r, lat2/r]);
    }
    return coords;
  }
  function countStationsIn(center, radiusKm) {
    const [clng, clat] = center;
    const R = Math.PI / 180;
    let n = 0;
    const seen = new Set();
    for (const s of allStations) {
      const nm = s.properties.name_ko;
      if (seen.has(nm)) continue;
      const [slng, slat] = s.geometry.coordinates;
      const dLat = (slat - clat) * R, dLon = (slng - clng) * R;
      const h = Math.sin(dLat/2)**2 + Math.cos(clat*R)*Math.cos(slat*R)*Math.sin(dLon/2)**2;
      if (6371 * 2 * Math.asin(Math.sqrt(h)) <= radiusKm) { n++; seen.add(nm); }
    }
    return n;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function start(m) {
    cancel(true);
    mode = m; pts = [];
    ensurePreview();
    refreshPreview();
    map.getCanvas().style.cursor = 'crosshair';
    if (m === 'measure' || m === 'radius' || m === 'memo') map.doubleClickZoom.disable();
    setStatus(hint());
    document.getElementById('draw-panel').hidden = (m !== 'draw');
    document.getElementById('draw-btn').classList.toggle('active', m === 'draw');
    document.getElementById('measure-btn').classList.toggle('active', m === 'measure');
    document.getElementById('radius-btn').classList.toggle('active', m === 'radius');
    document.getElementById('memo-btn').classList.toggle('active', m === 'memo');
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
    document.getElementById('radius-btn').classList.remove('active');
    document.getElementById('memo-btn').classList.remove('active');
    if (!silent) setStatus('');
  }

  function onClick(lngLat) {
    if (!mode) return;
    // 메모 모드: 핀 추가
    if (mode === 'memo') {
      const text = prompt('메모를 입력하세요:');
      if (text && text.trim()) {
        memos.push({ id: Date.now(), lng: lngLat.lng, lat: lngLat.lat, text: text.trim() });
        saveMemos(); refreshMemos();
        setStatus(`📌 메모 추가됨: ${text.trim().slice(0, 20)}`);
      }
      return;
    }
    // 반경 모드: 2점 (중심, 끝점)
    if (mode === 'radius') {
      pts.push([lngLat.lng, lngLat.lat]);
      if (pts.length === 1) {
        setStatus('반경: 반경 끝점을 클릭하세요 (Esc 취소)');
        refreshPreview();
      } else if (pts.length === 2) {
        const c = pts[0], e = pts[1];
        const rKm = hav(c[0], c[1], e[0], e[1]);
        const n = countStationsIn(c, rKm);
        // 원 + 중심점 표시
        ensurePreview();
        const feats = [
          { type: 'Feature', properties: {},
            geometry: { type: 'Polygon', coordinates: [circlePolygon(c, rKm)] } },
          { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: c } }
        ];
        map.getSource('draw-preview').setData({ type: 'FeatureCollection', features: feats });
        const rM = rKm >= 1 ? rKm.toFixed(2) + 'km' : Math.round(rKm*1000) + 'm';
        setStatus(`반경 ${rM} · 원 면적 ${(Math.PI*rKm*rKm).toFixed(2)}km² · 반경 안 역 ${n}개`);
        mode = null; pts = [];
        map.getCanvas().style.cursor = '';
        map.doubleClickZoom.enable();
        document.getElementById('radius-btn').classList.remove('active');
      }
      return;
    }
    let pt = [lngLat.lng, lngLat.lat];
    let snapName = null;
    // 역 스냅: 클릭 지점 근처 역이 있으면 그 역 좌표로
    if (mode === 'draw' && allStations.length) {
      const clickPx = map.project(lngLat);
      let bestD = SNAP_PX, bestS = null;
      for (const s of allStations) {
        const sp = map.project(s.geometry.coordinates);
        const d = Math.hypot(sp.x - clickPx.x, sp.y - clickPx.y);
        if (d < bestD) { bestD = d; bestS = s; }
      }
      if (bestS) {
        pt = [...bestS.geometry.coordinates];
        snapName = bestS.properties.name_ko;
      }
    }
    pts.push({ coord: pt, name: snapName });
    refreshPreview();
    if (mode === 'measure') {
      const km = totalKm(pts.map(p => p.coord));
      setStatus(`측정 중: ${km.toFixed(2)} km ${hint()}`);
    } else setStatus(hint() + (snapName ? ` · 📌 ${snapName}에 스냅됨` : ''));
  }

  function undo() {
    if (!mode || !pts.length) return;
    pts.pop();
    refreshPreview();
    setStatus(hint());
  }

  function finish() {
    if (!mode || pts.length < 2) { setStatus('점을 2개 이상 찍어주세요. ' + hint()); return; }
    const coords = pts.map(p => p.coord);
    if (mode === 'measure') {
      const km = totalKm(coords);
      const a = areaKm2(coords);
      const walkMin = Math.round(km / 4 * 60);   // 도보 4km/h
      const bikeMin = Math.round(km / 15 * 60);  // 자전거 15km/h
      const walkTxt = walkMin >= 60 ? `${Math.floor(walkMin/60)}시간 ${walkMin%60}분` : `${walkMin}분`;
      const bikeTxt = bikeMin >= 60 ? `${Math.floor(bikeMin/60)}시간 ${bikeMin%60}분` : `${bikeMin}분`;
      setStatus(`측정 완료: 거리 ${km.toFixed(2)} km (도보 ${walkTxt} · 자전거 ${bikeTxt})${pts.length >= 3 ? ` · 면적 약 ${a.toFixed(2)} km²` : ''}`);
      // 측정선은 미리보기에 남겨둠 (다음 측정/취소 시 지워짐)
      mode = null;
      map.getCanvas().style.cursor = '';
      map.doubleClickZoom.enable();
      document.getElementById('measure-btn').classList.remove('active');
      return;
    }
    // 그리기 완료 → 나의 노선으로 저장
    const customName = (document.getElementById('draw-name').value || '').trim();
    const line = { id: 'my-' + (seq), name: customName || ('나의 노선 ' + seq),
      color, dashKey, coords,
      stations: pts.map(p => p.name).filter(Boolean) };
    seq++;
    myLines.push(line);
    saveMyLines();
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
        saveMyLines();
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
    loadMyLines();
    loadMemos();
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
    document.getElementById('radius-btn').addEventListener('click', () =>
      mode === 'radius' ? cancel() : start('radius'));
    document.getElementById('memo-btn').addEventListener('click', () =>
      mode === 'memo' ? cancel() : start('memo'));

    // 메모 핀 클릭 시 팝업
    map.on('click', 'memo-pins', e => {
      const f = e.features[0];
      new maplibregl.Popup()
        .setLngLat(f.geometry.coordinates)
        .setHTML(`<div style="max-width:200px"><b>📌 메모</b><br>${escapeHtml(f.properties.text)}</div>`)
        .addTo(map);
    });

    // GeoJSON 내보내기
    document.getElementById('export-geojson').addEventListener('click', () => {
      if (!myLines.length) { setStatus('내보낼 자작 노선이 없습니다.'); return; }
      const fc = {
        type: 'FeatureCollection',
        features: myLines.map(l => ({
          type: 'Feature',
          properties: { name: l.name, color: l.color, dash: l.dashKey },
          geometry: { type: 'LineString', coordinates: l.coords }
        }))
      };
      const blob = new Blob([JSON.stringify(fc, null, 2)], { type: 'application/geo+json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'kr-rail-map-mylines.geojson';
      a.click();
      URL.revokeObjectURL(a.href);
      setStatus(`GeoJSON 다운로드: ${myLines.length}개 노선`);
    });
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

  return { init, renderMyLineList, restyle, refreshMyLines, refreshMemos,
    setStations: sts => { allStations = sts || []; } };
})();
