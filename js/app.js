/* 한국철도맵 v1 — 앱 셸: 베이스맵 3종 + 해시 상태 + 노선 토글 + 한/영 검색 */
'use strict';

const STYLES = {
  normal: 'https://tiles.openfreemap.org/styles/bright',
  // 다크는 OpenFreeMap 자체 스타일을 쓴다.
  //
  // 예전엔 CARTO dark_all 래스터를 썼는데, 지금은 키 없이 요청하면
  // HTTP 200 으로 'API KEY REQUIRED' 워터마크 타일을 돌려준다. 상태코드가
  // 200 이라 오류도 안 뜨고, 다크·이클립스·네온 테마 사용자는 지도 전체가
  // 워터마크로 덮인 화면을 봤다. 조용히 깨지는 유형이라 눈으로 봐야 알았다.
  dark: 'https://tiles.openfreemap.org/styles/dark',
  satellite: {
    version: 8,
    // 글자(symbol) 레이어용 폰트. 인라인 스타일이라 bright·dark 스타일 URL 과 달리
    // 이 항목이 저절로 들어오지 않는다. 없으면 역 이름·출구 번호 레이어 추가가
    // "requires a style glyphs property" 로 실패한다. 값은 bright·dark 스타일의
    // glyphs 와 같은 주소다 (2026-11-07 실측).
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
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

// 처음 온 사람(직접 고른 테마 없음)은 기기의 밝게/어둡게 설정을 따른다. 직접 고르면 그게 우선 (작업 7)
const prefersDark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
let theme = localStorage.getItem('krrail-theme') || (prefersDark ? 'dark' : 'light');
if (!THEMES.some(t => t.id === theme)) theme = 'light';

function baseStyle() {
  const mode = modeFromHash();
  if (mode === 'satellite') return STYLES.satellite;
  if (DARK_THEMES.has(theme)) return STYLES.dark;
  return STYLES.normal;
}

// 처음부터 지금 테마·배경에 맞는 스타일로 만든다. 예전에는 bright 로 만든 직후 applyView() 가
// setStyle 을 한 번 더 불러 스타일·스프라이트를 두 번 받았다(다크면 bright 를 받다가 버림) — 2026-11-11.
const map = new maplibregl.Map({
  container: 'map',
  style: baseStyle(),
  center: [126.98, 37.52],
  zoom: 9.4,
  attributionControl: { compact: true },
  preserveDrawingBuffer: true // 이미지 저장용
});
map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
// 배경 지도 '설계도(스타일 JSON)'가 적용되는 순간 — 철도 노선은 이때부터 그릴 수 있다.
// map 'load' 는 배경 지도의 글꼴·그림·첫 타일까지 다 받아야 오는데, 무료 지도 서버가 느리면 6~9초 걸렸다
// (2026-11-12 실측: 첫 글자 1.9초, 노선 8.7초). 노선을 배경 지도에 묶어 두지 않는다.
const styleReadyP = new Promise(res => {
  if (map.isStyleLoaded()) { res(); return; }
  map.once('style.load', res);
  map.once('load', res);   // 안전망 — 둘 중 먼저 오는 것
});
// 첫 로딩 자리 표시 걷기 (작업 7) — 배경 지도 설계도가 오면, 늦어도 10초 뒤엔 무조건
styleReadyP.then(() => document.body.classList.add('map-ready'));
setTimeout(() => document.body.classList.add('map-ready'), 10000);

/* 배경 지도 서버가 죽었을 때 (2026-11-12) — 노선은 배경 지도 '설계도'(스타일 JSON)가 와야 그릴 수 있다.
 * 무료 서버(OpenFreeMap)가 응답하지 않으면 노선까지 영영 안 뜬다. 8초 안에 설계도가 안 오거나 설계도 오류가 나면
 * 바탕색만 있는 비상 스타일로 바꾼다 — 노선·역 점은 보이고, 글자는 글꼴 서버가 살아 있을 때만 보인다. */
const FALLBACK_STYLE = {
  version: 8,
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {},
  layers: [{ id: 'fallback-bg', type: 'background', paint: { 'background-color': '#f2f1ec' } }],
};
let styleOk = false, usedFallback = false;
map.once('style.load', () => { styleOk = true; });
function useFallbackStyle(why) {
  if (styleOk || usedFallback) return;
  usedFallback = true;
  console.warn('배경 지도 서버 응답 없음 → 비상 배경으로 (' + why + ')');
  try { map.setStyle(FALLBACK_STYLE); } catch (e) { /* 무시 */ }
  setTimeout(() => setStatus('배경 지도 서버가 응답하지 않아 바탕 없이 노선만 보여 줍니다. 잠시 뒤 새로고침해 보세요.'), 0);
}
const fallbackTimer = setTimeout(() => useFallbackStyle('8초'), 8000);
map.once('style.load', () => clearTimeout(fallbackTimer));
map.on('error', e => {
  // 설계도(스타일 JSON) 자체를 못 받은 오류만 — 타일 하나 실패는 무시한다
  const msg = String((e && e.error && (e.error.message || e.error.status)) || '');
  if (!styleOk && !(e && e.sourceId) && /style|Failed to fetch|NetworkError|AJAXError|404|50\d/i.test(msg)) useFallbackStyle(msg.slice(0, 60));
});
window.KR_usedFallbackStyle = () => usedFallback;

let LINES = [], STATIONS = [];
// 내 위치 버튼으로 마지막에 찍힌 위치 [lng, lat] — 찍은 적이 없으면 null (스타일 교체 후 복원용)
let lastLocation = null;
let dataReady = false;
// 동명역 지역 표시 (IMPL9 건 3) — 역 ID → '서울 중구'. 이름이 겹치는 역 가운데 이름+노선으로 지역을
// 확정할 수 있었던 역만 들어 있다(data/build_station_region.py). 없으면 아무것도 붙이지 않는다.
const regionOf = new Map();
fetch('data/station-region.json')
  .then(r => (r.ok ? r.json() : null))
  .then(d => { if (d && d.stations) for (const id in d.stations) regionOf.set(id, d.stations[id].label); })
  .catch(() => null);
const visibleLines = new Set();

/* ---------- 지도 모드 + 테마 + 해시 ---------- */
function modeFromHash() {
  const h = location.hash.replace('#', '');
  return MODES.includes(h) ? h : 'normal';
}
let appliedStyleKey = styleKeyFor(modeFromHash(), theme);   // 지도를 baseStyle() 로 만들었으므로 그 키에서 시작
function styleKeyFor(mode, theme) {
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
    // diff:false — 기본 diff 모드는 커스텀 레이어를 지우면서 style.load 를
    // 쏘지 않아 restoreCustomLayers 가 영영 못 돈다 (테마·배경 전환 시 노선 소실).
    // 전체 교체로 style.load 를 보장해 기존 복원 경로를 탄다.
    map.setStyle(baseStyle(), { diff: false });
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
    annotateStations();
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
  annotateStations();
}

// 노선 필터 + 개통 상태. open=true 면 운행 중만, false 면 미개통(공사중·계획중·구상중)만.
// status 가 비어 있으면 운행 중으로 본다 (route.js 와 같은 기준).
const UNOPENED_OPACITY = 0.75;
function lineFilterWithStatus(ids, open) {
  const isOpen = ['==', ['coalesce', ['get', 'status'], 'open'], 'open'];
  return ['all', ['in', ['get', 'id'], ['literal', ids]], open ? isOpen : ['!', isOpen]];
}
const UNOPENED_LAYERS = ['rail-lines-unopened', 'rail-lines-unopened-label'];

function addDataLayers() {
  if (map.getSource('lines')) return; // 스타일 교체 후 중복 방지
  map.addSource('lines', { type: 'geojson', data: { type: 'FeatureCollection', features: LINES } });
  map.addLayer({
    id: 'rail-lines', type: 'line', source: 'lines',
    filter: lineFilterWithStatus([...visibleLines], true),
    paint: {
      'line-color': ['coalesce', ['get', 'color'], '#888888'],
      'line-width': ['interpolate', ['linear'], ['zoom'], 7, 2.2, 12, 5, 16, 8],
      'line-opacity': 0.9
    }
  });
  // 미개통 노선(공사중·계획중·구상중) — 점선 + '개통 예정' 글자 (2026-11-09 결정 1).
  // 예전에는 운행 중인 노선과 똑같은 실선이라 지금 탈 수 있는 노선처럼 보였다.
  // rail-lines 는 운행 중만, 이 두 레이어는 미개통만 그린다 (노선 필터는 updateFilters() 가 같이 건다).
  map.addLayer({
    id: 'rail-lines-unopened', type: 'line', source: 'lines',
    filter: lineFilterWithStatus([...visibleLines], false),
    paint: {
      'line-color': ['coalesce', ['get', 'color'], '#888888'],
      'line-width': ['interpolate', ['linear'], ['zoom'], 7, 2, 12, 4, 16, 6],
      'line-opacity': UNOPENED_OPACITY,
      'line-dasharray': [2, 1.5]
    }
  });
  map.addLayer({
    id: 'rail-lines-unopened-label', type: 'symbol', source: 'lines', minzoom: 9,
    filter: lineFilterWithStatus([...visibleLines], false),
    layout: {
      'symbol-placement': 'line', 'symbol-spacing': 400,
      'text-field': ['concat', ['get', 'name_ko'], ' 개통 예정',
        ['match', ['get', 'status'], 'construction', ' (공사중)', 'planned', ' (계획중)', 'proposed', ' (구상중)', '']],
      'text-size': 11, 'text-font': ['Noto Sans Regular']
    },
    paint: labelPaint('#333333', 1.4)
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
  // 내 위치 레이어 — 테마·배경 전환으로 다시 만들 때 마지막으로 찍은 위치를 다시 싣는다
  map.addSource('my-location', { type: 'geojson', data: myLocationData() });
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
    // 글꼴을 지정하지 않으면 MapLibre 기본값(Open Sans)을 요청하는데,
    // 배경지도 글꼴 서버(OpenFreeMap)에는 Noto Sans 만 있다. 404 가 나고
    // 라벨이 통째로 사라진다 — 실제로 역 이름이 안 보이고 있었다.
    layout: {
      'text-field': ['get', 'name_ko'], 'text-size': 11, 'text-offset': [0, 1.2],
      'text-font': ['Noto Sans Regular']
    },
    // 위성 사진 위에서는 검은 글자 + 얇은 흰 테두리가 어두운 지붕·숲에 묻힌다.
    // 위성일 때만 흰 글자 + 어두운 테두리로 바꾼다. 일반·다크·흑백은 그대로.
    // (배경을 바꾸면 스타일 전체 교체 → restoreCustomLayers → 여기를 다시 지나므로 분기가 따라간다)
    paint: labelPaint('#1f2328', 1.2)
  });
}

// 지도 글자 색 (접근성: 글자 ↔ 테두리 대비 4.5:1 이상).
// 위성 사진·어두운 배경(다크·이클립스·네온 테마)에서는 흰 글자 + 어두운 테두리,
// 밝은 배경에서는 어두운 글자 + 흰 테두리. 예전에는 다크 테마에서도 검은 글자 + 1px 흰 테두리라
// 어두운 지도 위에서 글자가 테두리에만 기대어 읽혔다 (2026-11-11 측정).
function labelPaint(darkText, haloW) {
  const darkBg = modeFromHash() === 'satellite' || DARK_THEMES.has(theme);
  return darkBg
    ? { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.85)', 'text-halo-width': 1.6 }
    : { 'text-color': darkText, 'text-halo-color': '#ffffff', 'text-halo-width': haloW };
}

// 출구 레이어 — 확대했을 때만 보인다. 전국 단위에서 4,300개를 그리면
// 노선을 가려서 지도가 안 읽힌다. 16레벨부터 역 단위로 내려다볼 때 켠다.
function addExitLayers() {
  if (!map || map.getSource('station-exits')) return;
  if (typeof StationExits === 'undefined' || !StationExits.isReady()) return;
  try {
    map.addSource('station-exits', { type: 'geojson', data: StationExits.geojson() });
    map.addLayer({
      id: 'station-exits', type: 'circle', source: 'station-exits', minzoom: 16,
      paint: {
        // 17레벨부터 번호가 안에 들어가므로 원을 키운다 (배지처럼 읽히게).
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 16, 5, 17, 10, 18, 12],
        'circle-color': '#1a73e8', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2,
        'circle-opacity': 0.95
      }
    });
    map.addLayer({
      id: 'station-exit-labels', type: 'symbol', source: 'station-exits', minzoom: 17,
      layout: {
        'text-field': ['get', 'no'], 'text-size': 10, 'text-offset': [0, 0],
        'text-font': ['Noto Sans Regular'],
        // 출구는 20~40m 간격으로 붙어 있다. 충돌 회피를 켜면 대부분 사라져서
        // '몇 번 출구' 를 지도에서 못 읽는다. 겹쳐도 보이게 둔다.
        'text-allow-overlap': true, 'text-ignore-placement': true
      },
      paint: { 'text-color': '#ffffff', 'text-halo-width': 0 }
    });
  } catch (e) { /* 스타일 교체 중이면 다음 기회에 */ }
}

// 역 점·라벨 필터용 노선 키 (UI.lineFilterExpr 가 읽는다). 데이터 파일은 바꾸지 않고 불러온 뒤 붙인다.
function annotateStations() {
  for (const s of STATIONS) s.properties.lines_key = UI.linesKey(s.properties);
}

function updateFilters() {
  const ids = [...visibleLines];
  // 역은 지나는 노선(lines) 중 하나라도 켜져 있으면 보인다 (환승역이 대표 노선만으로 걸러지던 결함 수정)
  const sf = UI.lineFilterExpr(ids);
  if (map.getLayer('rail-lines')) map.setFilter('rail-lines', lineFilterWithStatus(ids, true));
  UNOPENED_LAYERS.forEach(id => { if (map.getLayer(id)) map.setFilter(id, lineFilterWithStatus(ids, false)); });
  if (map.getLayer('rail-stations')) map.setFilter('rail-stations', sf);
  if (map.getLayer('station-labels')) map.setFilter('station-labels', sf);
  // 역세권 범위도 역 점과 같은 기준(lines)으로 거른다
  if (typeof StationArea !== 'undefined') StationArea.setLines(ids);
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
  document.getElementById('line-count').textContent = `(${scope === 'metro' ? '수도권' : '전국'} ${lines.length})`;   // 기준을 밝힌다 (감사 N13)
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

/* ---------- 검색 (한/영/초성/오타) ----------
 * 순위 매기기는 js/search.js 가 한다. 여기서는 결과를 그리고 키보드를 붙인다.
 *   ↑ ↓   결과 이동
 *   Enter 선택
 *   Esc   닫기
 */
const searchInput = document.getElementById('search');
const searchBox = document.getElementById('search-results');
let searchHits = [];      // 현재 그려진 결과 (feature 배열)
let searchCursor = -1;    // 키보드로 고른 위치

function lineMetaOf(id) {
  const l = LINES.find(x => x.properties.id === id);
  return l ? { name: l.properties.name_ko, color: l.properties.color || '#888888' }
           : { name: id, color: '#888888' };
}

function closeSearch() {
  searchBox.innerHTML = '';
  searchHits = [];
  searchCursor = -1;
  searchInput.setAttribute('aria-expanded', 'false');
  searchInput.removeAttribute('aria-activedescendant');
}

function pickSearchHit(f) {
  const c = f.geometry.coordinates;
  map.flyTo({ center: c, zoom: 14 });
  closeSearch();
  searchInput.blur();
  // 역 상세 패널까지 열어준다 (지도가 이동한 뒤에)
  setTimeout(() => showStation(f, { lng: c[0], lat: c[1] }), 720);
}

function markCursor(i) {
  const rows = searchBox.querySelectorAll('.hit');
  if (!rows.length) return;
  searchCursor = (i + rows.length) % rows.length;
  rows.forEach((r, k) => {
    const on = k === searchCursor;
    r.classList.toggle('active', on);
    r.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  const cur = rows[searchCursor];
  searchInput.setAttribute('aria-activedescendant', cur.id);
  // 목록이 넘칠 때 고른 항목이 보이도록
  const top = cur.offsetTop, bot = top + cur.offsetHeight;
  if (top < searchBox.scrollTop) searchBox.scrollTop = top;
  else if (bot > searchBox.scrollTop + searchBox.clientHeight) searchBox.scrollTop = bot - searchBox.clientHeight;
}

// 검색 결과 한 줄 (검색·최근 본 역이 같이 쓴다)
function hitRow(f, i) {
  const p = f.properties;
  const row = document.createElement('div');
  row.className = 'hit';
  row.id = `search-hit-${i}`;
  row.setAttribute('role', 'option');
  row.setAttribute('aria-selected', 'false');

  const name = document.createElement('span');
  name.className = 'hit-name';
  name.textContent = p.name_ko || p.name_en || '(이름 없음)';
  row.appendChild(name);
  // 동명역이면 지역 (시청 · 서울 중구)
  if (regionOf.has(p.id)) {
    const rg = document.createElement('span');
    rg.className = 'hit-region';
    rg.textContent = '· ' + regionOf.get(p.id);
    row.appendChild(rg);
  }

  // 노선 점 + 이름. 환승역은 점이 여러 개다.
  const lines = document.createElement('span');
  lines.className = 'hit-lines';
  const ids = (p.lines && p.lines.length ? p.lines : [p.line_id]).filter(Boolean).slice(0, 3);
  ids.forEach(id => {
    const m = lineMetaOf(id);
    const dot = document.createElement('i');
    dot.className = 'hit-dot';
    dot.style.background = m.color;
    lines.appendChild(dot);
  });
  const label = document.createElement('span');
  label.textContent = ids.map(id => lineMetaOf(id).name).join(' · ');
  lines.appendChild(label);
  row.appendChild(lines);

  row.addEventListener('mouseenter', () => markCursor(i));
  row.addEventListener('click', () => pickSearchHit(f));
  return row;
}

// 최근 본 역 (작업 7) — 역 상세를 연 역 id 를 8개까지. 빈 검색창을 누르면 보여 준다. 저장 실패해도 동작엔 지장 없음
const RECENT_KEY = 'krrail-recent-stations';
function recentIds() {
  try { const a = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}
function rememberStation(f) {
  const id = f && f.properties && f.properties.id;
  if (!id) return;
  const a = recentIds().filter(x => x !== id); a.unshift(id);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(a.slice(0, 8))); } catch (e) { /* 무시 */ }
}
function renderRecent() {
  const ids = recentIds();
  if (!ids.length || !STATIONS || !STATIONS.length) return;
  const byId = new Map(STATIONS.map(f => [f.properties.id, f]));
  const found = ids.map(id => byId.get(id)).filter(Boolean);
  if (!found.length) return;
  searchBox.innerHTML = ''; searchCursor = -1; searchHits = found;
  const head = document.createElement('div');
  head.className = 'hit-head';
  head.innerHTML = '<span>최근 본 역</span>';
  const clr = document.createElement('button');
  clr.type = 'button'; clr.className = 'hit-clear'; clr.textContent = '지우기';
  clr.addEventListener('click', e => { e.stopPropagation(); try { localStorage.removeItem(RECENT_KEY); } catch (er) { /* 무시 */ } closeSearch(); searchInput.focus(); });
  head.appendChild(clr); searchBox.appendChild(head);
  found.forEach((f, i) => searchBox.appendChild(hitRow(f, i)));
  searchInput.setAttribute('aria-expanded', 'true');
}

function renderSearch(raw) {
  searchBox.innerHTML = '';
  searchCursor = -1;
  searchHits = [];
  if (!raw) { closeSearch(); return; }

  const found = (window.StationSearch
    ? window.StationSearch.search(STATIONS, raw, { limit: 12 })
    : STATIONS.filter(f => (f.properties.name_ko || '').includes(raw))
        .slice(0, 12).map(feature => ({ feature }))
  ).map(h => h.feature);

  if (!found.length) {
    searchHits = [];
    const none = document.createElement('div');
    none.className = 'hit-none';
    none.textContent = `'${raw}' 에 해당하는 역이 없습니다`;
    searchBox.appendChild(none);
    searchInput.setAttribute('aria-expanded', 'true');
    return;
  }

  searchHits = found;
  found.forEach((f, i) => searchBox.appendChild(hitRow(f, i)));
  searchInput.setAttribute('aria-expanded', 'true');
}

searchInput.addEventListener('input', () => renderSearch(searchInput.value.trim()));
// 검색창을 다시 눌렀을 때, 글자가 남아 있으면 결과를 다시 띄운다
searchInput.addEventListener('focus', () => {
  if (!searchInput.value.trim()) { renderRecent(); return; }
  if (!searchHits.length) renderSearch(searchInput.value.trim());
});

searchInput.addEventListener('keydown', e => {
  if (!searchHits.length) {
    if (e.key === 'Escape') closeSearch();
    return;
  }
  if (e.key === 'ArrowDown') { e.preventDefault(); markCursor(searchCursor + 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); markCursor(searchCursor - 1); }
  else if (e.key === 'Enter') {
    e.preventDefault();
    pickSearchHit(searchHits[searchCursor >= 0 ? searchCursor : 0]);
  } else if (e.key === 'Escape') {
    e.preventDefault(); closeSearch();
  }
});

document.addEventListener('click', e => {
  if (!e.target.closest('.search-wrap')) closeSearch();
});

document.addEventListener('keydown', e => {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
  // 다른 입력창에 커서가 있으면 '/' 는 글자다. 가로채면 안 된다.
  const el = document.activeElement;
  const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' || el.isContentEditable);
  if (typing) return;
  e.preventDefault();
  searchInput.focus();
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
    // 동명역(서울·부산·대전 시청 등) 구분용 역 ID. 이름(from/to)은 사람이 읽고
    // 옛 링크와 호환되도록 그대로 둔다.
    const fs = routeInputStation(document.getElementById('route-from'));
    const ts = routeInputStation(document.getElementById('route-to'));
    if (from && fs) url.searchParams.set('from_id', fs.properties.id); else url.searchParams.delete('from_id');
    if (to && ts) url.searchParams.set('to_id', ts.properties.id); else url.searchParams.delete('to_id');
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
    // from_id/to_id 가 있으면(새 링크) 그 역으로 확정한다. 없으면(옛 링크, 이름만)
    // 이름만 넣어 두고, 길찾기 때 resolveRoutePair 가 동명역 중 반대편과 가장
    // 가까운 역으로 해석한다.
    const fs = stationById(q.get('from_id')), ts = stationById(q.get('to_id'));
    if (from) setRouteStation(document.getElementById('route-from'), fs || from);
    if (to) setRouteStation(document.getElementById('route-to'), ts || to);
    if (from && to) setTimeout(() => document.getElementById('route-go').click(), 800);
  }
  // ?st=역ID — 교통 순위표(rank.html)에서 역을 누르면 그 역으로 가서 상세를 연다
  // ?rocket=1&st= 는 떡상 패널이 그 역을 고른다 (js/rocket-panel.js) — 역 상세는 열지 않는다
  const sid = q.get('rocket') === '1' ? null : q.get('st');
  const sf = sid && stationById(sid);
  if (sf) {
    map.flyTo({ center: sf.geometry.coordinates, zoom: Math.max(map.getZoom(), 13), duration: 0 });
    setTimeout(() => showStation(sf), 300);
  }
  const c = q.get('c');
  if (c) {
    const [lng, lat, z] = c.split(',').map(Number);
    if (lng && lat) map.flyTo({ center: [lng, lat], zoom: z || 11, duration: 0 });
  }
}

/* 역 상세 패널의 '여기서 출발 / 여기로 도착' 버튼.
 *
 * 역 패널(#sd-panel)은 z-index 1000, 길찾기 패널(#route-panel)은 35 다.
 * 역 패널을 닫지 않고 길찾기 패널만 열면, 길찾기 패널이 역 패널 '뒤에'
 * 열려서 사용자 눈에는 아무 일도 일어나지 않은 것처럼 보인다.
 * (실제로 그랬다. Esc 로 역 패널을 닫아야 그제서야 입력칸이 드러났다.)
 * 그래서 역 패널을 먼저 닫고, 반대편 칸으로 초점을 옮긴다.
 */
function routeFromStation(stationName, which, stationId) {
  if (typeof StationDetail !== 'undefined') StationDetail.hide();
  const panel = document.getElementById('route-panel');
  panel.hidden = false;
  const mine = document.getElementById(which === 'from' ? 'route-from' : 'route-to');
  const other = document.getElementById(which === 'from' ? 'route-to' : 'route-from');
  const box = document.getElementById('route-result');
  // 이름이 아니라 그 역(ID)을 넘긴다. 서울 시청 패널에서 눌렀는데 부산 시청이 잡히면 안 된다.
  setRouteStation(mine, stationById(stationId) || stationName);
  if (other.value.trim()) {
    // 반대편이 이미 채워져 있으면 바로 찾는다. 한 번 더 누르게 하지 않는다.
    document.getElementById('route-go').click();
    return;
  }
  box.innerHTML = '';
  other.focus();
  setStatus(which === 'from'
    ? `${stationName}에서 출발 — 도착역을 입력하세요.`
    : `${stationName}으로 도착 — 출발역을 입력하세요.`);
}

/* ---------- 길찾기 UI ---------- */
const lineNameOf = new Map();
function setupRouteFinder() {
  LINES.forEach(f => lineNameOf.set(f.properties.id, f.properties.name_ko));
  const info = RouteFinder.buildGraph(LINES, STATIONS);
  // 지도에 따로 그리지 않는 급행 계통(ITX-청춘)도 경로 결과에 이름이 나오게
  if (RouteFinder.extraLines) RouteFinder.extraLines().forEach(x => lineNameOf.set(x.id, x.name_ko));
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
  list.setAttribute('aria-label', input.id === 'route-to' ? '도착역 후보' : input.id === 'cm-dest' ? '직장 역 후보' : '출발역 후보');
  input.setAttribute('aria-controls', listId);
  let items = [], activeIdx = -1;
  function setExpanded(v) { input.setAttribute('aria-expanded', v ? 'true' : 'false'); }
  function hide() {
    list.hidden = true; activeIdx = -1;
    setExpanded(false);
    input.removeAttribute('aria-activedescendant');
  }
  function render(q) {
    items = [];
    // 이름으로 중복을 지우지 않는다. 동명역(서울·부산·대전 시청 등)은 노선 표기로
    // 구분해 모두 보이고, 고른 항목의 역 ID 를 입력칸에 담는다.
    for (const s of STATIONS) {
      const n = s.properties.name_ko;
      if (!n.includes(q)) continue;
      items.push({ id: s.properties.id, name: n, lines: s.properties.lines || [],
        starts: n.startsWith(q), exact: n === q, coord: s.geometry.coordinates });
      if (items.length >= 60) break;
    }
    // 정확히 일치 → 시작 매칭 → 나머지 (동명역이 8개 밖으로 밀리지 않게).
    // 같은 이름끼리는 지금 보는 지도 중심에 가까운 역부터 (서울을 보며 '시청' → 서울 시청이 위).
    // 서로 다른 이름의 순서는 건드리지 않는다 — 이름 그룹은 처음 나온 순서를 그대로 쓴다.
    const ctr = map.getCenter(), kx = Math.cos(ctr.lat * Math.PI / 180);
    const firstAt = new Map();
    items.forEach((it, i) => {
      if (!firstAt.has(it.name)) firstAt.set(it.name, i);
      it.d = Math.hypot((it.coord[0] - ctr.lng) * kx, it.coord[1] - ctr.lat);
    });
    items.sort((a, b) => (b.exact - a.exact) || (b.starts - a.starts) ||
      (firstAt.get(a.name) - firstAt.get(b.name)) || (a.d - b.d));
    items = items.slice(0, 8);
    if (!items.length) { hide(); return; }
    list.innerHTML = items.map((it, i) => {
      const ln = it.lines.map(lid => lineNameOf.get(lid) || lid).slice(0, 3).join('·');
      return '<div class="ac-item" role="option" aria-selected="false" id="' + listId + '-o' + i +
        '" data-i="' + i + '">' + it.name +
        (regionOf.has(it.id) ? '<span class="ac-region">· ' + regionOf.get(it.id) + '</span>' : '') +
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
    delete input.dataset.sid; // 손으로 고치기 시작하면 앞서 고른 역은 무효
    const q = input.value.trim();
    if (!q) { hide(); return; }
    render(q);
  });
  input.addEventListener('focus', () => {
    const q = input.value.trim();
    if (q) render(q);
  });
  input.addEventListener('blur', () => setTimeout(hide, 180));
  // Enter 다음 동작 (2026-11-11 사용성 점검: 이름만 치고 Enter 를 누르면 아무 일도 없었다)
  //   출발 칸 → 도착 칸으로, 도착 칸 → 출발이 정해져 있으면 바로 경로 찾기
  function afterEnter() {
    if (input.id === 'route-from') { const t = document.getElementById('route-to'); if (t) t.focus(); }
    else if (input.id === 'route-to') {
      const f = document.getElementById('route-from');
      if (f && f.value.trim()) { const go = document.getElementById('route-go'); if (go) go.click(); }
    }
  }
  input.addEventListener('keydown', e => {
    if (list.hidden) {
      // 목록이 닫힌 채 Enter: 이미 고른 역이 있으면 다음 동작만
      if (e.key === 'Enter' && input.dataset.sid && (input.id === 'route-from' || input.id === 'route-to')) { e.preventDefault(); afterEnter(); }
      return;
    }
    if (e.key === 'Enter' && activeIdx < 0 && items.length) {
      // 화살표로 고르지 않고 Enter → 맨 위 후보(정확히 같은 이름 → 시작이 같은 이름 → 지도 중심에 가까운 역 순)
      e.preventDefault();
      setRouteStation(input, stationById(items[0].id) || items[0].name);
      hide();
      input.dispatchEvent(new CustomEvent('ac:pick'));
      afterEnter();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      activeIdx = e.key === 'ArrowDown'
        ? Math.min(activeIdx + 1, items.length - 1)
        : Math.max(activeIdx - 1, 0);
      highlight();
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault();
      setRouteStation(input, stationById(items[activeIdx].id) || items[activeIdx].name);
      hide();
      input.dispatchEvent(new CustomEvent('ac:pick'));   // 길찾기 밖(통근권)에서도 고른 역을 알 수 있게
      afterEnter();
    } else if (e.key === 'Escape') { hide(); }
  });
  list.addEventListener('mousedown', e => {
    const el = e.target.closest('.ac-item');
    if (!el) return;
    e.preventDefault();
    const it = items[+el.dataset.i];
    setRouteStation(input, stationById(it.id) || it.name);
    hide();
    input.focus();
    input.dispatchEvent(new CustomEvent('ac:pick'));
  });
}
window.KR_attachAutocomplete = attachAutocomplete;   // commute.js 직장 역 입력도 같은 자동완성(동명역 지역 표시)
/* 사이드바 토글은 ui.js 가 맡는다.
 * 여기서도 리스너를 달면 같은 버튼에 두 개가 붙어서, 클릭 한 번에
 * sidebar-hidden 이 두 번 토글되고 결과적으로 아무 일도 안 일어난다. */
/* ---------- 역 식별 (동명역) ----------
 * 이름이 같은 역이 여러 곳 있다 (시청: 서울·부산·대전, 교대: 서울·부산·대구 등).
 * 이름의 첫 역을 돌려주면 서울 시청을 고를 방법이 없었다 (시청→강남이 부산 경유 421km).
 * 입력칸에는 이름을 보이고, 고른 역의 ID 는 input.dataset.sid 에 담는다.
 */
let stationIndex = null;
function stationById(id) {
  if (!id) return null;
  if (!stationIndex || stationIndex.size !== STATIONS.length) {
    stationIndex = new Map(STATIONS.map(s => [s.properties.id, s]));
  }
  return stationIndex.get(id) || null;
}
function stationsNamed(name) {
  name = (name || '').trim();
  return name ? STATIONS.filter(s => s.properties.name_ko === name) : [];
}
// 입력칸에 역을 넣는다. 역(feature)이면 ID 까지, 이름(문자열)이면 이름만.
function setRouteStation(input, st) {
  if (st && typeof st === 'object') {
    input.value = st.properties.name_ko;
    input.dataset.sid = st.properties.id;
  } else {
    input.value = st || '';
    delete input.dataset.sid;
  }
}
// 입력칸이 가리키는 역. 담긴 ID 가 지금 이름과 맞을 때만 믿는다
// (다른 코드가 value 만 바꿔 놓았으면 ID 는 낡은 것이다).
function routeInputStation(input) {
  const s = stationById(input.dataset.sid);
  if (s && s.properties.name_ko === input.value.trim()) return s;
  const c = stationsNamed(input.value);
  return c.length === 1 ? c[0] : null;
}
// 하위 호환: 이름 하나로 역 찾기. 동명역이면 첫 역 (옛 동작).
function resolveStation(name) {
  return stationsNamed(name)[0] || null;
}
// 출발·도착을 함께 확정한다.
//  1) 입력칸에 ID 가 있으면 그 역
//  2) 이름이 유일하면 그 역
//  3) ID 없는 동명역(옛 공유 링크·직접 타이핑·옛 즐겨찾기)은 후보 중 반대편과
//     가장 가까운 쌍으로 해석하고, 어떻게 해석했는지 알린다.
function resolveRoutePair(fromInput, toInput) {
  const cand = input => {
    const s = stationById(input.dataset.sid);
    if (s && s.properties.name_ko === input.value.trim()) return [s];
    return stationsNamed(input.value);
  };
  const A = cand(fromInput), B = cand(toInput);
  if (!A.length || !B.length) return { from: A[0] || null, to: B[0] || null, guessed: [] };
  const d2 = (a, b) => {
    const p = a.geometry.coordinates, q = b.geometry.coordinates;
    const dx = (p[0] - q[0]) * Math.cos((p[1] + q[1]) / 2 * Math.PI / 180), dy = p[1] - q[1];
    return dx * dx + dy * dy;
  };
  let best = null;
  for (const a of A) for (const b of B) {
    if (a === b && (A.length > 1 || B.length > 1)) continue;
    const d = d2(a, b);
    if (!best || d < best.d) best = { a, b, d };
  }
  if (!best) best = { a: A[0], b: B[0] };
  const guessed = [];
  if (A.length > 1) guessed.push(best.a);
  if (B.length > 1) guessed.push(best.b);
  // 해석 결과를 입력칸에 고정한다 (이후 공유 링크에 ID 가 실린다)
  setRouteStation(fromInput, best.a); setRouteStation(toInput, best.b);
  return { from: best.a, to: best.b, guessed };
}
function stationLinesLabel(s) {
  return (s.properties.lines || []).map(lid => lineNameOf.get(lid) || lid).slice(0, 3).join('·');
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
  const sa = a.dataset.sid, sb = b.dataset.sid;
  [a.value, b.value] = [b.value, a.value];
  if (sb) a.dataset.sid = sb; else delete a.dataset.sid;
  if (sa) b.dataset.sid = sa; else delete b.dataset.sid;
});
document.getElementById('route-save').addEventListener('click', () => {
  const from = document.getElementById('route-from').value.trim();
  const to = document.getElementById('route-to').value.trim();
  if (!from || !to) { setStatus('출발역과 도착역을 입력하세요.'); return; }
  // 동명역을 구분하도록 역 ID 도 함께 저장한다 (옛 항목은 이름만 있어도 동작)
  const fs = routeInputStation(document.getElementById('route-from'));
  const ts = routeInputStation(document.getElementById('route-to'));
  const fromId = fs ? fs.properties.id : undefined, toId = ts ? ts.properties.id : undefined;
  const exists = favorites.routes.some(r => r.from === from && r.to === to &&
    (!r.fromId || !fromId || r.fromId === fromId) && (!r.toId || !toId || r.toId === toId));
  if (exists) { setStatus('이미 저장된 경로입니다.'); return; }
  favorites.routes.push(Object.assign({ from, to }, fromId ? { fromId } : {}, toId ? { toId } : {}));
  saveFavorites(); renderFavorites();
  setStatus(`경로 저장됨: ${from} → ${to}`);
});
// 개통 예정 노선 포함 (2026-11-09 결정 1) — 기본은 꺼짐(지금 운행 중인 노선만). 켠 사람에게는 다음 방문에도 켜 둔다.
const UNOPENED_KEY = 'krrail-route-unopened';
const routeUnopenedEl = document.getElementById('route-unopened');
if (routeUnopenedEl) {
  try { routeUnopenedEl.checked = localStorage.getItem(UNOPENED_KEY) === '1'; } catch (e) { /* 저장소 없음 → 기본(꺼짐) */ }
  routeUnopenedEl.addEventListener('change', () => {
    try { localStorage.setItem(UNOPENED_KEY, routeUnopenedEl.checked ? '1' : '0'); } catch (e) {}
    // 이미 결과가 떠 있으면 바뀐 기준으로 다시 찾는다
    const box = document.getElementById('route-result');
    if (box && box.innerHTML.trim()) document.getElementById('route-go').click();
  });
}
function routeIncludeUnopened() { return !!(routeUnopenedEl && routeUnopenedEl.checked); }

document.getElementById('route-go').addEventListener('click', () => {
  const box = document.getElementById('route-result');
  const pair = resolveRoutePair(document.getElementById('route-from'), document.getElementById('route-to'));
  const from = pair.from, to = pair.to;
  if (!from || !to) { box.innerHTML = '출발역과 도착역을 목록에서 선택해주세요.'; return; }
  // 출발 = 도착이면 '0분·0원' 결과 대신 안내만 (같은 이름의 다른 역 — 예: 서울 시청 → 부산 시청 — 은 다른 역이라 그대로 찾는다)
  if (from.properties.id === to.properties.id) {
    box.innerHTML = '<p class="rc-same">출발역과 도착역이 같아요. 다른 역을 골라 주세요.</p>';
    setStatus('출발역과 도착역이 같아요');
    return;
  }
  if (pair.guessed.length) {
    setStatus('동명역: ' + pair.guessed.map(s => `${s.properties.name_ko}(${stationLinesLabel(s)})`).join(', ') +
      ' 으로 해석했습니다. 다른 역이면 입력칸 목록에서 고르세요.');
  }
  // 3종 비교 모듈이 있으면 사용, 없으면 기존 단일 경로
  if (typeof RouteCompare !== 'undefined') {
    RouteCompare.show(from.properties.id, to.properties.id, { includeUnopened: routeIncludeUnopened() });
    // 아래 상태 줄에 '도착역을 입력하세요' 같은 옛 안내가 남지 않게 — 동명역 해석 안내는 위에서 이미 띄웠으면 그대로 둔다
    if (!pair.guessed.length) setStatus(`${from.properties.name_ko} → ${to.properties.name_ko} 경로를 찾았어요`);
    return;
  }
  const r = RouteFinder.findRoute(from.properties.id, to.properties.id,
    routeIncludeUnopened() ? undefined : { openOnly: true });
  if (!r) { box.innerHTML = '경로를 찾을 수 없습니다.'; return; }
  const sname = id => {
    const s = STATIONS.find(x => x.properties.id === id);
    return s ? s.properties.name_ko : id;
  };
  // 요금 계산 (수도권 전철, 2025-06-28 인상 후 기본 1,550원) — RouteCompare 가 없을 때만 쓰는 예비 경로
  function calcFare(distKm) {
    let fare = 1550; // 기본 10km
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
    html += `<div class="unopened-notice"><i data-ic="alert"></i> 미개통 구간 포함 — ${names}
      <span class="unopened-sub">개통 전이므로 실제로는 이용할 수 없습니다.</span></div>`;
  }
  r.legs.forEach((leg, idx) => {
    const a = sname(leg.from), b = sname(leg.to);
    const i1 = r.path.indexOf(leg.from), i2 = r.path.indexOf(leg.to);
    const n = Math.abs(i2 - i1);
    if (leg.walk || !leg.lineId) {
      html += a === b
        ? `<div class="leg"><i data-ic="walk"></i> ${a}역 내 환승 (도보 이동)</div>`
        : `<div class="leg"><i data-ic="walk"></i> ${a} → ${b} (도보 이동)</div>`;
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
    // 이 구간을 내린 뒤 갈아타는 시간. 역마다 다르다 (data/transfer-times.json).
    if (leg.transferAfter > 0) {
      html += leg.platform
        ? `<div class="leg leg-transfer leg-platform"><i data-ic="transfer"></i> <b>${b}</b>역 같은 승강장 평면환승 · 약 10초</div>`
        : `<div class="leg leg-transfer"><i data-ic="walk"></i> <b>${b}</b>역 내 환승 · 도보 약 ${leg.transferAfter}분</div>`;
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
  const x = !l && lineId && RouteFinder.extraLines ? RouteFinder.extraLines().find(e => e.id === lineId) : null;
  return {
    color: (l && l.properties.color) || (x && x.color) || '#8a8f98',
    name: (l && l.properties.name_ko) || (x && x.name_ko) || '도보',
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
  if (map.getLayer('rail-lines-unopened')) map.setPaintProperty('rail-lines-unopened', 'line-opacity', 0);
  if (map.getLayer('rail-lines-unopened-label')) map.setLayoutProperty('rail-lines-unopened-label', 'visibility', 'none');
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
    // 겹침 규칙 ② (작업 8): 경로 범례와 처음 안내 카드는 둘 다 왼쪽 아래 — 길찾기를 쓰기 시작했으니 안내는 닫는다
    if (window.Guide && document.getElementById('guide-card')) window.Guide.close();
    legend.innerHTML = seen.map(x =>
      '<span><i style="background:' + x.color + '"></i>' + x.name + '</span>').join('');
    if (host) host.appendChild(legend);
  }

  const bounds = coords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
  // 길찾기 창이 가리는 쪽을 비워 둔다 — 데스크톱은 오른쪽 400px 창, 휴대폰은 바닥 시트
  const rp = document.getElementById('route-panel');
  const mobile = window.innerWidth <= 768;
  const sheet = mobile && rp && !rp.hidden ? Math.min(rp.getBoundingClientRect().height, window.innerHeight * 0.6) : 0;
  const pad = mobile
    ? { top: 70, bottom: Math.max(85, sheet + 70), left: 30, right: 30 }
    : { top: 115, bottom: 85, left: 70, right: 440 };
  try { map.fitBounds(bounds, { padding: pad, maxZoom: 12.2 }); }
  catch (e) { map.fitBounds(bounds, { padding: 40, maxZoom: 12.2 }); }   // 화면이 너무 작아 여백이 안 들어가면
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
  if (map.getLayer('rail-lines-unopened')) map.setPaintProperty('rail-lines-unopened', 'line-opacity', UNOPENED_OPACITY);
  if (map.getLayer('rail-lines-unopened-label')) map.setLayoutProperty('rail-lines-unopened-label', 'visibility', 'visible');
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
  // 출구 좌표는 부동산 거리 계산의 기준점이다(역 중심점은 최대 300m 틀린다).
  // 역 데이터와 함께 받아 두되, 실패해도 앱은 계속 돈다 — 출구가 없으면
  // StationExits 가 조용히 역 중심점으로 물러난다.
  //
  // 두 개를 다 받는다. 예전엔 여기서 return 으로 빠져나가서 아래 시세 로드가
  // 아예 실행되지 않았다 — 시세 섹션이 영원히 안 떴다. 병렬로 띄우고 둘 다 기다린다.
  const extra = [];
  // 출구(exits.geojson, 약 729KB)는 첫 화면에서 받지 않는다 (IMPL12 건 4). 지도에는 줌 16부터 그리고,
  // 거리 기준점으로는 역 상세·투자분석·역세권을 열 때 쓴다 → loadExits() 가 그때 한 번 받는다.
  // 시세·단지·도심 접근성·공급은 역 상세와 투자분석에서만 쓴다 → loadDetailData() 가 필요할 때 받는다.
  // 환승 도보 시간은 없어도 길찾기가 된다(기본 4분). 조용히 실패하고 넘어간다.
  extra.push(fetch('data/transfer-times.json')
    .then(r => r.ok ? r.json() : null)
    .then(doc => { if (doc) RouteFinder.loadTransfers(doc); })
    .catch(() => null));
  // 신분당선·GTX-A·공항철도 별도 운임표 (감사 N1~N3). 못 받아도 route-compare.js 의 같은 기본값으로 계산된다
  if (typeof RouteCompare !== 'undefined' && RouteCompare.loadSpecialFares) {
    extra.push(fetch('data/fares-special.json').then(r => r.ok ? r.json() : null)
      .then(doc => { if (doc) RouteCompare.loadSpecialFares(doc); }).catch(() => null));
  }
  // KTX 공식 운임표(2026-09-01, 약 15KB). 없거나 실패하면 KTX 요금은 모두 '추정'으로 표시된다.
  if (typeof RouteCompare !== 'undefined' && RouteCompare.loadKtxFares) {
    extra.push(fetch('data/ktx-fares.json')
      .then(r => r.ok ? r.json() : null)
      .then(doc => { if (doc) RouteCompare.loadKtxFares(doc); })
      .catch(() => null));
  }
  return Promise.all(extra);
});

/* 역 상세·투자분석 전용 데이터 — 첫 화면에서 받지 않는다.
 * 시세(431KB)·단지(1.3MB)·도심 접근성(88KB)·공급(277KB)은 역을 열거나 투자분석을 켜기 전에는
 * 아무 데도 쓰이지 않는데, 예전에는 첫 로딩에 함께 받았다(시세는 지도 준비까지 막았다).
 * 처음 필요해질 때 한 번만 받는다. 받는 동안·실패 시 동작은 예전과 같다:
 * 해당 절 없이 패널을 먼저 띄우고, 도착하면 열린 패널을 다시 그린다. 실패하면 그 절을 조용히 건너뛴다. */
let detailDataRequested = false;
// 출구 자료 — 필요해질 때 한 번만 받는다. 도착하면 출구 레이어를 만들고 열린 패널·결과를 다시 그린다.
// 그 전에는 각 모듈이 지금처럼 역 중심점으로 물러난다 (StationExits 가 준비 전이면 중심점).
let exitsRequested = false;
const EXITS_PRELOAD_ZOOM = 15.5;   // 줌 16(출구 표시 시작) 직전에 받기 시작해 16에서 바로 보이게
function loadExits() {
  if (exitsRequested || typeof StationExits === 'undefined') return;
  exitsRequested = true;
  StationExits.load('data/exits.geojson').then(() => {
    addExitLayers();
    if (typeof StationArea !== 'undefined' && StationArea.isOn && StationArea.isOn()) StationArea.refresh();
    if (typeof StationDetail !== 'undefined') StationDetail.refresh();
    if (typeof InvestAnalyzer !== 'undefined' && InvestAnalyzer.refresh) InvestAnalyzer.refresh();
  }).catch(() => null);
}
window.KR_loadExits = loadExits;   // station-area.js 가 역세권을 켤 때 부른다
window.KR_regionOf = id => regionOf.get(id) || '';   // commute.js — 동명역 지역 표시

// 투자 모드(js/mode.js) — 꺼져 있으면 시세·단지·공급을 받지 않는다(철도만 보는 사람은 약 2MB 절약).
// 도심 접근성(access.json)은 소요시간 = 철도 정보라 모드와 상관없이 받는다.
// KR_MODE 가 없으면(모듈을 못 불러옴) 예전 동작(전부 보임)으로 물러난다.
const investOn = () => typeof KR_MODE === 'undefined' || KR_MODE.isInvest();
let investDataRequested = false;
function detailRedraw(ok) {
  if (ok === false) return;
  if (typeof StationDetail !== 'undefined') StationDetail.refresh();
  if (typeof InvestAnalyzer !== 'undefined' && InvestAnalyzer.refresh) InvestAnalyzer.refresh();
}
function loadInvestData() {
  if (investDataRequested || !investOn()) return;
  investDataRequested = true;
  if (typeof StationPrice !== 'undefined') {
    StationPrice.load('data/station-price.json').then(detailRedraw).catch(() => null);
    StationPrice.loadComplexes('data/station-complex.json').then(detailRedraw);
  }
  if (typeof StationDev !== 'undefined') StationDev.load('data/station-dev.json').then(detailRedraw);
  if (typeof StationMarket !== 'undefined') StationMarket.load('data/station-market.json').then(detailRedraw);   // 실거래 7종 (2026-11-09)
  if (typeof StationJeonse !== 'undefined') StationJeonse.load('data/station-jeonse.json').then(detailRedraw);   // 전세가율 — 같은 집끼리 짝 (2026-11-11)
}
function loadDetailData(opts) {
  // 쉬는 동안 미리 받기(prefetch)에서는 출구까지 받지 않는다 — 역을 열거나 분석을 켤 때만
  if (!(opts && opts.prefetch)) loadExits();
  loadInvestData();   // 투자 모드일 때만, 한 번만
  if (detailDataRequested) return;
  detailDataRequested = true;
  if (typeof StationAccess !== 'undefined') StationAccess.load('data/access.json').then(detailRedraw);
}
// 역 상세 패널이 처음 열릴 때 (지도 load 전에 검색으로 여는 경우도 포함)
if (typeof StationDetail !== 'undefined') StationDetail.beforeShow = loadDetailData;
// 첫 화면이 다 뜬 뒤 쉬는 동안 미리 받기 (IMPL10) — 지도 준비(dataReady) 뒤 첫 렌더가 끝나고(idle),
// 브라우저가 한가할 때(requestIdleCallback, 없으면 2초 뒤) loadDetailData() 를 부른다.
// 이미 받았거나 받는 중이면 loadDetailData() 가 그냥 돌아온다(한 번만 받기). 그 전에 역을 열면 즉시 받기 그대로.
function prefetchDetailData() {
  const go = () => loadDetailData({ prefetch: true });
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(go, { timeout: 5000 });
  else setTimeout(go, 2000);
}
let firstReadyDone = false;
Promise.all([styleReadyP, dataPromise]).then(() => {
  if (firstReadyDone) return;   // 한 번만
  firstReadyDone = true;
  dataReady = true;
  map.once('idle', prefetchDetailData);   // 첫 화면 준비를 방해하지 않게 준비 완료 뒤에만
  // 처음 온 사람 안내 (js/guide.js) — 지도가 다 뜬 뒤 한 번
  map.once('idle', () => { if (typeof Guide !== 'undefined') Guide.show(); });
  addDataLayers(); updateFilters();
  addExitLayers();
  // 출구 표시 줌에 가까워지면 출구 자료를 받는다 (첫 화면이 이미 그 줌이면 바로)
  const exitsByZoom = () => { if (map.getZoom() >= EXITS_PRELOAD_ZOOM) loadExits(); };
  map.on('zoomend', exitsByZoom); exitsByZoom();
  DrawTools.setStations(STATIONS);
  DrawTools.refreshMyLines(); DrawTools.renderMyLineList();
  DrawTools.refreshMemos();
  loadFavorites(); renderFavorites();
  // 새 모듈 초기화
  if (typeof DiagramMode !== 'undefined') {
    DiagramMode.init(map, LINES, STATIONS);
    // 노선도 카드의 출발·도착 — 역 상세 패널과 같은 경로(역 ID 로 지정 → 길찾기 패널 열기)
    DiagramMode.onAction = (action, stationName, stationId) => {
      if (action === 'from' || action === 'to') routeFromStation(stationName, action, stationId);
      else if (action === 'info') {
        const s = (stationId && STATIONS.find(x => x.properties.id === stationId)) || STATIONS.find(x => x.properties.name_ko === stationName);
        if (!s) return;
        map.easeTo({ center: s.geometry.coordinates, zoom: Math.max(map.getZoom(), 13) });
        showStation(s);
      }
    };
  }
  if (typeof StationDetail !== 'undefined') {
    StationDetail.init(map, LINES, STATIONS);
    // 역 상세 패널의 액션 버튼 연동
    StationDetail.onAction = (action, stationName, stationId) => {
      if (action === 'from' || action === 'to') {
        routeFromStation(stationName, action, stationId);
      } else if (action === 'fav') {
        toggleFavStation(stationName, stationId);
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
  if (typeof CommuteMap !== 'undefined') CommuteMap.init(map, STATIONS);
  if (typeof StationJeonse !== 'undefined' && StationJeonse.initLayer) StationJeonse.initLayer(map, STATIONS);   // 전세가율 색칠 레이어
  if (typeof StationRocket !== 'undefined') StationRocket.init(map, STATIONS);   // 🚀 떡상 지도 레이어 (rank.json, 켤 때 받음)
  if (typeof RocketPanel !== 'undefined' && RocketPanel.init) RocketPanel.init(map, STATIONS);   // 🚀 지도 안 떡상 패널 (?rocket=1 이면 바로 연다)
  if (typeof StationArea !== 'undefined') { StationArea.init(map, STATIONS); StationArea.setLines([...visibleLines]); }
  if (!focusLineFromUrl()) restoreFromUrl();
}).catch(e => { console.error('첫 화면 준비 실패', e); setStatus('지도 자료를 불러오지 못했습니다. 새로고침해 주세요.'); });
// 베이스맵 교체(setStyle) 시 커스텀 레이어가 날아가므로 복원
// styleReady=true 는 style.load 경로. 이 시점엔 스타일 JSON 이 적용돼 addLayer 가
// 가능하지만, 타일·스프라이트가 덜 와서 isStyleLoaded() 는 아직 false 다 (실측).
// 그래서 style.load 에서는 isStyleLoaded 검사를 건너뛴다.
function restoreCustomLayers(styleReady) {
  if (dataReady && (styleReady === true || map.isStyleLoaded()) && !map.getSource('lines')) {
    addDataLayers(); updateFilters(); DrawTools.restyle();
    addExitLayers();
    if (typeof StationArea !== 'undefined') StationArea.restore();
    if (typeof StationJeonse !== 'undefined' && StationJeonse.restore) StationJeonse.restore();
    if (typeof StationRocket !== 'undefined') StationRocket.restore();
  }
}
map.on('style.load', () => restoreCustomLayers(true));
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
function myLocationData() {
  return { type: 'FeatureCollection', features: lastLocation ? [{
    type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: lastLocation }
  }] : [] };
}
document.getElementById('locate-btn').addEventListener('click', () => {
  if (!navigator.geolocation) { setStatus('위치 정보를 지원하지 않는 브라우저입니다.'); return; }
  setStatus('위치 확인 중…');
  navigator.geolocation.getCurrentPosition(pos => {
    const lng = pos.coords.longitude, lat = pos.coords.latitude;
    // 내 위치 표시
    lastLocation = [lng, lat];
    if (map.getSource('my-location')) map.getSource('my-location').setData(myLocationData());
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
  // 역 즐겨찾기는 { name, id } 로 저장한다 (경로 즐겨찾기의 fromId/toId 와 같은 방식).
  // 옛 저장분은 이름 문자열이다. 이름이 하나뿐인 역이면 그 역 ID 로 바꿔 읽고,
  // 동명역 이름(어느 역인지 모름)은 문자열 그대로 둔다 — 깨지지 않게, 추측하지 않게.
  favorites.stations = favorites.stations.map(e => {
    if (typeof e !== 'string') return e;
    const same = STATIONS.filter(s => s.properties.name_ko === e);
    return same.length === 1 ? { name: e, id: same[0].properties.id } : e;
  });
}
function saveFavorites() {
  try { localStorage.setItem(FAV_KEY, JSON.stringify(favorites)); } catch {}
}
// 항목이 그 역인가: ID 가 있는 항목은 ID 로, 옛 이름 문자열은 이름으로 (그 이름의 어느 역이든)
function favMatches(e, name, id) {
  if (typeof e === 'string') return e === name;
  return id ? e.id === id : e.name === name;
}
function isFavStation(name, id) { return favorites.stations.some(e => favMatches(e, name, id)); }
function toggleFavStation(name, id) {
  const i = favorites.stations.findIndex(e => favMatches(e, name, id));
  if (i >= 0) favorites.stations.splice(i, 1);
  else favorites.stations.push(id ? { name, id } : name);
  saveFavorites(); renderFavorites();
}
function renderFavorites() {
  const box = document.getElementById('fav-list');
  if (!box) return;
  box.innerHTML = '';
  if (favorites.stations.length) {
    const h = document.createElement('div'); h.className = 'panel-head'; h.textContent = '즐겨찾는 역';
    box.appendChild(h);
    const nameCount = {};
    STATIONS.forEach(x => { nameCount[x.properties.name_ko] = (nameCount[x.properties.name_ko] || 0) + 1; });
    favorites.stations.forEach(e => {
      const name = typeof e === 'string' ? e : e.name;
      const byId = typeof e === 'string' ? null : stationById(e.id);
      const div = document.createElement('div'); div.className = 'fav-item';
      // 동명역은 지역(있으면)이나 노선으로 구분해 보인다
      div.textContent = byId && nameCount[name] > 1
        ? name + ' · ' + (regionOf.get(byId.properties.id) || stationLinesLabel(byId))
        : name;
      if (byId) div.dataset.sid = byId.properties.id;
      div.onclick = () => {
        const s = byId || STATIONS.find(x => x.properties.name_ko === name);
        if (s) {
          map.flyTo({ center: s.geometry.coordinates, zoom: 14 });
          showStation(s, { lng: s.geometry.coordinates[0], lat: s.geometry.coordinates[1] });
        }
      };
      const del = document.createElement('button'); del.innerHTML = Icons.svg('close'); del.setAttribute('aria-label', '삭제'); del.className = 'memo-del';
      del.onclick = (ev) => { ev.stopPropagation(); const i = favorites.stations.indexOf(e); if (i >= 0) favorites.stations.splice(i, 1); saveFavorites(); renderFavorites(); };
      div.appendChild(del); box.appendChild(div);
    });
  }
  if (favorites.routes.length) {
    const h = document.createElement('div'); h.className = 'panel-head'; h.textContent = '저장된 경로';
    box.appendChild(h);
    favorites.routes.forEach((r, i) => {
      const div = document.createElement('div'); div.className = 'fav-item';
      div.textContent = `${r.from} → ${r.to}`;
      div.onclick = () => {
        document.getElementById('route-panel').hidden = false;
        setRouteStation(document.getElementById('route-from'), stationById(r.fromId) || r.from);
        setRouteStation(document.getElementById('route-to'), stationById(r.toId) || r.to);
        document.getElementById('route-go').click();
      };
      const del = document.createElement('button'); del.innerHTML = Icons.svg('close'); del.setAttribute('aria-label', '삭제'); del.className = 'memo-del';
      del.onclick = (e) => { e.stopPropagation(); favorites.routes.splice(i, 1); saveFavorites(); renderFavorites(); };
      div.appendChild(del); box.appendChild(div);
    });
  }
  if (!favorites.stations.length && !favorites.routes.length) {
    box.innerHTML = '<p class="empty">역 팝업의 ' + Icons.svg('star') + ' 버튼으로 즐겨찾기를 추가하세요</p>';
  }
}

/* ---------- 역 클릭 팝업: 출발지/도착지 지정 ---------- */
let stationPopup = null;
function closeStationPopup() {
  if (stationPopup) { stationPopup.remove(); stationPopup = null; }
}
// 역을 골랐을 때 여는 화면.
// 예전에는 지도 위 작은 팝업만 띄웠는데, 팝업에는 노선 이름만 있고
// 인접역·출구·환승 정보가 없었다. 그걸 다 담은 역 상세 패널이 따로 있는데
// **아무도 그 패널을 열어주지 않아서** 한 번도 화면에 나온 적이 없었다.
// 이제 선택은 패널로 통일하고, 패널 모듈을 못 불러왔을 때만 팝업으로 물러난다.
function showStation(feature, lngLat) {
  rememberStation(feature);
  closeStationPopup();
  if (typeof StationDetail !== 'undefined' && StationDetail.show) {
    StationDetail.show(feature);
    return;
  }
  openStationPopup(feature, lngLat);
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
      '<button data-act="fav">' + Icons.svg(isFavStation(sname, p.id) ? 'star_on' : 'star') + ' 즐겨찾기</button>' +
    '</div>';
  el.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', ev => {
      ev.stopPropagation();
      const act = b.dataset.act;
      if (act === 'fav') {
        toggleFavStation(sname, p.id);
        b.innerHTML = Icons.svg(isFavStation(sname, p.id) ? 'star_on' : 'star') + ' 즐겨찾기';
        return;
      }
      setRouteStation(document.getElementById(act === 'from' ? 'route-from' : 'route-to'), orig || sname);
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
  // 떡상 패널이 열려 있으면 패널이 그 역을 보여 준다 (역 상세는 패널의 '역 상세' 버튼으로)
  if (typeof RocketPanel !== 'undefined' && RocketPanel.handleMapClick && RocketPanel.handleMapClick(feats[0])) return;
  showStation(feats[0], e.lngLat);
});
map.on('mouseenter', 'rail-stations', () => { map.getCanvas().style.cursor = 'pointer'; });
map.on('mouseleave', 'rail-stations', () => { map.getCanvas().style.cursor = ''; });

// 다이어그램 모드 / 노선 비교 버튼
document.getElementById('diagram-btn').addEventListener('click', () => {
  if (typeof DiagramMode === 'undefined') { setStatus('다이어그램 모듈을 불러오지 못했습니다.'); return; }
  DiagramMode.isActive() ? DiagramMode.exit() : DiagramMode.enter();
});
document.getElementById('compare-btn').addEventListener('click', () => {
  if (typeof LineCompare === 'undefined') { setStatus('비교 모듈을 불러오지 못했습니다.'); return; }
  LineCompare.show();
});

// DiagramMode에서 역 클릭 시 팝업을 띄우기 위한 전역 노출
window.openStationPopup = openStationPopup;
window.showStation = showStation;   // commute.js 목록에서 역 상세 열기

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
  if (on) loadDetailData();   // 투자분석 결과의 도심 접근성·공급 절
  InvestAnalyzer.setMode(on);
  document.getElementById('invest-btn').classList.toggle('active', on);
  if (on) setStatus('투자분석: 분석할 지점을 클릭하세요 (Esc 취소)');
});
// 투자 모드 스위치 — 툴바 '🏠 투자' 와 역 상세 맨 아래 안내 줄이 같은 KR_MODE 를 바꾼다.
if (typeof KR_MODE !== 'undefined') {
  document.getElementById('mode-btn').addEventListener('click', () => KR_MODE.toggle());
  KR_MODE.onChange(mode => {
    if (mode === 'invest') {
      loadDetailData({ prefetch: true });   // 시세·단지·공급을 지금 받기 시작 (출구는 원래 규칙대로)
      setStatus('투자 모드: 역 상세에 시세·단지·공급이 보입니다');
    } else {
      if (typeof InvestAnalyzer !== 'undefined' && InvestAnalyzer.isActive()) {
        InvestAnalyzer.setMode(false);
        document.getElementById('invest-btn').classList.remove('active');
      }
      setStatus('철도 모드: 부동산 정보를 숨겼습니다');
    }
    if (typeof StationDetail !== 'undefined') StationDetail.refresh();
  });
}
document.getElementById('commute-btn').addEventListener('click', () => {
  if (typeof CommuteMap === 'undefined') { setStatus('통근권 모듈을 불러오지 못했습니다.'); return; }
  if (!dataReady) { setStatus('노선 데이터를 불러오는 중입니다'); return; }
  CommuteMap.isActive() ? CommuteMap.hide() : CommuteMap.show();
});
document.getElementById('coverage-btn').addEventListener('click', () => {
  if (typeof CoverageMap === 'undefined') { setStatus('영향권 모듈을 불러오지 못했습니다.'); return; }
  // 버튼 켜짐 표시는 CoverageMap.show()/hide() 가 맡는다 (패널 ✕ 로 닫을 때도 같이 꺼지게)
  CoverageMap.isActive() ? CoverageMap.hide() : CoverageMap.show();
});

/* 툴바 드롭다운은 ui.js 의 initDropdowns() 가 맡는다.
 *
 * 여기서 한 번 더 리스너를 달면 안 된다. 같은 버튼에 두 개가 붙으면
 * 첫 번째가 'open' 을 붙이고 두 번째가 '이미 열려 있네' 하고 다시 닫아서,
 * 도구·분석·저장 버튼이 아무 반응도 하지 않는 것처럼 보인다.
 * (사이드바 토글에서 똑같은 사고가 있었다 — 위 주석 참고)
 * aria-expanded 갱신과 바깥 클릭 닫기도 ui.js 쪽에만 있다. */


/* ---------- 지도 위 역 키보드 탐색 (접근성) ----------
 * 지도(캔버스)에 포커스가 있을 때:
 *   N 또는 ]  : 다음 역 (화면 가운데에서 가까운 순)
 *   P 또는 [  : 이전 역
 *   Enter     : 고른 역의 상세 열기
 *   Esc       : 고르기 끝내기
 * 화살표·+/- 는 MapLibre 기본(지도 이동·확대)을 그대로 둔다.
 * 한글 자판에서도 되도록 e.key 가 아니라 e.code(KeyN·KeyP·BracketLeft/Right)로 본다.
 * 고른 역은 둥근 테두리로 보이고, 이름·노선은 상태 줄(aria-live)로 읽어 준다. */
const KbNav = (() => {
  let list = [], idx = -1, marker = null, chosen = null;
  function candidates() {
    const b = map.getBounds(), c = map.getCenter();
    const cos = Math.cos(c.lat * Math.PI / 180);
    return STATIONS
      .filter(s => (s.properties.lines || []).some(l => visibleLines.has(l)) && b.contains(s.geometry.coordinates))
      .map(s => { const [x, y] = s.geometry.coordinates; return { s, d: ((x - c.lng) * cos) ** 2 + (y - c.lat) ** 2 }; })
      .sort((a, z) => a.d - z.d)
      .slice(0, 200)
      .map(o => o.s);
  }
  function show(s) {
    chosen = s;
    if (!marker) {
      const el = document.createElement('div');
      el.className = 'kb-station-ring';
      el.setAttribute('aria-hidden', 'true');
      marker = new maplibregl.Marker({ element: el });
    }
    marker.setLngLat(s.geometry.coordinates).addTo(map);
    const lines = (s.properties.lines || []).map(l => lineNameOf.get(l) || l).slice(0, 4).join('·');
    setStatus(`${s.properties.name_ko}역 (${lines}) — ${idx + 1}/${list.length}. Enter: 열기 · N/P: 다음/이전`);
  }
  function step(dir) {
    // 지도가 움직였으면 목록을 다시 만든다 (지금 고른 역은 그대로 출발점으로)
    const fresh = candidates();
    if (!fresh.length) { setStatus('화면 안에 역이 없습니다. 지도를 옮기거나 축소해 보세요'); return; }
    const same = fresh.length === list.length && fresh.every((s, i) => s === list[i]);
    if (!same) { list = fresh; idx = chosen ? list.indexOf(chosen) : -1; }
    idx = idx < 0 ? (dir > 0 ? 0 : list.length - 1) : (idx + dir + list.length) % list.length;
    show(list[idx]);
  }
  function clear() { chosen = null; idx = -1; list = []; if (marker) marker.remove(); }
  function onKey(e) {
    if (!dataReady || e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.code;
    if (k === 'KeyN' || k === 'BracketRight') { e.preventDefault(); step(1); }
    else if (k === 'KeyP' || k === 'BracketLeft') { e.preventDefault(); step(-1); }
    else if (k === 'Enter' && chosen) { e.preventDefault(); const s = chosen; showStation(s, s.geometry.coordinates); }
    else if (k === 'Escape' && chosen) { clear(); setStatus('역 고르기를 끝냈습니다'); }
  }
  const canvas = map.getCanvas();
  canvas.setAttribute('aria-label', '지도. 화살표: 이동, +/−: 확대·축소, N/P: 화면 안의 역을 하나씩 고르기, Enter: 고른 역 열기');
  canvas.addEventListener('keydown', onKey);
  canvas.addEventListener('blur', () => { if (marker) marker.remove(); });
  canvas.addEventListener('focus', () => { if (chosen && marker) marker.addTo(map); });
  return { step, clear, current: () => chosen };
})();
