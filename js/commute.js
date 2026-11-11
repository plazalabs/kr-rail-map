/* 통근권 찾기 (CommuteMap) — "직장(목적지) 역까지 N분 안에 닿는 역" 을 지도에 색으로 보여준다
 *
 * 왜 필요한가
 *   길찾기는 두 역 사이 한 번, 도심 접근성은 정해진 거점 5곳까지만 잰다. 집을 구할 때 실제로 묻는 건
 *   "내 직장까지 45분 안에 갈 수 있는 역이 어디냐" 다. 투자 모드에서는 그 역들의 시세를 함께 보여 줘
 *   '같은 통근 시간이면 어디가 싼가' 를 바로 비교할 수 있게 한다.
 *
 * 시간 계산
 *   RouteFinder.allTimesFrom() 을 그대로 쓴다 — 길찾기·도심 접근성과 같은 규칙(운행 속도·환승 도보·
 *   접근 시간)이라 같은 두 역이면 같은 분이 나온다. 철도 그래프는 양방향이라 '목적지에서 모든 역까지'
 *   를 '모든 역에서 목적지까지' 로 읽는다. 추정값이다(시각표·배차 대기 미반영) — 화면에도 적는다.
 *   개통 예정 노선은 기본으로 빼고, 켠 사람만 넣는다 (2026-11-09 결정 1 과 같은 규칙).
 *
 * 시세
 *   투자 모드이고 시세 자료(StationPrice)가 준비됐을 때만 '법정동 아파트 매매 중위 평당가' 를 붙인다.
 *   시세가 없는 역은 '—'. 지어내지 않는다.
 */
(function () {
  'use strict';

  let map = null, ST = [], byId = new Map();
  let panel = null, active = false;
  let destId = null, maxMin = 45, withUnopened = false, sortBy = 'time';
  let lastRows = [];
  const BANDS = [
    [15, '#1b7f3b', '15분'], [30, '#43a047', '30분'], [45, '#f9a825', '45분'],
    [60, '#ef6c00', '60분'], [90, '#c62828', '90분'],
  ];
  const LIMITS = [30, 45, 60, 90];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function bandOf(min) { for (const b of BANDS) if (min <= b[0]) return b; return null; }
  function priceOn() {
    return typeof StationPrice !== 'undefined' && StationPrice.isReady()
      && (typeof KR_MODE === 'undefined' || KR_MODE.isInvest());
  }
  function regionLabel(id) {
    return (typeof window.KR_regionOf === 'function' && window.KR_regionOf(id)) || '';
  }

  /* 역 이름 → 후보. 동명역은 지역·노선으로 구분해 '시청 · 부산 연제구' 처럼 보여 준다 */
  function optionLabel(s) {
    const p = s.properties;
    const same = ST.filter(x => x.properties.name_ko === p.name_ko).length > 1;
    if (!same) return p.name_ko;
    const reg = regionLabel(p.id);
    return p.name_ko + ' · ' + (reg || (p.lines || [])[0] || p.id);
  }
  function findByLabel(text) {
    const t = String(text || '').trim();
    if (!t) return null;
    const exact = ST.find(s => optionLabel(s) === t);
    if (exact) return exact;
    const byName = ST.filter(s => s.properties.name_ko === t || s.properties.name_ko + '역' === t);
    return byName.length ? byName[0] : null;
  }

  /* 계산 — 지도 없이도 돈다 (테스트용) */
  function compute(destStationId, limitMin, opts) {
    if (typeof RouteFinder === 'undefined' || !RouteFinder.allTimesFrom) return [];
    const times = RouteFinder.allTimesFrom(destStationId, { openOnly: !(opts && opts.withUnopened) });
    const rows = [];
    times.forEach((min, id) => {
      if (id === destStationId || min > limitMin) return;
      const s = byId.get(id);
      if (!s) return;
      rows.push({ id, name: s.properties.name_ko, min, coord: s.geometry.coordinates });
    });
    rows.sort((a, b) => a.min - b.min || a.name.localeCompare(b.name, 'ko'));
    return rows;
  }

  function injectCss() {
    if (document.getElementById('cm-style')) return;
    const st = document.createElement('style');
    st.id = 'cm-style';
    st.textContent = `
#cm-panel{position:absolute;top:70px;right:12px;width:320px;max-height:calc(100% - 140px);overflow-y:auto;
background:var(--panel-bg,#fff);color:var(--text,#222);border:1px solid var(--border,#ddd);border-radius:10px;
box-shadow:0 4px 18px rgba(0,0,0,.25);z-index:39;font-size:13px}
#cm-head{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;font-weight:700;
border-bottom:1px solid var(--border,#ddd)}
#cm-close{background:none;border:none;font-size:16px;cursor:pointer;color:var(--muted,#888)}
#cm-body{padding:10px 12px}
.cm-row{margin-bottom:10px}
.cm-row label{display:block;font-size:12px;color:var(--muted,#888);margin-bottom:4px}
#cm-dest,#cm-limit,#cm-sort{width:100%;padding:6px;border-radius:6px;border:1px solid var(--border,#ddd);
background:var(--bg,#fff);color:var(--text,#222);font-size:13px;box-sizing:border-box}
.cm-check{display:flex;gap:6px;align-items:center;font-size:12px}
.cm-legend{display:flex;flex-wrap:wrap;gap:8px;font-size:11px;margin:6px 0}
.cm-legend i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:3px;vertical-align:-1px}
#cm-summary{background:var(--bg,#f5f5f5);border-radius:8px;padding:8px 10px;margin-bottom:8px;line-height:1.6}
#cm-list{list-style:none;margin:0;padding:0}
#cm-list li button{display:flex;width:100%;justify-content:space-between;gap:8px;padding:5px 4px;border:0;
border-bottom:1px solid var(--border,#eee);background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}
#cm-list li button:hover,#cm-list li button:focus-visible{background:var(--bg,#f5f5f5)}
#cm-list .cm-min{font-weight:700;white-space:nowrap}
#cm-list .cm-pp{color:var(--muted,#666);white-space:nowrap;font-size:12px}
.cm-note{font-size:11px;color:var(--muted,#888);margin-top:8px;line-height:1.5}
@media(max-width:768px){#cm-panel{top:auto;bottom:calc(70px + env(safe-area-inset-bottom));right:12px;left:12px;width:auto;max-height:55%}}
`;
    document.head.appendChild(st);
  }

  function ensurePanel() {
    injectCss();
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = 'cm-panel';
    panel.style.display = 'none';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', '통근권 찾기');
    const opts = ST.map(optionLabel).sort((a, b) => a.localeCompare(b, 'ko'))
      .map(l => `<option value="${esc(l)}"></option>`).join('');
    panel.innerHTML = `
<div id="cm-head">통근권 찾기 <button id="cm-close" aria-label="닫기">✕</button></div>
<div id="cm-body">
  <div class="cm-row">
    <label for="cm-dest">직장(목적지) 역</label>
    <input id="cm-dest" list="cm-dest-list" placeholder="예: 강남" autocomplete="off">
    <datalist id="cm-dest-list">${opts}</datalist>
  </div>
  <div class="cm-row">
    <label for="cm-limit">최대 소요 시간</label>
    <select id="cm-limit">${LIMITS.map(m => `<option value="${m}"${m === maxMin ? ' selected' : ''}>${m}분 안</option>`).join('')}</select>
  </div>
  <div class="cm-row cm-check"><input type="checkbox" id="cm-unopened"><label for="cm-unopened" style="margin:0;color:inherit">개통 예정 노선 포함 (개통 후 기준)</label></div>
  <div class="cm-row"><label for="cm-sort">정렬</label>
    <select id="cm-sort"><option value="time">가까운 순 (분)</option><option value="price">시세 낮은 순 (투자 모드)</option><option value="jr-low">전세가율 낮은 순 (투자 모드)</option><option value="jr-high">전세가율 높은 순 (투자 모드)</option></select></div>
  <div class="cm-legend" aria-hidden="true">${BANDS.map(b => `<span><i style="background:${b[1]}"></i>${b[2]}</span>`).join('')}</div>
  <div id="cm-summary" role="status" aria-live="polite"></div>
  <ul id="cm-list"></ul>
  <div class="cm-note">소요 시간은 운행 속도·환승 도보·승강장 접근 시간으로 낸 <b>추정값</b>입니다(시각표·배차 대기 미반영, ±20~30%).
  길찾기와 같은 계산입니다. 시세는 투자 모드에서 역이 속한 법정동의 아파트 매매 중위 평당가(최근 6개월)이며, 역 바로 옆 값이 아닙니다. 전세가율은 같은 단지·같은 면적의 매매·신규 전세 짝의 중위값(80% 이상 ⚠).</div>
</div>`;
    document.body.appendChild(panel);
    const dest = panel.querySelector('#cm-dest');
    panel.querySelector('#cm-close').addEventListener('click', hide);
    dest.addEventListener('change', () => { const s = findByLabel(dest.value); if (s) { destId = s.properties.id; render(true); } });
    dest.addEventListener('keydown', e => { if (e.key === 'Enter') { const s = findByLabel(dest.value); if (s) { destId = s.properties.id; render(true); } } });
    panel.querySelector('#cm-limit').addEventListener('change', e => { maxMin = +e.target.value; render(true); });
    panel.querySelector('#cm-unopened').addEventListener('change', e => { withUnopened = e.target.checked; render(false); });
    panel.querySelector('#cm-sort').addEventListener('change', e => { sortBy = e.target.value; renderList(); });
    panel.querySelector('#cm-list').addEventListener('click', e => {
      const b = e.target.closest('button[data-id]');
      if (!b) return;
      const s = byId.get(b.dataset.id);
      if (s && typeof window.showStation === 'function') window.showStation(s, s.geometry.coordinates);
    });
    return panel;
  }

  function ensureLayers() {
    if (!map.getSource('cm-stations')) {
      map.addSource('cm-stations', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'cm-stations', type: 'circle', source: 'cm-stations',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 3.5, 12, 7],
          'circle-color': ['get', 'color'], 'circle-opacity': 0.9,
          'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.2
        }
      });
    }
    if (!map.getSource('cm-dest')) {
      map.addSource('cm-dest', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'cm-dest', type: 'circle', source: 'cm-dest',
        paint: { 'circle-radius': 10, 'circle-color': '#1a73e8', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 }
      });
    }
  }

  function render(fit) {
    ensurePanel();
    const sum = panel.querySelector('#cm-summary');
    const dest = byId.get(destId);
    if (!dest) { sum.textContent = '직장(목적지) 역을 고르세요.'; panel.querySelector('#cm-list').innerHTML = ''; return; }
    panel.querySelector('#cm-dest').value = optionLabel(dest);
    lastRows = compute(destId, maxMin, { withUnopened });
    try {
      ensureLayers();
      map.getSource('cm-stations').setData({
        type: 'FeatureCollection',
        features: lastRows.map(r => ({ type: 'Feature', properties: { id: r.id, min: r.min, color: bandOf(r.min)[1] }, geometry: { type: 'Point', coordinates: r.coord } }))
      });
      map.getSource('cm-dest').setData({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: dest.geometry.coordinates } }] });
      if (fit && lastRows.length) {
        let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
        for (const r of lastRows.concat([{ coord: dest.geometry.coordinates }])) {
          a = Math.min(a, r.coord[0]); b = Math.min(b, r.coord[1]); c = Math.max(c, r.coord[0]); d = Math.max(d, r.coord[1]);
        }
        map.fitBounds([[a, b], [c, d]], { padding: 60, duration: 500, maxZoom: 13 });
      }
    } catch (e) { /* 스타일 교체 중이면 style.load 에서 다시 그린다 */ }
    const per = BANDS.filter(b => b[0] <= maxMin).map(b => {
      const n = lastRows.filter(r => r.min <= b[0]).length;
      return `${b[2]} 안 <b>${n}</b>역`;
    }).join(' · ');
    sum.innerHTML = `<b>${esc(dest.properties.name_ko)}</b>까지 ${maxMin}분 안: <b>${lastRows.length}</b>역` +
      (withUnopened ? ' (개통 예정 포함)' : '') + '<br>' + per;
    renderList();
  }

  function renderList() {
    if (!panel) return;
    const ul = panel.querySelector('#cm-list');
    const pOn = priceOn();
    let rows = lastRows.map(r => {
      const p = pOn ? StationPrice.of(r.id) : null;
      // 전세가율 (같은 단지·같은 면적 짝의 중위 — js/jeonse.js). 짝이 3쌍 미만이면 없음
      const j = pOn && typeof StationJeonse !== 'undefined' && StationJeonse.isReady() ? StationJeonse.of(r.id) : null;
      return Object.assign({}, r, { pp: p && p.medianPerPyeong != null ? p.medianPerPyeong : null, jr: j && j.r != null ? j.r : null });
    });
    if (sortBy === 'price' && pOn) {
      rows.sort((a, b) => (a.pp == null) - (b.pp == null) || (a.pp || 0) - (b.pp || 0) || a.min - b.min);
    } else if ((sortBy === 'jr-low' || sortBy === 'jr-high') && pOn) {
      // 전세가율 낮은 순 = 갭이 큰(매매가 대비 전세가 낮은) 곳, 높은 순 = 적은 돈으로 살 수 있지만 깡통 위험
      const dir = sortBy === 'jr-low' ? 1 : -1;
      rows.sort((a, b) => (a.jr == null) - (b.jr == null) || dir * ((a.jr || 0) - (b.jr || 0)) || a.min - b.min);
    }
    const shown = rows.slice(0, 150);
    ul.innerHTML = shown.map(r => {
      const reg = regionLabel(r.id);
      const pp = pOn ? `<span class="cm-pp">${r.pp != null ? '평당 ' + StationPrice.pp(r.pp) : '시세 —'}` +
        (r.jr != null ? ` · 전세가율 ${Math.round(r.jr * 100)}%${r.jr >= 0.8 ? ' ⚠' : ''}` : '') + `</span>` : '';
      return `<li><button type="button" data-id="${esc(r.id)}"><span>${esc(r.name)}${reg ? ' <small>· ' + esc(reg) + '</small>' : ''}</span>` +
        `<span>${pp} <span class="cm-min">${r.min}분</span></span></button></li>`;
    }).join('') + (rows.length > shown.length ? `<li class="cm-note">외 ${rows.length - shown.length}역 — 시간을 줄이면 목록이 짧아집니다</li>` : '');
    const sortSel = panel.querySelector('#cm-sort');
    sortSel.querySelectorAll('option[value=price], option[value=jr-low], option[value=jr-high]').forEach(o => { o.disabled = !pOn; });
    if (!pOn && sortBy !== 'time') { sortBy = 'time'; sortSel.value = 'time'; }
  }

  function syncButton() {
    const btn = document.getElementById('commute-btn');
    if (btn) btn.classList.toggle('active', active);
  }

  function show(stationId) {
    ensurePanel();
    if (stationId && byId.has(stationId)) destId = stationId;
    if (!destId) {
      const g = ST.find(s => s.properties.name_ko === '강남');
      destId = g ? g.properties.id : null;
    }
    panel.style.display = 'block';
    active = true;
    syncButton();
    render(true);
    // 투자 모드면 시세를 받아 목록을 다시 그린다 (이미 받았으면 바로)
    if (typeof StationPrice !== 'undefined' && StationPrice.load && priceOnMode()) {
      StationPrice.load('data/station-price.json').then(() => { if (active) renderList(); }).catch(() => null);
    }
    if (typeof StationJeonse !== 'undefined' && StationJeonse.load && priceOnMode()) {
      StationJeonse.load('data/station-jeonse.json').then(() => { if (active) renderList(); }).catch(() => null);
    }
  }
  function priceOnMode() { return typeof KR_MODE === 'undefined' || KR_MODE.isInvest(); }

  function hide() {
    active = false;
    syncButton();
    if (panel) panel.style.display = 'none';
    if (map) for (const id of ['cm-stations', 'cm-dest']) {
      try { if (map.getSource(id)) map.getSource(id).setData({ type: 'FeatureCollection', features: [] }); } catch (e) { /* 무시 */ }
    }
  }

  function isActive() { return active; }

  function init(m, stations) {
    map = m; ST = stations || [];
    byId = new Map(ST.map(s => [s.properties.id, s]));
    map.on('style.load', () => { if (active) render(false); });
  }

  window.CommuteMap = { init, show, hide, isActive, compute, _debug: { bandOf, optionLabel, findByLabel } };
})();
