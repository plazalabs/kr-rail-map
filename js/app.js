/* 한국철도맵 v1 — 앱 셸: 베이스맵 3종 + 해시 상태 + 노선 토글 + 한/영 검색 */
'use strict';

const STYLES = {
  normal: 'https://tiles.openfreemap.org/styles/bright',
  dark: {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      carto: {
        type: 'raster',
        tiles: ['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
                'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
                'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'],
        tileSize: 256, maxzoom: 20,
        attribution: '© OpenStreetMap contributors © CARTO'
      }
    },
    layers: [{ id: 'carto', type: 'raster', source: 'carto' }]
  },
  satellite: {
    version: 8,
    sources: {
      esri: {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        maxzoom: 19,
        attribution: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics'
      }
    },
    layers: [{ id: 'esri', type: 'raster', source: 'esri' }]
  },
  gray: 'https://tiles.openfreemap.org/styles/bright' // 흑백은 bright + CSS grayscale 필터
};
const MODES = ['normal', 'satellite', 'gray'];

const THEMES = [
  { id: 'light', label: '라이트' }, { id: 'dark', label: '다크' },
  { id: 'eclipse', label: '이클립스' }, { id: 'pink', label: '핑크' },
  { id: 'neon', label: '네온' }, { id: 'hospital', label: '병원' },
  { id: 'win95', label: 'Win95' },
];
const DARK_THEMES = new Set(['dark', 'eclipse', 'neon']);

let theme = localStorage.getItem('krrail-theme') || 'light';
if (!THEMES.some(t => t.id === theme)) theme = 'light';

// 오프라인 QA용: ?style=local 이면 타일 없이 빈 배경 스타일 사용
const QA_LOCAL_STYLE = new URLSearchParams(location.search).get('style') === 'local'
  ? '/qa-style.json' : null;

function baseStyle() {
  const mode = modeFromHash();
  if (QA_LOCAL_STYLE && mode !== 'satellite') return QA_LOCAL_STYLE;
  if (mode === 'satellite') return STYLES.satellite;
  if (DARK_THEMES.has(theme)) return STYLES.dark;
  return STYLES.normal;
}

const map = new maplibregl.Map({
  container: 'map',
  style: STYLES.normal,
  center: [126.98, 37.52],
  zoom: 9.4,
  attributionControl: { compact: true },
  preserveDrawingBuffer: true // 이미지 저장용
});
map.addControl(new maplibregl.NavigationControl(), 'bottom-right');

let LINES = [], STATIONS = [];
let dataReady = false;
const visibleLines = new Set();

/* ---------- 지도 모드 + 테마 + 해시 ---------- */
function modeFromHash() {
  const h = location.hash.replace('#', '');
  return MODES.includes(h) ? h : 'normal';
}
let appliedStyleKey = null;
function styleKeyFor(mode, theme) {
  if (QA_LOCAL_STYLE && mode !== 'satellite') return 'qa-local';
  if (mode === 'satellite') return 'satellite';
  return DARK_THEMES.has(theme) ? 'dark' : 'bright';
}
function applyView() {
  const mode = modeFromHash();
  document.querySelectorAll('#toolbar [data-style]').forEach(b => {
    const on = b.dataset.style === mode;
    b.classList.toggle('active', on);
    // 눌린 상태를 스크린리더에도 알린다 (색으로만 구분되면 안 됨)
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  document.body.dataset.theme = theme;
  document.querySelectorAll('#theme-row .theme-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.theme === theme));
  // 동일 스타일 재적용은 스킵 (setStyle이 커스텀 레이어를 날리지만 style.load를 안 쏨)
  const key = styleKeyFor(mode, theme);
  if (key !== appliedStyleKey) {
    appliedStyleKey = key;
    map.setStyle(baseStyle());
  }
  document.getElementById('map').classList.toggle('grayscale', mode === 'gray');
  if (location.hash !== '#' + mode) history.replaceState(null, '', '#' + mode);
}
document.querySelectorAll('#toolbar [data-style]').forEach(b =>
  b.addEventListener('click', () => { history.replaceState(null, '', '#' + b.dataset.style); applyView(); }));
window.addEventListener('hashchange', applyView);

function renderThemes() {
  const row = document.getElementById('theme-row');
  row.innerHTML = '';
  THEMES.forEach(t => {
    const b = document.createElement('button');
    b.className = 'theme-btn' + (t.id === theme ? ' active' : '');
    b.dataset.theme = t.id;
    b.textContent = t.label;
    b.addEventListener('click', () => {
      theme = t.id;
      localStorage.setItem('krrail-theme', theme);
      applyView();
    });
    row.appendChild(b);
  });
}

/* ---------- 스모크 테스트용 임시 데이터 (실제 데이터 도착 전) ---------- */
const SMOKE_LINES = { type: 'FeatureCollection', features: [{
  type: 'Feature',
  properties: { id: 'smoke-1', name_ko: '스모크선(임시)', name_en: 'SMOKE (temp)', color: '#999999', category: 'etc' },
  geometry: { type: 'LineString', coordinates: [[127.0, 37.5], [127.03, 37.53], [127.06, 37.5]] }
}]};
const SMOKE_STATIONS = { type: 'FeatureCollection', features:
  [['가역1', 'GA-1', [127.0, 37.5]], ['가역2', 'GA-2', [127.03, 37.53]], ['가역3', 'GA-3', [127.06, 37.5]]]
    .map(([ko, en, c]) => ({
      type: 'Feature',
      properties: { id: 'smoke-' + en, name_ko: ko + ' (임시)', name_en: en, line_id: 'smoke-1', lines: ['smoke-1'] },
      geometry: { type: 'Point', coordinates: c }
    }))
};

/* ---------- 데이터 로드 ---------- */
const statusEl = document.getElementById('status');
function setStatus(msg) { statusEl.textContent = msg; }

async function loadData() {
  // 단일파일 빌드용 인라인 데이터 우선
  if (window.KRRAIL_INLINE) {
    LINES = window.KRRAIL_INLINE.lines.features;
    STATIONS = window.KRRAIL_INLINE.stations.features;
    setStatus(`노선 ${LINES.length}개 · 역 ${STATIONS.length}개 로드됨`);
    LINES.forEach(f => visibleLines.add(f.properties.id));
    return;
  }
  try {
    // ui.js 가 이미 띄워둔 요청을 그대로 기다린다 (중복 다운로드 방지)
    const [l, s] = await Promise.all([
      UI.loadGeoJSON('data/lines.geojson'),
      UI.loadGeoJSON('data/stations.geojson')
    ]);
    LINES = l.features; STATIONS = s.features;
    setStatus(`노선 ${LINES.length}개 · 역 ${STATIONS.length}개 로드됨`);
  } catch (e) {
    LINES = SMOKE_LINES.features; STATIONS = SMOKE_STATIONS.features;
    setStatus('실제 데이터 준비 중 — 스모크 테스트 데이터 표시');
  }
  LINES.forEach(f => visibleLines.add(f.properties.id));
}

function addDataLayers() {
  if (map.getSource('lines')) return; // 스타일 교체 후 중복 방지
  map.addSource('lines', { type: 'geojson', data: { type: 'FeatureCollection', features: LINES } });
  map.addLayer({
    id: 'rail-lines', type: 'line', source: 'lines',
    paint: {
      'line-color': ['coalesce', ['get', 'color'], '#888888'],
      'line-width': ['interpolate', ['linear'], ['zoom'], 7, 2.2, 12, 5, 16, 8],
      'line-opacity': 0.9
    }
  });
  // 노선 하이라이트 레이어 (사이드바 호버용)
  map.addSource('line-highlight', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: 'rail-lines-highlight', type: 'line', source: 'line-highlight',
    paint: {
      'line-color': ['coalesce', ['get', 'color'], '#ff0000'],
      'line-width': ['interpolate', ['linear'], ['zoom'], 7, 4, 12, 8, 16, 12],
      'line-opacity': 0.6
    }
  });
  // 내 위치 레이어
  map.addSource('my-location', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: 'my-location-dot', type: 'circle', source: 'my-location',
    paint: { 'circle-radius': 8, 'circle-color': '#4285f4', 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 }
  });
  map.addSource('stations', { type: 'geojson', data: { type: 'FeatureCollection', features: STATIONS } });
  map.addLayer({
    id: 'rail-stations', type: 'circle', source: 'stations',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 2, 13, 5],
      'circle-color': '#ffffff', 'circle-stroke-color': '#333333', 'circle-stroke-width': 1.2
    }
  });
  map.addLayer({
    id: 'station-labels', type: 'symbol', source: 'stations', minzoom: 11,
    layout: { 'text-field': ['get', 'name_ko'], 'text-size': 11, 'text-offset': [0, 1.2] },
    paint: { 'text-halo-color': '#ffffff', 'text-halo-width': 1 }
  });
}

function updateFilters() {
  const ids = [...visibleLines];
  const f = ['in', ['get', 'id'], ['literal', ids]];
  const sf = ['in', ['get', 'line_id'], ['literal', ids]];
  if (map.getLayer('rail-lines')) map.setFilter('rail-lines', f);
  if (map.getLayer('rail-stations')) map.setFilter('rail-stations', sf);
  if (map.getLayer('station-labels')) map.setFilter('station-labels', sf);
}

/* ---------- 노선 토글 UI ---------- */
const CAT_NAMES = { metro: '도시철도', urban: '광역·도시', ktx: 'KTX·고속', conventional: '일반철도', etc: '기타' };
function lineStats(lid) {
  const f = LINES.find(l => l.properties.id === lid);
  if (!f) return { km: 0, stations: 0 };
  // 길이: MultiLineString 은 조각별로 따로 더한다.
  // (조각을 이어붙여 계산하면 끊긴 구간 사이 거리까지 더해져 2배가 된다)
  let km = 0;
  const R = Math.PI / 180;
  const parts = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const flat of parts) {
    for (let i = 0; i < flat.length - 1; i++) {
      const [x1, y1] = flat[i], [x2, y2] = flat[i + 1];
      const dLat = (y2 - y1) * R, dLon = (x2 - x1) * R;
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(y1 * R) * Math.cos(y2 * R) * Math.sin(dLon / 2) ** 2;
      km += 6371 * 2 * Math.asin(Math.sqrt(h));
    }
  }
  // 역 수 (중복 제거)
  const seen = new Set();
  STATIONS.forEach(s => {
    if ((s.properties.lines || []).includes(lid)) seen.add(s.properties.name_ko);
  });
  return { km, stations: seen.size };
}

/* ---------- 표시 범위: 수도권 / 전국 ---------- */
const CAT_ORDER = ['metro', 'urban', 'ktx', 'conventional', 'etc'];
const METRO_BBOX = { minLng: 126.28, maxLng: 128.02, minLat: 36.88, maxLat: 38.36 };
let scope = 'metro';
let metroIds = new Set();

function inMetro(c) {
  return c[0] >= METRO_BBOX.minLng && c[0] <= METRO_BBOX.maxLng &&
         c[1] >= METRO_BBOX.minLat && c[1] <= METRO_BBOX.maxLat;
}
function computeMetroIds() {
  const ids = new Set();
  STATIONS.forEach(s => {
    if (!inMetro(s.geometry.coordinates)) return;
    (s.properties.lines || []).forEach(l => ids.add(l));
  });
  return ids;
}
function scopeLines() {
  if (scope === 'all') return LINES;
  return LINES.filter(f => metroIds.has(f.properties.id));
}

function setScope(mode, opts) {
  scope = mode;
  metroIds = computeMetroIds();
  document.querySelectorAll('.scope-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.scope === scope));
  visibleLines.clear();
  scopeLines().forEach(f => visibleLines.add(f.properties.id));
  renderLineList();
  updateFilters();
  const n = scopeLines().length;
  const sc = document.getElementById('scope-count');
  if (sc) sc.textContent = `${n}개 노선`;
  if (!opts || opts.fly !== false) {
    if (scope === 'metro') map.fitBounds([[126.28, 36.88], [128.02, 38.36]], { padding: 40, duration: 700 });
    else map.fitBounds([[125.9, 33.0], [129.6, 38.6]], { padding: 40, duration: 700 });
  }
}
document.querySelectorAll('.scope-btn').forEach(b =>
  b.addEventListener('click', () => setScope(b.dataset.scope)));
window.setScope = setScope;

function renderLineList() {
  const box = document.getElementById('line-list');
  box.innerHTML = '';
  const lines = scopeLines();
  const groups = {};
  lines.forEach(f => {
    const c = f.properties.category || 'etc';
    (groups[c] = groups[c] || []).push(f);
  });
  Object.keys(groups).sort((a, b) => {
    const ia = CAT_ORDER.indexOf(a), ib = CAT_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  }).forEach(cat => {
    const det = document.createElement('details'); det.open = true;
    const sum = document.createElement('summary');
    sum.textContent = `${CAT_NAMES[cat] || cat} (${groups[cat].length})`;
    det.appendChild(sum);
    groups[cat]
      .sort((a, b) => (a.properties.name_ko || '').localeCompare(b.properties.name_ko || '', 'ko', { numeric: true }))
      .forEach(f => {
        const p = f.properties;
        const label = document.createElement('label');
        label.className = 'line-item';
        label.dataset.lineId = p.id;
        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.checked = visibleLines.has(p.id);
        cb.addEventListener('change', () => {
          cb.checked ? visibleLines.add(p.id) : visibleLines.delete(p.id);
          updateFilters();
        });
        const sw = document.createElement('span');
        sw.className = 'swatch'; sw.style.background = p.color || '#888888';
        const st = lineStats(p.id);
        const info = document.createElement('span');
        info.className = 'line-meta';
        info.textContent = `${st.km.toFixed(1)}km · ${st.stations}역`;
        label.append(cb, sw, document.createTextNode(p.name_ko || p.id), info);
        if (p.note) label.title = p.note;
        if (p.status !== 'open') label.title = (label.title ? label.title + ' / ' : '') +
          (p.status === 'construction' ? '공사 중' : '계획 중');
        label.addEventListener('mouseenter', () => highlightLine(p.id));
        label.addEventListener('mouseleave', () => highlightLine(null));
        det.appendChild(label);
      });
    box.appendChild(det);
  });
  document.getElementById('line-count').textContent = `(${lines.length})`;
}

/* ?line=<id> 로 특정 노선만 보기 */
function focusLineFromUrl() {
  const lid = new URLSearchParams(location.search).get('line');
  if (!lid) return false;
  const f = LINES.find(l => l.properties.id === lid);
  if (!f) return false;
  setScope('all', { fly: false });
  visibleLines.clear();
  visibleLines.add(lid);
  document.querySelectorAll('#line-list .line-item').forEach(l => {
    const cb = l.querySelector('input');
    if (cb) cb.checked = l.dataset.lineId === lid;
  });
  updateFilters();
  const b = new maplibregl.LngLatBounds();
  const parts = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
  parts.forEach(part => part.forEach(c => b.extend(c)));
  map.fitBounds(b, { padding: 60, duration: 0 });
  setStatus(`${f.properties.name_ko} 노선만 표시 중 · 범위 버튼으로 전체 보기`);
  return true;
}

/* ---------- 검색 (한/영) ---------- */
const searchInput = document.getElementById('search');
const searchBox = document.getElementById('search-results');
searchInput.addEventListener('input', () => {
  const raw = searchInput.value.trim();
  const q = raw.toLowerCase();
  searchBox.innerHTML = '';
  if (!q) return;
  const hits = STATIONS.filter(f => {
    const p = f.properties;
    return (p.name_ko || '').includes(raw) || (p.name_en || '').toLowerCase().includes(q);
  }).slice(0, 30);
  hits.forEach(f => {
    const d = document.createElement('div');
    d.className = 'hit';
    d.textContent = `${f.properties.name_ko}${f.properties.name_en ? ' (' + f.properties.name_en + ')' : ''}`;
    d.addEventListener('click', () => {
      const c = f.geometry.coordinates;
      map.flyTo({ center: c, zoom: 14 });
      searchBox.innerHTML = '';
      searchInput.blur();
      // 역 상세 팝업까지 열어준다
      setTimeout(() => openStationPopup(f, { lng: c[0], lat: c[1] }), 720);
    });
    searchBox.appendChild(d);
  });
});
document.addEventListener('keydown', e => {
  if (e.key === '/' && document.activeElement !== searchInput) {
    e.preventDefault(); searchInput.focus();
  }
});

/* ---------- 이미지 저장 ---------- */
document.getElementById('save-btn').addEventListener('click', () => {
  map.getCanvas().toBlob(blob => {
    if (!blob) { setStatus('이미지 저장에 실패했습니다'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '한국철도맵.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    setStatus('이미지 저장됨');
  }, 'image/png');
});

/* ---------- 링크 공유 ---------- */
document.getElementById('share-btn').addEventListener('click', async () => {
  try {
    const url = new URL(location.href);
    // 길찾기 상태 포함
    const from = document.getElementById('route-from').value.trim();
    const to = document.getElementById('route-to').value.trim();
    if (from) url.searchParams.set('from', from); else url.searchParams.delete('from');
    if (to) url.searchParams.set('to', to); else url.searchParams.delete('to');
    // 지도 중심/줌 포함
    const c = map.getCenter(), z = map.getZoom();
    url.searchParams.set('c', `${c.lng.toFixed(5)},${c.lat.toFixed(5)},${z.toFixed(1)}`);
    await navigator.clipboard.writeText(url.toString());
    setStatus('링크 복사됨' + (from && to ? ` (${from}→${to} 포함)` : ''));
  } catch { setStatus('링크 복사에 실패했습니다'); }
});

// URL 파라미터로 길찾기 복원
function restoreFromUrl() {
  const q = new URLSearchParams(location.search);
  const from = q.get('from'), to = q.get('to');
  if (from || to) {
    document.getElementById('route-panel').hidden = false;
    if (from) document.getElementById('route-from').value = from;
    if (to) document.getElementById('route-to').value = to;
    if (from && to) setTimeout(() => document.getElementById('route-go').click(), 800);
  }
  const c = q.get('c');
  if (c) {
    const [lng, lat, z] = c.split(',').map(Number);
    if (lng && lat) map.flyTo({ center: [lng, lat], zoom: z || 11, duration: 0 });
  }
}

/* ---------- 길찾기 UI ---------- */
const lineNameOf = new Map();
function setupRouteFinder() {
  LINES.forEach(f => lineNameOf.set(f.properties.id, f.properties.name_ko));
  const info = RouteFinder.buildGraph(LINES, STATIONS);
  console.log('route graph:', info);
  attachAutocomplete(document.getElementById('route-from'));
  attachAutocomplete(document.getElementById('route-to'));
}
/* 커스텀 자동완성: 입력 중 매칭 역 목록 표시 */
function attachAutocomplete(input) {
  const list = input.parentElement.querySelector('.ac-list');
  // 스크린리더에 '콤보박스 + 목록'이라고 알려준다.
  // 목록 항목은 option, 지금 강조된 항목은 aria-activedescendant 로 가리킨다.
  const listId = (input.id || 'ac') + '-list';
  list.id = listId;
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', input.id === 'route-to' ? '도착역 후보' : '출발역 후보');
  input.setAttribute('aria-controls', listId);
  let items = [], activeIdx = -1;
  function setExpanded(v) { input.setAttribute('aria-expanded', v ? 'true' : 'false'); }
  function hide() {
    list.hidden = true; activeIdx = -1;
    setExpanded(false);
    input.removeAttribute('aria-activedescendant');
  }
  function render(q) {
    const seen = new Set();
    items = [];
    for (const s of STATIONS) {
      const n = s.properties.name_ko;
      if (seen.has(n)) continue;
      if (!n.includes(q)) continue;
      seen.add(n);
      // 시작 매칭 우선
      items.push({ name: n, lines: s.properties.lines || [], starts: n.startsWith(q) });
      if (items.length >= 60) break;
    }
    items.sort((a, b) => (b.starts - a.starts));
    items = items.slice(0, 8);
    if (!items.length) { hide(); return; }
    list.innerHTML = items.map((it, i) => {
      const ln = it.lines.map(lid => lineNameOf.get(lid) || lid).slice(0, 3).join('·');
      return '<div class="ac-item" role="option" aria-selected="false" id="' + listId + '-o' + i +
        '" data-i="' + i + '">' + it.name +
        (ln ? '<span class="ac-lines">' + ln + '</span>' : '') + '</div>';
    }).join('');
    list.hidden = false;
    activeIdx = -1;
    setExpanded(true);
  }
  function highlight() {
    list.querySelectorAll('.ac-item').forEach((el, i) => {
      const on = i === activeIdx;
      el.classList.toggle('active', on);
      el.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (activeIdx >= 0) input.setAttribute('aria-activedescendant', listId + '-o' + activeIdx);
    else input.removeAttribute('aria-activedescendant');
  }
  input.addEventListener('input', () => {
    const q = input.value.trim();
    if (!q) { hide(); return; }
    render(q);
  });
  input.addEventListener('focus', () => {
    const q = input.value.trim();
    if (q) render(q);
  });
  input.addEventListener('blur', () => setTimeout(hide, 180));
  input.addEventListener('keydown', e => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      activeIdx = e.key === 'ArrowDown'
        ? Math.min(activeIdx + 1, items.length - 1)
        : Math.max(activeIdx - 1, 0);
      highlight();
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault();
      input.value = items[activeIdx].name;
      hide();
    } else if (e.key === 'Escape') { hide(); }
  });
  list.addEventListener('mousedown', e => {
    const el = e.target.closest('.ac-item');
    if (!el) return;
    e.preventDefault();
    input.value = items[+el.dataset.i].name;
    hide();
    input.focus();
  });
}
/* 사이드바 토글 */
document.getElementById('sidebar-toggle').addEventListener('click', () => {
  const hidden = document.body.classList.toggle('sidebar-hidden');
  document.getElementById('sidebar-toggle').textContent = hidden ? '▶' : '◀';
  document.getElementById('sidebar-toggle').title = hidden ? '사이드바 펼치기' : '사이드바 접기';
  if (window.map) setTimeout(() => map.resize(), 50);
});
function resolveStation(name) {
  name = (name || '').trim();
  return STATIONS.find(s => s.properties.name_ko === name) || null;
}
document.getElementById('route-btn').addEventListener('click', () => {
  const p = document.getElementById('route-panel');
  p.hidden = !p.hidden;
});
document.getElementById('route-close').addEventListener('click', () => {
  document.getElementById('route-panel').hidden = true;
});
document.getElementById('route-swap').addEventListener('click', () => {
  const a = document.getElementById('route-from'), b = document.getElementById('route-to');
  [a.value, b.value] = [b.value, a.value];
});
document.getElementById('route-save').addEventListener('click', () => {
  const from = document.getElementById('route-from').value.trim();
  const to = document.getElementById('route-to').value.trim();
  if (!from || !to) { setStatus('출발역과 도착역을 입력하세요.'); return; }
  const exists = favorites.routes.some(r => r.from === from && r.to === to);
  if (exists) { setStatus('이미 저장된 경로입니다.'); return; }
  favorites.routes.push({ from, to });
  saveFavorites(); renderFavorites();
  setStatus(`⭐ 경로 저장됨: ${from} → ${to}`);
});
document.getElementById('route-go').addEventListener('click', () => {
  const box = document.getElementById('route-result');
  const from = resolveStation(document.getElementById('route-from').value);
  const to = resolveStation(document.getElementById('route-to').value);
  if (!from || !to) { box.innerHTML = '출발역과 도착역을 목록에서 선택해주세요.'; return; }
  // 3종 비교 모듈이 있으면 사용, 없으면 기존 단일 경로
  if (typeof RouteCompare !== 'undefined') {
    RouteCompare.show(from.properties.id, to.properties.id);
    return;
  }
  const r = RouteFinder.findRoute(from.properties.id, to.properties.id);
  if (!r) { box.innerHTML = '경로를 찾을 수 없습니다.'; return; }
  const sname = id => {
    const s = STATIONS.find(x => x.properties.id === id);
    return s ? s.properties.name_ko : id;
  };
  // 요금 계산 (수도권 전철 기준, 2024년 인상 후)
  function calcFare(distKm) {
    let fare = 1400; // 기본 10km
    if (distKm > 10) {
      const extra1 = Math.min(distKm - 10, 40); // 10~50km
      fare += Math.ceil(extra1 / 5) * 100;
    }
    if (distKm > 50) {
      fare += Math.ceil((distKm - 50) / 8) * 100;
    }
    return fare;
  }
  // 경로 거리 계산 (역 좌표 기반)
  function routeDistance(path) {
    let km = 0;
    const R = Math.PI / 180;
    const coordOf = id => {
      const s = STATIONS.find(x => x.properties.id === id);
      return s ? s.geometry.coordinates : null;
    };
    for (let i = 0; i < path.length - 1; i++) {
      const c1 = coordOf(path[i]), c2 = coordOf(path[i+1]);
      if (!c1 || !c2) continue;
      const dLat = (c2[1]-c1[1])*R, dLon = (c2[0]-c1[0])*R;
      const h = Math.sin(dLat/2)**2 + Math.cos(c1[1]*R)*Math.cos(c2[1]*R)*Math.sin(dLon/2)**2;
      km += 6371 * 2 * Math.asin(Math.sqrt(h));
    }
    return km;
  }

  let html = `<div class="total">총 약 ${r.minutes}분 · 환승 ${r.transfers}회`;
  const distKm = routeDistance(r.path);
  const fare = calcFare(distKm);
  html += ` · 예상 요금 ${fare.toLocaleString()}원</div>`;
  // 미개통 노선을 지나는 경로는 명시적으로 알린다.
  // (이 지도는 착공·계획 노선까지 그리므로, 지금 갈 수 있는 길로 오해하면 안 된다)
  if (r.unopenedLines && r.unopenedLines.length) {
    const names = r.unopenedLines.map(id => lineNameOf.get(id) || id).join(', ');
    html += `<div class="unopened-notice">⚠ 미개통 구간 포함 — ${names}
      <span class="unopened-sub">개통 전이므로 실제로는 이용할 수 없습니다.</span></div>`;
  }
  r.legs.forEach(leg => {
    const a = sname(leg.from), b = sname(leg.to);
    const i1 = r.path.indexOf(leg.from), i2 = r.path.indexOf(leg.to);
    const n = Math.abs(i2 - i1);
    if (leg.walk || !leg.lineId) {
      html += a === b
        ? `<div class="leg">🚶 ${a}역 내 환승 (도보 이동)</div>`
        : `<div class="leg">🚶 ${a} → ${b} (도보 이동)</div>`;
    } else {
      const ln = lineNameOf.get(leg.lineId) || leg.lineId;
      const lineColor = (LINES.find(l => l.properties.id === leg.lineId)?.properties.color) || '#888';
      const badge = leg.unopened ? ` <span class="badge-unopened">미개통</span>` : '';
      // 경유역 목록 (네이버 스타일: 세로 타임라인, 전부 표시)
      const segStations = [];
      const step = i2 > i1 ? 1 : -1;
      for (let i = i1; i !== i2; i += step) segStations.push({ id: r.path[i], name: sname(r.path[i]) });
      segStations.push({ id: r.path[i2], name: sname(r.path[i2]) });
      html += `<div class="leg${leg.unopened ? ' leg-unopened' : ''}" style="border-left: 4px solid ${lineColor}; padding-left: 8px; margin: 8px 0;">
        <div class="leg-header"><b>${a}</b> → <b style="color:${lineColor}">${ln}</b>${badge} → <b>${b}</b> (${n}개역)</div>
        <div class="station-timeline">` +
        segStations.map((s, idx) => {
          const isFirst = idx === 0, isLast = idx === segStations.length - 1;
          const dot = isFirst || isLast
            ? `<span class="st-dot start-end" style="background:${lineColor}"></span>`
            : `<span class="st-dot"></span>`;
          const label = isFirst ? '출발' : isLast ? '도착' : `${idx}번째`;
          return `<div class="st-row">${dot}<span class="st-name">${s.name}</span><span class="st-label">${label}</span></div>`;
        }).join('') +
        `</div></div>`;
    }
  });
  box.innerHTML = html;
  // 경로 하이라이트: 해당 경로 역만 밝게, 나머지는 어둡게
  highlightRoute(r.path, r.legs);
  // (경유역은 이제 항상 표시되므로 토글 불필요)
});

/* ---------- 경로 하이라이트 ----------
 * 경로에 쓰인 구간만 노선 색으로 그리고, 나머지 노선은 모두 숨긴다.
 * (예전에는 노선의 전체 선형을 그려서 GTX-C 가 수원까지 이어져 보였다)
 */
let routeLabelMarkers = [];

// 노선 선형에서 두 역 사이 구간만 잘라낸다 (경로가 실제 선로를 따라가도록)
function sliceLineCoords(feature, a, b) {
  if (!feature || !feature.geometry) return null;
  const parts = feature.geometry.type === 'LineString'
    ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  const d2 = (p, q) => {
    const dx = (p[0] - q[0]) * 88, dy = (p[1] - q[1]) * 111;
    return dx * dx + dy * dy;
  };
  let best = null;
  for (const part of parts) {
    if (part.length < 2) continue;
    let ia = 0, ib = 0, da = Infinity, db = Infinity;
    for (let i = 0; i < part.length; i++) {
      const x = d2(part[i], a); if (x < da) { da = x; ia = i; }
      const y = d2(part[i], b); if (y < db) { db = y; ib = i; }
    }
    const score = da + db;
    if (!best || score < best.score) best = { part, ia, ib, score };
  }
  if (!best || best.ia === best.ib) return null;
  const { part, ia, ib } = best;
  const seg = ia < ib ? part.slice(ia, ib + 1) : part.slice(ib, ia + 1).reverse();
  if (seg.length < 2) return null;
  // 역 좌표와 선형 끝점이 어긋나면 이어준다
  const out = seg.slice();
  if (d2(out[0], a) > 4) out.unshift(a);
  if (d2(out[out.length - 1], b) > 4) out.push(b);
  return out;
}

function routeLineInfo(lineId) {
  const l = LINES.find(x => x.properties.id === lineId);
  return {
    color: (l && l.properties.color) || '#8a8f98',
    name: (l && l.properties.name_ko) || '도보',
    walk: !lineId,
  };
}

function highlightRoute(path, legs) {
  if (!map || !path || !path.length) return;
  clearRouteHighlight();
  if (typeof closeStationPopup === 'function') closeStationPopup();

  // 배경 지도에 그려진 철도·역 심볼까지 숨긴다
  (map.getStyle().layers || []).forEach(l => {
    if (/railway/.test(l.id) && l.id !== 'rail-lines' && l.id !== 'rail-stations') {
      try { map.setLayoutProperty(l.id, 'visibility', 'none'); } catch (e) {}
    }
  });

  const pathSet = new Set(path);
  // 노선 레이어는 전부 숨기고, 경로만 따로 그린다
  if (map.getLayer('rail-lines')) map.setPaintProperty('rail-lines', 'line-opacity', 0);
  if (map.getLayer('rail-stations')) {
    const only = ['case', ['in', ['get', 'id'], ['literal', [...pathSet]]], 1, 0];
    map.setPaintProperty('rail-stations', 'circle-opacity', only);
    map.setPaintProperty('rail-stations', 'circle-stroke-opacity', only);
  }
  if (map.getLayer('station-labels')) {
    map.setFilter('station-labels', ['in', ['get', 'id'], ['literal', [...pathSet]]]);
    map.setPaintProperty('station-labels', 'text-opacity', 1);
  }

  const coordOf = id => {
    const s = STATIONS.find(x => x.properties.id === id);
    return s ? s.geometry.coordinates : null;
  };
  const coords = path.map(coordOf).filter(Boolean);
  if (coords.length < 2) return;

  // 구간(leg)별 좌표와 노선 색
  const segs = [];
  let start = 0;
  (legs || []).forEach(leg => {
    let end = path.indexOf(leg.to, start);
    if (end < 0) end = start;
    if (end <= start) return;
    const a = coordOf(path[start]);
    const b = coordOf(path[end]);
    const line = LINES.find(x => x.properties.id === leg.lineId);
    // 실제 선로 선형을 따라 자른다. 실패하면 역끼리 직선으로 잇는다.
    let segCoords = (line && a && b) ? sliceLineCoords(line, a, b) : null;
    if (!segCoords) {
      segCoords = [];
      for (let i = start; i <= end; i++) {
        const c = coordOf(path[i]);
        if (c) segCoords.push(c);
      }
    }
    const info = routeLineInfo(leg.lineId);
    if (segCoords.length >= 2) {
      segs.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: segCoords },
        properties: { color: info.color, name: info.name, walk: info.walk ? 1 : 0 },
      });
    }
    start = end;
  });
  if (!segs.length) {
    segs.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords },
      properties: { color: '#e23b3b', name: '', walk: 0 },
    });
  }

  // 흰 테두리 — 구간 좌표를 이어 붙여 색 선과 정확히 겹치게 한다.
  // (역 좌표만 이으면 직선이 되어 색 선과 어긋난다)
  const casingCoords = [];
  segs.forEach(sg => {
    const c = sg.geometry.coordinates;
    if (!casingCoords.length) casingCoords.push(...c);
    else casingCoords.push(...c.slice(1));
  });
  map.addSource('route-casing', {
    type: 'geojson',
    data: {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: casingCoords.length >= 2 ? casingCoords : coords },
      properties: {},
    },
  });
  map.addLayer({
    id: 'route-casing', type: 'line', source: 'route-casing',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#ffffff',
      'line-width': ['interpolate', ['linear'], ['zoom'], 8, 7, 14, 12.5, 17, 17.5],
    },
  });

  // 구간별 노선 색
  map.addSource('route-segments', { type: 'geojson', data: { type: 'FeatureCollection', features: segs } });
  // dasharray 에 [1,0] 을 주면 선이 그려지지 않는다. 도보/노선을 레이어로 분리한다.
  map.addLayer({
    id: 'route-highlight-line', type: 'line', source: 'route-segments',
    filter: ['!=', ['get', 'walk'], 1],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['interpolate', ['linear'], ['zoom'], 8, 5, 14, 9.5, 17, 14],
    },
  });
  map.addLayer({
    id: 'route-highlight-walk', type: 'line', source: 'route-segments',
    filter: ['==', ['get', 'walk'], 1],
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['interpolate', ['linear'], ['zoom'], 8, 4, 14, 6, 17, 8],
      'line-dasharray': [2, 2],
    },
  });

  // 역 점
  map.addSource('route-highlight', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: coords.map(c => ({ type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties: {} })) },
  });
  map.addLayer({
    id: 'route-highlight-stations', type: 'circle', source: 'route-highlight',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 4, 14, 7, 17, 9],
      'circle-color': '#ffffff',
      'circle-stroke-color': '#1b1f24',
      'circle-stroke-width': 2.2,
    },
  });

  // 역 이름 마커 — 배지 색은 그 역에 도착하는 구간의 노선 색
  const colorAt = i => {
    let acc = 0;
    for (const leg of (legs || [])) {
      const toIdx = path.indexOf(leg.to, acc);
      if (toIdx < 0) continue;
      if (i <= toIdx) return routeLineInfo(leg.lineId).color;
      acc = toIdx;
    }
    return (legs && legs.length) ? routeLineInfo(legs[legs.length - 1].lineId).color : '#e23b3b';
  };
  path.forEach((id, i) => {
    const c = coordOf(id);
    const st = STATIONS.find(x => x.properties.id === id);
    if (!c || !st) return;
    const el = document.createElement('div');
    el.className = 'rt-label' + (i === path.length - 1 ? ' is-end' : '');
    const badge = document.createElement('span');
    badge.className = 'rt-label-n';
    badge.textContent = String(i + 1);
    badge.style.background = i === 0 ? routeLineInfo((legs && legs[0] && legs[0].lineId) || '').color : colorAt(i);
    const nm = document.createElement('span');
    nm.textContent = st.properties.name_ko;
    el.append(badge, nm);
    try {
      routeLabelMarkers.push(new maplibregl.Marker({ element: el, offset: [0, -16], anchor: 'bottom' })
        .setLngLat(c).addTo(map));
    } catch (e) {}
  });

  // 범례 — 어떤 구간이 무슨 노선인지
  const seen = [];
  segs.forEach(sg => {
    if (sg.properties.walk || !sg.properties.name) return;
    if (seen.some(x => x.name === sg.properties.name)) return;
    seen.push({ name: sg.properties.name, color: sg.properties.color });
  });
  if (seen.length) {
    const host = document.getElementById('map-wrap');
    const legend = document.createElement('div');
    legend.className = 'route-legend';
    legend.id = 'route-legend';
    legend.innerHTML = seen.map(x =>
      '<span><i style="background:' + x.color + '"></i>' + x.name + '</span>').join('');
    if (host) host.appendChild(legend);
  }

  const bounds = coords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
  map.fitBounds(bounds, { padding: { top: 115, bottom: 85, left: 70, right: 330 }, maxZoom: 12.2 });
}

// 하이라이트 제거 (원래대로)
function clearRouteHighlight() {
  if (!map) return;
  ['route-highlight-labels', 'route-highlight-walk', 'route-highlight-stations', 'route-highlight-line', 'route-casing'].forEach(id => {
    if (map.getLayer(id)) map.removeLayer(id);
  });
  ['route-highlight', 'route-highlight-labels', 'route-casing', 'route-segments'].forEach(id => {
    if (map.getSource(id)) map.removeSource(id);
  });
  const lg = document.getElementById('route-legend');
  if (lg) lg.remove();
  while (routeLabelMarkers.length) {
    const mk = routeLabelMarkers.pop();
    try { mk.remove(); } catch (e) {}
  }
  if (map.getLayer('rail-lines')) map.setPaintProperty('rail-lines', 'line-opacity', 0.9);
  if (map.getLayer('rail-stations')) {
    map.setPaintProperty('rail-stations', 'circle-opacity', 1);
    map.setPaintProperty('rail-stations', 'circle-stroke-opacity', 1);
  }
  if (map.getLayer('station-labels')) map.setPaintProperty('station-labels', 'text-opacity', 1);
  // 배경 지도의 철도 레이어 복구
  try {
    (map.getStyle().layers || []).forEach(l => {
      if (/railway/.test(l.id) && l.id !== 'rail-lines' && l.id !== 'rail-stations') {
        map.setLayoutProperty(l.id, 'visibility', 'visible');
      }
    });
  } catch (e) {}
  // 라벨 필터를 원래(보이는 노선)로 되돌린다
  if (map.getLayer('station-labels') && typeof updateFilters === 'function') updateFilters();
}
window.clearRouteHighlight = clearRouteHighlight;
window.highlightRoute = highlightRoute;

/* ---------- 시작 ---------- */
renderThemes();
applyView();
DrawTools.init(map, setStatus);
// 데이터는 지도 타일과 병렬로 받고, 도착하는 즉시 사이드바를 그린다.
// (지도 load 를 기다리면 타일이 느릴 때 첫 화면이 수 초 늦어진다)
const dataPromise = loadData().then(() => {
  metroIds = computeMetroIds();
  // 기본 표시 범위(수도권)만 지도에 남긴다
  visibleLines.clear();
  scopeLines().forEach(f => visibleLines.add(f.properties.id));
  renderLineList();
  const sc = document.getElementById('scope-count');
  if (sc) sc.textContent = scopeLines().length + '개 노선';
  setupRouteFinder();
});
map.on('load', async () => {
  await dataPromise;
  dataReady = true;
  addDataLayers(); updateFilters();
  DrawTools.setStations(STATIONS);
  DrawTools.refreshMyLines(); DrawTools.renderMyLineList();
  DrawTools.refreshMemos();
  loadFavorites(); renderFavorites();
  // 새 모듈 초기화
  if (typeof DiagramMode !== 'undefined') DiagramMode.init(map, LINES, STATIONS);
  if (typeof StationDetail !== 'undefined') {
    StationDetail.init(map, LINES, STATIONS);
    // 역 상세 패널의 액션 버튼 연동
    StationDetail.onAction = (action, stationName) => {
      if (action === 'from' || action === 'to') {
        document.getElementById(action === 'from' ? 'route-from' : 'route-to').value = stationName;
        document.getElementById('route-panel').hidden = false;
      } else if (action === 'fav') {
        toggleFavStation(stationName);
      }
    };
  }
  if (typeof LineCompare !== 'undefined') LineCompare.init(LINES, STATIONS);
  if (typeof RailStats !== 'undefined') RailStats.init(LINES, STATIONS);
  if (typeof RailTimeline !== 'undefined') {
    RailTimeline.init(LINES, STATIONS);
    RailTimeline.onSelect = (lineId) => highlightLine(lineId);
  }
  if (typeof RouteCompare !== 'undefined') RouteCompare.init(RouteFinder, STATIONS, LINES);
  if (typeof InvestAnalyzer !== 'undefined') InvestAnalyzer.init(map, STATIONS, LINES);
  if (typeof CoverageMap !== 'undefined') CoverageMap.init(map, STATIONS, LINES);
  if (!focusLineFromUrl()) restoreFromUrl();
});
// 베이스맵 교체(setStyle) 시 커스텀 레이어가 날아가므로 복원
function restoreCustomLayers() {
  if (dataReady && map.isStyleLoaded() && !map.getSource('lines')) {
    addDataLayers(); updateFilters(); DrawTools.restyle();
  }
}
map.on('style.load', restoreCustomLayers);
map.on('styledata', restoreCustomLayers); // 동일 스타일 재적용 등 style.load 미발화 대비 안전망

/* ---------- 노선 하이라이트 ---------- */
function highlightLine(lineId) {
  if (!map.getSource('line-highlight')) return;
  if (!lineId) {
    map.getSource('line-highlight').setData({ type: 'FeatureCollection', features: [] });
    return;
  }
  const f = LINES.find(l => l.properties.id === lineId);
  if (f) map.getSource('line-highlight').setData({ type: 'FeatureCollection', features: [f] });
}

/* ---------- 내 위치 ---------- */
document.getElementById('locate-btn').addEventListener('click', () => {
  if (!navigator.geolocation) { setStatus('위치 정보를 지원하지 않는 브라우저입니다.'); return; }
  setStatus('위치 확인 중…');
  navigator.geolocation.getCurrentPosition(pos => {
    const lng = pos.coords.longitude, lat = pos.coords.latitude;
    // 내 위치 표시
    if (map.getSource('my-location')) {
      map.getSource('my-location').setData({ type: 'FeatureCollection', features: [{
        type: 'Feature', properties: {},
        geometry: { type: 'Point', coordinates: [lng, lat] }
      }]});
    }
    // 가장 가까운 역 찾기
    let best = null, bestD = Infinity;
    const R = Math.PI / 180;
    STATIONS.forEach(s => {
      const [slng, slat] = s.geometry.coordinates;
      const dLat = (slat - lat) * R, dLon = (slng - lng) * R;
      const h = Math.sin(dLat/2)**2 + Math.cos(lat*R)*Math.cos(slat*R)*Math.sin(dLon/2)**2;
      const d = 6371 * 2 * Math.asin(Math.sqrt(h));
      if (d < bestD) { bestD = d; best = s; }
    });
    map.flyTo({ center: [lng, lat], zoom: 14, duration: 1000 });
    if (best) {
      const nm = best.properties.name_ko;
      const lns = (best.properties.lines || []).map(lid => lineNameOf.get(lid) || lid).join('·');
      setStatus(`내 위치: 가장 가까운 역은 ${nm} (${bestD.toFixed(1)}km${lns ? ' · ' + lns : ''})`);
    } else setStatus('내 위치로 이동했습니다.');
  }, err => {
    setStatus('위치를 가져올 수 없습니다: ' + (err.message || '권한 거부'));
  }, { enableHighAccuracy: true, timeout: 10000 });
});

/* ---------- 즐겨찾기 ---------- */
const FAV_KEY = 'kr-rail-map-favorites-v1';
let favorites = { stations: [], routes: [] };
function loadFavorites() {
  try { favorites = JSON.parse(localStorage.getItem(FAV_KEY) || '{"stations":[],"routes":[]}'); } catch {}
  if (!favorites.stations) favorites.stations = [];
  if (!favorites.routes) favorites.routes = [];
}
function saveFavorites() {
  try { localStorage.setItem(FAV_KEY, JSON.stringify(favorites)); } catch {}
}
function isFavStation(name) { return favorites.stations.includes(name); }
function toggleFavStation(name) {
  const i = favorites.stations.indexOf(name);
  if (i >= 0) favorites.stations.splice(i, 1);
  else favorites.stations.push(name);
  saveFavorites(); renderFavorites();
}
function renderFavorites() {
  const box = document.getElementById('fav-list');
  if (!box) return;
  box.innerHTML = '';
  if (favorites.stations.length) {
    const h = document.createElement('div'); h.className = 'panel-head'; h.textContent = '⭐ 즐겨찾는 역';
    box.appendChild(h);
    favorites.stations.forEach(name => {
      const div = document.createElement('div'); div.className = 'fav-item';
      div.textContent = name;
      div.onclick = () => {
        const s = STATIONS.find(x => x.properties.name_ko === name);
        if (s) {
          map.flyTo({ center: s.geometry.coordinates, zoom: 14 });
          openStationPopup(s, { lng: s.geometry.coordinates[0], lat: s.geometry.coordinates[1] });
        }
      };
      const del = document.createElement('button'); del.textContent = '✕'; del.className = 'memo-del';
      del.onclick = (e) => { e.stopPropagation(); toggleFavStation(name); };
      div.appendChild(del); box.appendChild(div);
    });
  }
  if (favorites.routes.length) {
    const h = document.createElement('div'); h.className = 'panel-head'; h.textContent = '⭐ 저장된 경로';
    box.appendChild(h);
    favorites.routes.forEach((r, i) => {
      const div = document.createElement('div'); div.className = 'fav-item';
      div.textContent = `${r.from} → ${r.to}`;
      div.onclick = () => {
        document.getElementById('route-panel').hidden = false;
        document.getElementById('route-from').value = r.from;
        document.getElementById('route-to').value = r.to;
        document.getElementById('route-go').click();
      };
      const del = document.createElement('button'); del.textContent = '✕'; del.className = 'memo-del';
      del.onclick = (e) => { e.stopPropagation(); favorites.routes.splice(i, 1); saveFavorites(); renderFavorites(); };
      div.appendChild(del); box.appendChild(div);
    });
  }
  if (!favorites.stations.length && !favorites.routes.length) {
    box.innerHTML = '<p class="empty">역 팝업의 ⭐ 버튼으로 즐겨찾기를 추가하세요</p>';
  }
}

/* ---------- 역 클릭 팝업: 출발지/도착지 지정 ---------- */
let stationPopup = null;
function closeStationPopup() {
  if (stationPopup) { stationPopup.remove(); stationPopup = null; }
}
function openStationPopup(feature, lngLat) {
  closeStationPopup();
  const p = feature.properties;
  const sname = p.name_ko;
  // STATIONS 원본에서 찾기 (MapLibre feature properties는 배열이 문자열화될 수 있음)
  const orig = STATIONS.find(s => s.properties.id === p.id);
  const lineIds = orig ? (orig.properties.lines || []) : [];
  const nameEn = orig ? (orig.properties.name_en || '') : '';
  // 노선별 색상 도트와 함께 표시
  const lineHtml = lineIds.length ? lineIds.map(lid => {
    const ln = LINES.find(l => l.properties.id === lid);
    const nm = lineNameOf.get(lid) || lid;
    const col = ln ? (ln.properties.color || '#888') : '#888';
    const st = ln && ln.properties.status !== 'open' ?
      (ln.properties.status === 'construction' ? ' (공사중)' : ' (계획)') : '';
    return `<span class="st-line"><span class="dot" style="background:${col}"></span>${nm}${st}</span>`;
  }).join('') : '노선 정보 없음';
  const el = document.createElement('div');
  el.className = 'st-popup';
  el.innerHTML =
    '<div class="st-name">' + sname + (nameEn ? ' <span class="st-en">' + nameEn + '</span>' : '') + '</div>' +
    '<div class="st-lines">' + lineHtml + '</div>' +
    '<div class="st-btns">' +
      '<button data-act="from">출발지</button>' +
      '<button data-act="to">도착지</button>' +
      '<button data-act="fav">' + (isFavStation(sname) ? '★' : '☆') + ' 즐겨찾기</button>' +
    '</div>';
  el.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', ev => {
      ev.stopPropagation();
      const act = b.dataset.act;
      if (act === 'fav') {
        toggleFavStation(sname);
        b.innerHTML = (isFavStation(sname) ? '★' : '☆') + ' 즐겨찾기';
        return;
      }
      document.getElementById(act === 'from' ? 'route-from' : 'route-to').value = sname;
      document.getElementById('route-panel').hidden = false;
      closeStationPopup();
    });
  });
  stationPopup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: '240px' })
    .setLngLat(lngLat)
    .setDOMContent(el)
    .addTo(map);
}
map.on('click', e => {
  // 그리기 모드 중에는 역 팝업 띄우지 않음
  if (document.body.classList.contains('drawing')) return;
  let feats = [];
  try {
    // 탭이 빗나가도 잡히도록 클릭 지점 주변 18px 박스로 조회 (모바일 대응)
    const p = e.point, r = 18;
    feats = map.queryRenderedFeatures([[p.x - r, p.y - r], [p.x + r, p.y + r]], { layers: ['rail-stations'] });
  } catch (_) { return; }
  if (!feats.length) return;
  openStationPopup(feats[0], e.lngLat);
});
map.on('mouseenter', 'rail-stations', () => { map.getCanvas().style.cursor = 'pointer'; });
map.on('mouseleave', 'rail-stations', () => { map.getCanvas().style.cursor = ''; });

// 다이어그램 모드 / 노선 비교 버튼
document.getElementById('diagram-btn').addEventListener('click', () => {
  if (typeof DiagramMode === 'undefined') { setStatus('다이어그램 모듈을 불러오지 못했습니다.'); return; }
  DiagramMode.isActive() ? DiagramMode.exit() : DiagramMode.enter();
  document.getElementById('diagram-btn').classList.toggle('active', DiagramMode.isActive());
});
document.getElementById('compare-btn').addEventListener('click', () => {
  if (typeof LineCompare === 'undefined') { setStatus('비교 모듈을 불러오지 못했습니다.'); return; }
  LineCompare.show();
});

// DiagramMode에서 역 클릭 시 팝업을 띄우기 위한 전역 노출
window.openStationPopup = openStationPopup;

// 통계 / 타임라인 버튼
document.getElementById('stats-btn').addEventListener('click', () => {
  if (typeof RailStats === 'undefined') { setStatus('통계 모듈을 불러오지 못했습니다.'); return; }
  RailStats.show();
});
document.getElementById('timeline-btn').addEventListener('click', () => {
  if (typeof RailTimeline === 'undefined') { setStatus('타임라인 모듈을 불러오지 못했습니다.'); return; }
  RailTimeline.show();
});
document.getElementById('diagram-save-btn').addEventListener('click', () => {
  if (typeof DiagramExport === 'undefined') { setStatus('저장 모듈을 불러오지 못했습니다.'); return; }
  DiagramExport.save();
});
document.getElementById('report-btn').addEventListener('click', () => {
  window.open('https://docs.google.com/forms/d/e/1FAIpQLScv2JPh45AjKo9Lif7SM4hCQtCqrN5BofI_xeJ04Wh9unPaXw/viewform', '_blank');
});
document.getElementById('invest-btn').addEventListener('click', () => {
  if (typeof InvestAnalyzer === 'undefined') { setStatus('투자분석 모듈을 불러오지 못했습니다.'); return; }
  const on = !InvestAnalyzer.isActive();
  InvestAnalyzer.setMode(on);
  document.getElementById('invest-btn').classList.toggle('active', on);
  if (on) setStatus('투자분석: 분석할 지점을 클릭하세요 (Esc 취소)');
});
document.getElementById('coverage-btn').addEventListener('click', () => {
  if (typeof CoverageMap === 'undefined') { setStatus('영향권 모듈을 불러오지 못했습니다.'); return; }
  CoverageMap.isActive() ? CoverageMap.hide() : CoverageMap.show();
  document.getElementById('coverage-btn').classList.toggle('active', CoverageMap.isActive());
});

// 툴바 드롭다운 토글
document.querySelectorAll('.tb-dropdown').forEach(dd => {
  const btn = dd.querySelector('.tb-dropbtn');
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const wasOpen = dd.classList.contains('open');
    document.querySelectorAll('.tb-dropdown.open').forEach(o => o.classList.remove('open'));
    if (!wasOpen) dd.classList.add('open');
  });
  // 메뉴 안 버튼 클릭 시 드롭다운 닫기
  dd.querySelectorAll('.tb-dropmenu button').forEach(b => {
    b.addEventListener('click', () => dd.classList.remove('open'));
  });
});
document.addEventListener('click', () => {
  document.querySelectorAll('.tb-dropdown.open').forEach(o => o.classList.remove('open'));
});
