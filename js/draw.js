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

  /* 링크 공유 — ?ml=1.<색><선>.<점들>&mn=<이름>
   *   점들: 경도·위도를 1e5 정수(약 1m)로, 앞 점과의 차이를 zigzag + varint 로 줄여 base64url 로 적는다 (30점 ≈ 250자).
   *   색은 팔레트 번호(0~6), 선은 실선0·파선1·점선2. 이름은 40자까지. 주소 전체가 MAX_URL 을 넘으면 만들지 않는다.
   *   받은 쪽: 색·선은 목록 밖 값이면 기본값, 좌표는 한국 범위 밖이면 거절. 이름은 화면에 글자로만 넣는다(textContent). */
  const SHARE_MAX_URL = 2000;
  const DASH_KEYS = Object.keys(DASHES);
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  function encodePts(coords) {
    const bytes = [];
    let px = 0, py = 0;
    const put = v => { let z = v < 0 ? (-v * 2 - 1) : v * 2; do { let b = z & 0x7f; z = Math.floor(z / 128); if (z) b |= 0x80; bytes.push(b); } while (z); };
    coords.forEach(c => { const x = Math.round(c[0] * 1e5), y = Math.round(c[1] * 1e5); put(x - px); put(y - py); px = x; py = y; });
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
      const k = Math.min(4, Math.ceil((bytes.length - i) * 4 / 3));
      for (let j = 0; j < k; j++) out += B64[(n >> (18 - 6 * j)) & 63];
    }
    return out;
  }
  function decodePts(str) {
    const bytes = [];
    for (let i = 0; i < str.length; i += 4) {
      const chunk = str.slice(i, i + 4);
      let n = 0;
      for (let j = 0; j < 4; j++) { const v = j < chunk.length ? B64.indexOf(chunk[j]) : 0; if (v < 0) return null; n = (n << 6) | v; }
      const k = Math.floor(chunk.length * 3 / 4);
      for (let j = 0; j < k; j++) bytes.push((n >> (16 - 8 * j)) & 255);
    }
    const vals = [];
    let z = 0, mul = 1;
    for (const b of bytes) { z += (b & 0x7f) * mul; if (b & 0x80) { mul *= 128; if (mul > 2 ** 35) return null; } else { vals.push(z % 2 ? -(z + 1) / 2 : z / 2); z = 0; mul = 1; } }
    if (vals.length % 2) return null;
    const out = []; let x = 0, y = 0;
    for (let i = 0; i < vals.length; i += 2) { x += vals[i]; y += vals[i + 1]; out.push([x / 1e5, y / 1e5]); }
    return out;
  }
  function shareQuery(line) {
    const ci = Math.max(0, PALETTE.indexOf(line.color)), di = Math.max(0, DASH_KEYS.indexOf(line.dashKey));
    return '?ml=1.' + ci + di + '.' + encodePts(line.coords) + '&mn=' + encodeURIComponent(String(line.name || '').slice(0, 40));
  }
  function parseShare(search) {
    const q = new URLSearchParams(search || '');
    const ml = q.get('ml'); if (!ml) return null;
    const m = /^1\.(\d)(\d)\.([A-Za-z0-9_-]+)$/.exec(ml); if (!m) return null;
    const coords = decodePts(m[3]);
    if (!coords || coords.length < 2 || coords.length > 500) return null;
    if (!coords.every(c => c[0] > 124 && c[0] < 132 && c[1] > 33 && c[1] < 39)) return null;   // 한국 밖 좌표는 거절
    const name = (q.get('mn') || '').slice(0, 40).trim() || '받은 노선';
    return { name, color: PALETTE[+m[1]] || PALETTE[0], dashKey: DASH_KEYS[+m[2]] || DASH_KEYS[0], coords };
  }

  function saveMyLines() {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ seq, myLines: myLines.filter(l => !l.shared) })); } catch (_) {}
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
    ensureMemos();
  }
  // 메모 핀 레이어 — 이모지(압정 그림)를 심볼 텍스트로 쓰면 배경지도 글꼴 서버에
  // 그 글리프가 없어 아무것도 안 그려진다. 글꼴이 필요 없는 원으로 찍는다.
  function ensureMemos() {
    if (map.getSource('memos')) return;
    map.addSource('memos', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'memo-pins', type: 'circle', source: 'memos',
      paint: {
        'circle-radius': 7, 'circle-color': '#f59e0b',
        'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2.5
      }
    });
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
    // 저장된 메모가 있으면 레이어부터 만든다 (예전엔 메모 모드를 켜기 전까지 레이어가 없어
    // 새로 고침·스타일 교체 뒤 저장된 핀이 안 보였다)
    if (memos.length) ensureMemos();
    if (!map.getSource('memos')) { renderMemoList(); return; }
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
      div.textContent = m.text; if (div.insertAdjacentHTML && typeof Icons !== 'undefined') div.insertAdjacentHTML('afterbegin', Icons.svg('pin') + ' ');
      const del = document.createElement('button');
      del.innerHTML = Icons.svg('close'); del.setAttribute('aria-label', '삭제'); del.className = 'memo-del';
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
    document.body.classList.add('drawing');   // 그리는 중엔 역 클릭으로 역 창이 안 열리게 (app.js 지도 클릭)
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
    document.body.classList.remove('drawing');
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
        setStatus(`메모 추가됨: ${text.trim().slice(0, 20)}`);
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
        document.body.classList.remove('drawing');
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
    } else setStatus(hint() + (snapName ? ` · ${snapName}에 붙음` : ''));
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
      document.body.classList.remove('drawing');
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
    document.body.classList.remove('drawing');
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
      del.className = 'mini-del'; del.innerHTML = Icons.svg('close'); del.setAttribute('aria-label', '삭제'); del.title = '삭제';
      del.addEventListener('click', () => {
        myLines = myLines.filter(x => x.id !== l.id);
        saveMyLines();
        refreshMyLines(); renderMyLineList();
      });
      // 링크 공유 — 받은 노선(아직 저장 안 함)이면 '저장', 아니면 '링크'
      const act = document.createElement('button');
      act.className = 'mini-share';   // 'mini-del' 을 같이 붙이면 삭제 단추로 잘못 잡힌다 (2026-11-13 ui-fixes e2e)
      if (l.shared) {
        act.textContent = '저장'; act.title = '내 노선에 저장'; act.setAttribute('aria-label', '받은 노선을 내 노선에 저장');
        act.addEventListener('click', () => { delete l.shared; l.id = 'my-' + (seq++); saveMyLines(); renderMyLineList(); setStatus('"' + l.name + '" 을 내 노선에 저장했습니다'); });
      } else {
        act.innerHTML = Icons.svg('link'); act.title = '링크로 보내기'; act.setAttribute('aria-label', l.name + ' 링크 복사');
        act.addEventListener('click', () => {
          const url = location.origin + location.pathname + shareQuery(l) + location.hash;
          if (url.length > SHARE_MAX_URL) { setStatus('점이 너무 많아 링크로 보낼 수 없습니다 (' + url.length + '자) — GeoJSON 내보내기를 쓰세요'); return; }
          const done = () => { setStatus('"' + l.name + '" 링크를 복사했습니다 (' + url.length + '자)'); if (window.KRTrack) KRTrack('노선 공유'); };
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => { setStatus('복사하지 못했습니다 — 주소: ' + url); });
          else setStatus('주소: ' + url);
        });
      }
      const nm = document.createElement('span'); nm.className = 'myline-name'; nm.textContent = l.name + (l.shared ? ' (받은 노선)' : '');
      row.append(sw, nm, act, del);
      box.appendChild(row);
    });
    document.getElementById('myline-count').textContent = myLines.length ? `(${myLines.length})` : '';
  }

  function onKey(e) {
    if (!mode) return;
    const tag = (document.activeElement || {}).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    // 버튼·선택 상자에서 누른 Enter 는 그 버튼의 동작이다 (예: 그리기 패널 ✕). 그리기 완료로 가로채지 않는다
    if ((tag === 'BUTTON' || tag === 'SELECT' || tag === 'A') && (e.key === 'Enter' || e.key === 'Backspace')) return;
    if (e.key === 'Enter') { e.preventDefault(); finish(); }
    else if (e.key === 'Backspace') { e.preventDefault(); undo(); }
    else if (e.key === 'Escape') { cancel(); }
  }

  function init(m, statusCb) {
    map = m; onUpdate = statusCb;
    loadMyLines();
    loadMemos();
    // 받은 노선 링크 (?ml=) — 저장하기 전까지는 이 화면에만. 지도는 노선에 맞춘다
    const got = typeof location !== 'undefined' ? parseShare(location.search) : null;
    if (got) {
      myLines.push(Object.assign({ id: 'shared-1', shared: true, stations: [] }, got));
      const xs = got.coords.map(c => c[0]), ys = got.coords.map(c => c[1]);
      const fit = () => { try { map.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 80, duration: 0, maxZoom: 14 }); } catch (e) { /* 무시 */ } };
      // 바로 맞추고, 아직 로드 전이면 로드 뒤 한 번 더. (map.loaded() 는 타일을 받는 중에도 false 라
      // 'load' 가 이미 지난 뒤에 once('load') 만 걸면 영영 안 맞춰졌다 — v153 전체 e2e share-line 실패, 2026-11-13)
      fit();
      if (!(map.loaded && map.loaded())) { map.once('load', fit); map.once('idle', fit); }
      setTimeout(() => setStatus('받은 노선 "' + got.name + '" — 사이드바 나의 노선에서 [저장]을 누르면 내 노선이 됩니다'), 1500);
    }
    map.on('click', e => onClick(e.lngLat));
    document.addEventListener('keydown', onKey);
    // 그리기 패널 ✕ 는 패널만 숨기는 게 아니라 그리기 자체를 끝낸다 (Esc 와 같게). 안 그러면 지도 클릭이 계속 점을 찍는다
    const dpClose = document.querySelector('#draw-panel .rp-close');
    if (dpClose) dpClose.addEventListener('click', () => { if (mode === 'draw') cancel(); });
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
        .setHTML(`<div style="max-width:200px"><b><i data-ic="pin"></i> 메모</b><br>${escapeHtml(f.properties.text)}</div>`)
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
    // 베이스맵 교체(setStyle) 시 커스텀 레이어가 날아가므로 복원.
    // setStyle 뒤에는 이전 소스가 이미 없다 — 소스 유무가 아니라 그리기 데이터(pts·myLines)를 기준으로 다시 그린다.
    if (map.getSource('draw-preview')) {
      map.removeLayer('draw-preview-pts'); map.removeLayer('draw-preview-line');
      map.removeSource('draw-preview');
    }
    if (mode || pts.length) {
      ensurePreview();
      refreshPreview(); // 현재 pts 기준 (그리는 중인 점, 완료된 측정선도 pts에 남아 있음)
    }
    if (map.getSource('mylines')) {
      MYLINE_LAYERS.forEach(id => { if (map.getLayer(id)) map.removeLayer(id); });
      map.removeSource('mylines');
    }
    if (myLines.length) refreshMyLines();
    // 메모 핀도 그리기 데이터(memos)로 다시 그린다 — 그린 노선과 같은 복원 경로 (IMPL9 건 6)
    if (map.getSource('memos')) { if (map.getLayer('memo-pins')) map.removeLayer('memo-pins'); map.removeSource('memos'); }
    if (memos.length) refreshMemos();
  }

  return { init, renderMyLineList, restyle, refreshMyLines, refreshMemos,
    Share: { encodePts, decodePts, shareQuery, parseShare, MAX: SHARE_MAX_URL },
    myLines: () => myLines.slice(),
    setStations: sts => { allStations = sts || []; } };
})();
