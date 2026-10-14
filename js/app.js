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
  center: [127.9, 36.35],
  zoom: 7,
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
  document.querySelectorAll('#toolbar [data-style]').forEach(b =>
    b.classList.toggle('active', b.dataset.style === mode));
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
    const [l, s] = await Promise.all([
      fetch('data/lines.geojson').then(r => { if (!r.ok) throw new Error('lines'); return r.json(); }),
      fetch('data/stations.geojson').then(r => { if (!r.ok) throw new Error('stations'); return r.json(); })
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
      'line-width': ['interpolate', ['linear'], ['zoom'], 7, 1.5, 12, 4, 16, 7],
      'line-opacity': 0.9
    }
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
function renderLineList() {
  const box = document.getElementById('line-list');
  box.innerHTML = '';
  const groups = {};
  LINES.forEach(f => {
    const c = f.properties.category || 'etc';
    (groups[c] = groups[c] || []).push(f);
  });
  Object.keys(groups).sort().forEach(cat => {
    const det = document.createElement('details'); det.open = true;
    const sum = document.createElement('summary');
    sum.textContent = `${CAT_NAMES[cat] || cat} (${groups[cat].length})`;
    det.appendChild(sum);
    groups[cat].forEach(f => {
      const p = f.properties;
      const label = document.createElement('label');
      label.className = 'line-item';
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = true;
      cb.addEventListener('change', () => {
        cb.checked ? visibleLines.add(p.id) : visibleLines.delete(p.id);
        updateFilters();
      });
      const sw = document.createElement('span');
      sw.className = 'swatch'; sw.style.background = p.color || '#888888';
      label.append(cb, sw, document.createTextNode(p.name_ko || p.id));
      if (p.note) label.title = p.note;
      if (p.status !== 'open') label.title = (label.title ? label.title + ' / ' : '') +
        (p.status === 'construction' ? '공사 중' : '계획 중');
      det.appendChild(label);
    });
    box.appendChild(det);
  });
  document.getElementById('line-count').textContent = `(${LINES.length})`;
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
      map.flyTo({ center: f.geometry.coordinates, zoom: 14 });
      searchBox.innerHTML = '';
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
  try { await navigator.clipboard.writeText(location.href); setStatus('링크 복사됨'); }
  catch { setStatus('링크 복사에 실패했습니다'); }
});

/* ---------- 길찾기 UI ---------- */
const lineNameOf = new Map();
function setupRouteFinder() {
  LINES.forEach(f => lineNameOf.set(f.properties.id, f.properties.name_ko));
  const info = RouteFinder.buildGraph(LINES, STATIONS);
  console.log('route graph:', info);
  const dl = document.getElementById('station-list');
  const seen = new Set();
  STATIONS.forEach(s => {
    const n = s.properties.name_ko;
    if (seen.has(n)) return;
    seen.add(n);
    const o = document.createElement('option');
    o.value = n;
    dl.appendChild(o);
  });
}
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
document.getElementById('route-go').addEventListener('click', () => {
  const box = document.getElementById('route-result');
  const from = resolveStation(document.getElementById('route-from').value);
  const to = resolveStation(document.getElementById('route-to').value);
  if (!from || !to) { box.innerHTML = '출발역과 도착역을 목록에서 선택해주세요.'; return; }
  const r = RouteFinder.findRoute(from.properties.id, to.properties.id);
  if (!r) { box.innerHTML = '경로를 찾을 수 없습니다.'; return; }
  const sname = id => {
    const s = STATIONS.find(x => x.properties.id === id);
    return s ? s.properties.name_ko : id;
  };
  let html = `<div class="total">총 약 ${r.minutes}분 · 환승 ${r.transfers}회</div>`;
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
      html += `<div class="leg">${a} → <b>${ln}</b> ${n}개역 → ${b}</div>`;
    }
  });
  box.innerHTML = html;
});

/* ---------- 시작 ---------- */
renderThemes();
applyView();
DrawTools.init(map, setStatus);
map.on('load', async () => {
  await loadData();
  dataReady = true;
  addDataLayers(); renderLineList(); updateFilters(); setupRouteFinder();
});
// 베이스맵 교체(setStyle) 시 커스텀 레이어가 날아가므로 복원
function restoreCustomLayers() {
  if (dataReady && map.isStyleLoaded() && !map.getSource('lines')) {
    addDataLayers(); updateFilters(); DrawTools.restyle();
  }
}
map.on('style.load', restoreCustomLayers);
map.on('styledata', restoreCustomLayers); // 동일 스타일 재적용 등 style.load 미발화 대비 안전망

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
  const lineTxt = lineIds.length ? lineIds.map(lid => lineNameOf.get(lid) || lid).join(' · ') : '노선 정보 없음';
  const el = document.createElement('div');
  el.className = 'st-popup';
  el.innerHTML =
    '<div class="st-name">' + sname + '</div>' +
    '<div class="st-lines">' + lineTxt + '</div>' +
    '<div class="st-btns">' +
      '<button data-act="from">출발지</button>' +
      '<button data-act="to">도착지</button>' +
    '</div>';
  el.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', ev => {
      ev.stopPropagation();
      const act = b.dataset.act;
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
  try { feats = map.queryRenderedFeatures(e.point, { layers: ['rail-stations'] }); } catch (_) { return; }
  if (!feats.length) return;
  openStationPopup(feats[0], e.lngLat);
});
map.on('mouseenter', 'rail-stations', () => { map.getCanvas().style.cursor = 'pointer'; });
map.on('mouseleave', 'rail-stations', () => { map.getCanvas().style.cursor = ''; });
