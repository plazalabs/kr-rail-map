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
  // 두 번째 직장 (맞벌이 — 2026-11-15 킬러 아이디어 '둘 다 출근 가능한 동네'). 고르면 두 곳 모두 N분 안인 역만, 분 = 둘 중 긴 쪽
  let dest2Id = null;
  let headwayTried = false, headwayFailed = false;
  // 대기 시간 설명 (K12) — route.js allTimesFrom 이 실제로 넣는 것과 같게:
  //  배차 넣음(출퇴근 배차 자료 있음) → 처음 탈 때·갈아탈 때 출퇴근 배차의 절반 (KTX·급행·같은 승강장 맞은편 환승은 0)
  //  배차 안 넣음(꺼짐·자료 못 받음·받는 중) → 갈아탈 때만 노선별 평소 대기 어림, 처음 열차 대기는 0
  function waitCopy(peakApplied) {
    return peakApplied
      ? { def: '역에서 역까지 어림한 시간입니다 — 집·회사까지 걷는 시간은 빠져 있고, 열차 기다리는 시간은 출퇴근 배차의 절반으로 넣었어요.',
          note: '처음 탈 때와 갈아탈 때 출퇴근 배차 간격의 절반을 넣음(KTX·급행·같은 승강장 맞은편 환승은 0)' }
      : { def: '역에서 역까지 어림한 시간입니다 — 집·회사까지 걷는 시간과 처음 열차를 기다리는 시간은 빠져 있어요.',
          note: '갈아탈 때 기다리는 시간은 공식 출근 시간 배차(역·방향별)의 절반으로 넣고, 처음 열차 대기는 뺌' };
  }
  if (typeof window !== 'undefined') window.__cmWaitCopy = waitCopy;   // I2: 출퇴근 배차 자료를 받으려 했는지·실패했는지
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
    // 공통 '출퇴근 배차 넣기'(D9): 켜면 처음 탈 때·갈아탈 때 출퇴근 배차의 절반, 끄면 예전처럼 갈아탈 때만
    const peak = !!(opts && opts.peakWait) || (opts && opts.peakWait === undefined && typeof window !== 'undefined' && window.KR_WAIT && window.KR_WAIT.isPeak());
    const withUn = !!(opts && opts.withUnopened);
    const times = RouteFinder.allTimesFrom(destStationId, { openOnly: !withUn, peakWait: peak });
    // 개통 후에도 지금 길은 그대로 있다 — '최적'(시간+환승 부담)이 갈아타기 적은 새 길을 골라 표시 분이 더 길어지면
    // 지금 길의 분을 쓴다 (11-14 reach-card e2e: 삼성 45분, 대치 지금 18분 → 개통 후 20분으로 나오던 것)
    if (withUn) RouteFinder.allTimesFrom(destStationId, { openOnly: true, peakWait: peak }).forEach((m, id) => {
      const a = times.get(id);
      if (a == null || m < a) times.set(id, m);
    });
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

  // 두 직장 모두 limitMin 안인 역. 각 직장 역 자신은 그 직장까지 0분. 분(min) = 둘 중 긴 쪽, m1·m2 = 각 직장까지
  // idA·idB 를 주면 그 두 역으로(시험용), 안 주면 지금 고른 두 직장
  function computeBoth(limitMin, opts, idA, idB) {
    const A = idA || destId, Bd = idB === undefined ? dest2Id : idB;
    const a = compute(A, limitMin, opts);
    if (!Bd || !byId.has(Bd) || Bd === A) return a;
    const b = compute(Bd, limitMin, opts);
    const m1 = new Map(a.map(r => [r.id, r.min])), m2 = new Map(b.map(r => [r.id, r.min]));
    m1.set(A, 0); m2.set(Bd, 0);
    const rows = [];
    m1.forEach((x, id) => {
      const y = m2.get(id);
      if (y == null) return;
      const s = byId.get(id);
      if (!s) return;
      rows.push({ id, name: s.properties.name_ko, min: Math.max(x, y), m1: x, m2: y, coord: s.geometry.coordinates });
    });
    rows.sort((p, q) => p.min - q.min || (p.m1 + p.m2) - (q.m1 + q.m2) || p.name.localeCompare(q.name, 'ko'));
    return rows;
  }

  // B 카드 값 — 지금(운행 중만) · 개통 후(모두) 를 같은 목적지·같은 분·같은 배차 설정으로 따로 센다
  function reachCardInfo() {
    const dest = byId.get(destId);
    if (!dest) return null;
    const wantPeak = !!(window.KR_WAIT && window.KR_WAIT.isPeak()), hw = !!(RouteFinder.hasHeadways && RouteFinder.hasHeadways());
    return { name: dest.properties.name_ko, coord: dest.geometry.coordinates, limit: maxMin,
      now: compute(destId, maxMin, { withUnopened: false }), aft: compute(destId, maxMin, { withUnopened: true }),
      lines: (typeof LINES !== 'undefined' ? LINES : []), wait: wantPeak && hw,
      // 받은 사람이 같은 통근권(목적지·분)을 바로 보게 (11-15) — js/app.js restoreFromUrl 이 cm= 를 읽는다
      q: 'cm=' + encodeURIComponent(destId) + '&t=' + maxMin + (window.KR_WAIT ? '&wait=' + (window.KR_WAIT.isPeak() ? '1' : '0') : '') };
  }

  function injectCss() {
    if (document.getElementById('cm-style')) return;
    const st = document.createElement('style');
    st.id = 'cm-style';
    st.textContent = `
#cm-panel{position:absolute;top:70px;right:12px;width:320px;max-height:calc(100% - 140px);overflow-y:auto;
background:var(--panel-bg,#fff);color:var(--text,#222);border:1px solid var(--border,#ddd);border-radius:10px;
box-shadow:0 4px 18px rgba(0,0,0,.25);z-index:39;font-size:var(--fs-sm)}
#cm-head{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;font-weight:700;
border-bottom:1px solid var(--border,#ddd)}
#cm-close{background:none;border:none;font-size:var(--fs-lg);cursor:pointer;color:var(--muted,#888)}
#cm-body{padding:10px 12px}
.cm-row{margin-bottom:10px}
.cm-row label{display:block;font-size:var(--fs-xs);color:var(--muted,#888);margin-bottom:4px}
#cm-dest,#cm-limit,#cm-sort{width:100%;padding:6px;border-radius:6px;border:1px solid var(--border,#ddd);
background:var(--bg,#fff);color:var(--text,#222);font-size:var(--fs-sm);box-sizing:border-box}
.cm-check{display:flex;gap:6px;align-items:center;font-size:var(--fs-xs)}
.cm-legend{display:flex;flex-wrap:wrap;gap:8px;font-size:var(--fs-xs);margin:6px 0}
.cm-legend i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:3px;vertical-align:-1px}
#cm-summary{background:var(--bg,#f5f5f5);border-radius:8px;padding:8px 10px;margin-bottom:8px;line-height:1.6}
.cm-reach-share,.cm-two-share{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;margin-top:6px;padding:7px 10px;border:1px solid var(--accent,#1b64da);border-radius:9px;background:var(--panel-bg,#fff);color:var(--accent,#1b64da);font:inherit;font-weight:700;cursor:pointer}
.cm-reach-share:hover,.cm-two-share:hover{background:var(--hover,#eef2f7)}
#cm-list{list-style:none;margin:0;padding:0}
#cm-list li button{display:flex;width:100%;justify-content:space-between;gap:8px;padding:5px 4px;border:0;
border-bottom:1px solid var(--border,#eee);background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}
#cm-list li button:hover,#cm-list li button:focus-visible{background:var(--bg,#f5f5f5)}
#cm-list .cm-min{font-weight:700;white-space:nowrap}
#cm-list .cm-pp{color:var(--muted,#666);white-space:nowrap;font-size:var(--fs-xs)}
.cm-def{font-size:var(--fs-xs);color:var(--muted,#5b6470);margin:0 0 8px;line-height:1.5}
.cm-note{font-size:var(--fs-xs);color:var(--muted,#888);margin-top:8px;line-height:1.5}
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
    panel.hidden = true;   // 오른쪽 창 접기 손잡이(js/panel-fold.js)·'하나만' 규칙이 hidden 으로 본다
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', '통근권 찾기');
    panel.innerHTML = `
<div id="cm-head">통근권 찾기 <button id="cm-close" aria-label="닫기"><i data-ic="close"></i></button></div>
<div id="cm-body">
  <p class="cm-def" id="cm-def">${waitCopy(false).def}</p>
  <div class="cm-row">
    <label for="cm-dest">직장(목적지) 역</label>
    <div class="ac-wrap"><input id="cm-dest" placeholder="예: 강남" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false"><div class="ac-list" hidden></div></div>
  </div>
  <div class="cm-row">
    <label for="cm-dest2">두 번째 직장 <small>(맞벌이 · 선택)</small></label>
    <div class="ac-wrap"><input id="cm-dest2" placeholder="예: 여의도 — 비우면 한 곳만" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false"><div class="ac-list" hidden></div></div>
  </div>
  <div class="cm-row">
    <label for="cm-limit">최대 소요 시간</label>
    <select id="cm-limit">${LIMITS.map(m => `<option value="${m}"${m === maxMin ? ' selected' : ''}>${m}분 안</option>`).join('')}</select>
  </div>
  <div class="cm-row cm-check"><input type="checkbox" id="cm-wait"><label for="cm-wait" style="margin:0;color:inherit">출퇴근 배차 넣기 (처음 탈 때·갈아탈 때 배차의 절반)</label></div>
  <div class="cm-row cm-check"><input type="checkbox" id="cm-unopened"><label for="cm-unopened" style="margin:0;color:inherit">개통 예정 노선 포함 (개통 후 기준)</label></div>
  <div class="cm-row"><label for="cm-sort">정렬</label>
    <select id="cm-sort"><option value="time">가까운 순 (분)</option><option value="price">시세 낮은 순 (투자 모드)</option><option value="jr-low">전세가율 낮은 순 (투자 모드)</option><option value="jr-high">전세가율 높은 순 (투자 모드)</option></select></div>
  <div class="cm-legend" aria-hidden="true">${BANDS.map(b => `<span><i style="background:${b[1]}"></i>${b[2]}</span>`).join('')}</div>
  <div id="cm-summary" role="status" aria-live="polite"></div>
  <ul id="cm-list"></ul>
  <div class="cm-note">소요 시간은 운행 속도·환승 도보·승강장 접근 시간으로 낸 <b>추정값</b>입니다(시각표 미반영 · <span id="cm-wait-note">${waitCopy(false).note}</span> · ±20~30%).
  길찾기와 같은 계산입니다. 시세는 투자 모드에서 역이 속한 법정동의 아파트 매매 중위 평당가(최근 6개월)이며, 역 바로 옆 값이 아닙니다. 전세가율은 같은 단지·같은 면적의 매매·신규 전세 짝의 중위값(80% 이상 (주의)).</div>
</div>`;
    document.body.appendChild(panel);
    const dest = panel.querySelector('#cm-dest');
    panel.querySelector('#cm-close').addEventListener('click', hide);
    // 길찾기와 같은 자동완성(동명역은 지역·노선으로 구분, ↓↑Enter). 고르면 'ac:pick' 이 오고 역 ID 는 dataset.sid
    if (typeof window.KR_attachAutocomplete === 'function') window.KR_attachAutocomplete(dest);
    dest.addEventListener('ac:pick', () => { if (dest.dataset.sid && byId.has(dest.dataset.sid)) { destId = dest.dataset.sid; render(true); } });
    // 목록을 고르지 않고 이름만 쳐서 Enter/변경: 예전처럼 이름(또는 '시청 · 부산 연제구')으로 찾는다
    dest.addEventListener('change', () => { if (dest.dataset.sid) return; const s = findByLabel(dest.value); if (s) { destId = s.properties.id; render(true); } });
    dest.addEventListener('keydown', e => { if (e.key === 'Enter' && !dest.dataset.sid) { const s = findByLabel(dest.value); if (s) { destId = s.properties.id; render(true); } } });
    const dest2 = panel.querySelector('#cm-dest2');
    if (typeof window.KR_attachAutocomplete === 'function') window.KR_attachAutocomplete(dest2);
    const setDest2 = id => { dest2Id = id && byId.has(id) && id !== destId ? id : null; render(true); };
    dest2.addEventListener('ac:pick', () => setDest2(dest2.dataset.sid));
    dest2.addEventListener('change', () => { if (!dest2.value.trim()) return setDest2(null); if (dest2.dataset.sid) return; const s = findByLabel(dest2.value); setDest2(s ? s.properties.id : null); });
    dest2.addEventListener('keydown', e => { if (e.key === 'Enter' && !dest2.dataset.sid) { const s = dest2.value.trim() ? findByLabel(dest2.value) : null; setDest2(s ? s.properties.id : null); } });
    panel.querySelector('#cm-limit').addEventListener('change', e => { maxMin = +e.target.value; render(true); });
    panel.querySelector('#cm-unopened').addEventListener('change', e => { withUnopened = e.target.checked; render(false); });
    const cw = panel.querySelector('#cm-wait');
    cw.checked = !!(window.KR_WAIT && window.KR_WAIT.isPeak());
    cw.addEventListener('change', e => { if (window.KR_WAIT) window.KR_WAIT.set(e.target.checked ? 'peak' : 'none'); });
    if (window.KR_WAIT) window.KR_WAIT.onChange(() => { cw.checked = window.KR_WAIT.isPeak(); if (active) render(false); });
    panel.querySelector('#cm-sort').addEventListener('change', e => { sortBy = e.target.value; renderList(); });
    panel.querySelector('#cm-summary').addEventListener('click', e => {
      if (e.target.closest('.cm-two-share')) {
        const ti = twoCardInfo();
        if (ti) StationShareImage.saveTwo(ti, { wait: ti.wait }).then(msg => { if (msg && typeof window.setStatus === 'function') window.setStatus(msg); });
        return;
      }
      if (!e.target.closest('.cm-reach-share')) return;
      const info = reachCardInfo();
      if (info) StationShareImage.saveReach(info, { wait: info.wait }).then(msg => { if (msg && typeof window.setStatus === 'function') window.setStatus(msg); });
    });
    panel.querySelector('#cm-list').addEventListener('click', e => {
      // 결과 0역 안내의 버튼 — 시간 늘리기 / 개통 예정 포함 켜기
      const more = e.target.closest('button[data-more]');
      if (more) {
        maxMin = +more.dataset.more; panel.querySelector('#cm-limit').value = String(maxMin); render(true);
        const f = panel.querySelector('#cm-list button'); if (f) f.focus();
        return;
      }
      const un = e.target.closest('button[data-unopened]');
      if (un) {
        withUnopened = true; panel.querySelector('#cm-unopened').checked = true;
        if (un.dataset.limit) { maxMin = +un.dataset.limit; panel.querySelector('#cm-limit').value = String(maxMin); }
        render(true);
        return;
      }
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
    // 배차 넣기가 켜졌는데 배차 자료가 아직 없으면: 받고 나서 다시 그린다 (I2). 못 받으면 요약에 '배차 없이 계산'이라고 적는다
    const wantPeak = !!(window.KR_WAIT && window.KR_WAIT.isPeak());
    if (wantPeak && RouteFinder.hasHeadways && !RouteFinder.hasHeadways() && window.KR_ensureHeadways && !headwayTried) {
      headwayTried = true;
      window.KR_ensureHeadways().then(ok => { headwayFailed = !ok; if (active) render(false); });
    }
    const d2 = dest2Id ? byId.get(dest2Id) : null;
    const d2in = panel.querySelector('#cm-dest2');
    if (d2in) { if (d2) d2in.value = optionLabel(d2); else if (document.activeElement !== d2in) { d2in.value = ''; delete d2in.dataset.sid; } }
    lastRows = computeBoth(maxMin, { withUnopened });
    try {
      ensureLayers();
      map.getSource('cm-stations').setData({
        type: 'FeatureCollection',
        features: lastRows.map(r => ({ type: 'Feature', properties: { id: r.id, min: r.min, color: bandOf(r.min)[1] }, geometry: { type: 'Point', coordinates: r.coord } }))
      });
      map.getSource('cm-dest').setData({ type: 'FeatureCollection', features: [dest].concat(d2 ? [d2] : []).map(s => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: s.geometry.coordinates } })) });
      if (fit && lastRows.length) {
        let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
        for (const r of lastRows.concat([{ coord: dest.geometry.coordinates }], d2 ? [{ coord: d2.geometry.coordinates }] : [])) {
          a = Math.min(a, r.coord[0]); b = Math.min(b, r.coord[1]); c = Math.max(c, r.coord[0]); d = Math.max(d, r.coord[1]);
        }
        map.fitBounds([[a, b], [c, d]], { padding: 60, duration: 500, maxZoom: 13 });
      }
    } catch (e) { /* 스타일 교체 중이면 style.load 에서 다시 그린다 */ }
    const per = BANDS.filter(b => b[0] <= maxMin).map(b => {
      const n = lastRows.filter(r => r.min <= b[0]).length;
      return `${b[2]} 안 <b>${n}</b>역`;
    }).join(' · ');
    const hwNow = !!(RouteFinder.hasHeadways && RouteFinder.hasHeadways());
    const hwNote = !wantPeak ? '' : hwNow ? ' · 출퇴근 배차 넣음' : headwayFailed ? ' · <b>배차 자료를 못 받아 배차 없이 계산</b>' : ' · 배차 자료 받는 중…';
    // K12 (6차 ②7): 위·아래 설명 문구를 '실제로 넣은 대기 시간' 상태에서 만든다 (예전엔 배차를 켜도 '처음 대기 뺌' 고정)
    const wc = waitCopy(wantPeak && hwNow);
    const defEl = panel.querySelector('#cm-def'), noteEl = panel.querySelector('#cm-wait-note');
    if (defEl) defEl.textContent = wc.def;
    if (noteEl) noteEl.textContent = wc.note;
    sum.innerHTML = (d2 ? `<b>${esc(dest.properties.name_ko)}</b>·<b>${esc(d2.properties.name_ko)}</b> <b>둘 다</b> ${maxMin}분 안: <b>${lastRows.length}</b>역 <small>(분 = 둘 중 긴 쪽)</small>`
      : `<b>${esc(dest.properties.name_ko)}</b>까지 ${maxMin}분 안: <b>${lastRows.length}</b>역`) +
      (withUnopened ? ' (개통 예정 포함)' : '') + hwNote + '<br>' + per +
      // 회장님 11-14 B: 같은 목적지·같은 분으로 '지금 | 개통 후' 두 칸 지도 카드 (station-share.js drawReach)
      (d2 && typeof StationShareImage !== 'undefined' && StationShareImage.saveTwo ? '<button type="button" class="cm-two-share"><i data-ic="camera"></i> 둘 다 출근 지도 카드로 공유</button>' : '') +
      (!d2 && typeof StationShareImage !== 'undefined' && StationShareImage.saveReach ? '<button type="button" class="cm-reach-share"><i data-ic="camera"></i> 개통 전/후 지도 카드로 공유</button>' : '');
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
    if (!rows.length) {
      ul.innerHTML = emptyHint();
      return syncSort(pOn);
    }
    const shown = rows.slice(0, 150);
    ul.innerHTML = shown.map(r => {
      const reg = regionLabel(r.id);
      const pp = pOn ? `<span class="cm-pp">${r.pp != null ? '평당 ' + StationPrice.pp(r.pp) : '시세 —'}` +
        (r.jr != null ? ` · 전세가율 ${Math.round(r.jr * 100)}%${r.jr >= 0.8 ? ' (주의)' : ''}` : '') + `</span>` : '';
      return `<li><button type="button" data-id="${esc(r.id)}"><span>${esc(r.name)}${reg ? ' <small>· ' + esc(reg) + '</small>' : ''}</span>` +
        `<span>${pp} <span class="cm-min">${r.min}분</span>${r.m1 != null ? ` <small class="cm-both" title="첫째·둘째 직장까지">${r.m1}·${r.m2}</small>` : ''}</span></button></li>`;
    }).join('') + (rows.length > shown.length ? `<li class="cm-note">외 ${rows.length - shown.length}역 — 시간을 줄이면 목록이 짧아집니다</li>` : '');
    syncSort(pOn);
  }

  // 결과 0역일 때: 무엇 때문인지 + 바로 누를 버튼 (2026-11-11 사용성 점검 B)
  function emptyHint() {
    const btn = 'style="margin-top:6px;padding:5px 10px;border:1px solid var(--border,#ddd);border-radius:6px;background:var(--input,#fff);color:inherit;font-weight:600;cursor:pointer"';
    const maxL = LIMITS[LIMITS.length - 1];
    // 시간을 늘리면 나오는 가장 짧은 한도
    const up = LIMITS.filter(m => m > maxMin).map(m => [m, computeBoth(m, { withUnopened }).length]).find(x => x[1] > 0);
    // 개통 예정을 넣으면 나오는 가장 짧은 한도(지금 한도부터) — 버튼이 그 한도까지 같이 맞춘다
    const unop = up || withUnopened ? null : [maxMin].concat(LIMITS.filter(m => m > maxMin)).map(m => [m, computeBoth(m, { withUnopened: true }).length]).find(x => x[1] > 0);
    let h = `<li class="cm-empty" style="padding:8px 4px;line-height:1.5">${dest2Id ? '두 직장 모두 ' : ''}${maxMin}분 안에 갈 수 있는 다른 역이 없어요.`;
    if (up) h += `<br>${up[0]}분으로 늘리면 <b>${up[1]}</b>역이 나와요.<br><button type="button" data-more="${up[0]}" ${btn}>${up[0]}분으로 늘리기</button>`;
    else if (unop) h += `<br>개통 예정 노선을 넣으면 ${unop[0]}분 안에 <b>${unop[1]}</b>역이 나와요.<br><button type="button" data-unopened="1" data-limit="${unop[0]}" ${btn}>개통 예정 노선 포함${unop[0] !== maxMin ? ' · ' + unop[0] + '분' : ''}</button>`;
    else h += `<br>${Math.max(maxMin, maxL)}분 안에도 이어지는 역이 없어요. 길찾기로 직접 찾아 보세요.`;
    return h + '</li>';
  }

  function syncSort(pOn) {
    const sortSel = panel.querySelector('#cm-sort');
    sortSel.querySelectorAll('option[value=price], option[value=jr-low], option[value=jr-high]').forEach(o => { o.disabled = !pOn; });
    if (!pOn && sortBy !== 'time') { sortBy = 'time'; sortSel.value = 'time'; }
  }

  function syncButton() {
    const btn = document.getElementById('commute-btn');
    if (btn) btn.classList.toggle('active', active);
  }

  function show(stationId, opts) {
    ensurePanel();
    if (stationId && byId.has(stationId)) destId = stationId;
    if (opts && opts.dest2 !== undefined) dest2Id = opts.dest2 && byId.has(opts.dest2) && opts.dest2 !== destId ? opts.dest2 : null;
    if (opts && LIMITS.indexOf(+opts.limit) >= 0) { maxMin = +opts.limit; const ls = panel.querySelector('#cm-limit'); if (ls) ls.value = String(maxMin); }
    if (!destId) {
      const g = ST.find(s => s.properties.name_ko === '강남');
      destId = g ? g.properties.id : null;
    }
    // 오른쪽 작업 창은 한 번에 하나 (평가① P2, 11-15) — 길찾기 결과·그리기·떡상·게시판을 닫고 경로 선도 지운다.
    // 전엔 길찾기 창 위에 통근권 창이 320×566px 겹쳐 앞 작업의 선·숫자가 새 결과처럼 보였다.
    try {
      if (window.RocketPanel && RocketPanel.isOpen && RocketPanel.isOpen()) RocketPanel.close();
      if (window.BoardPanel && BoardPanel.isOpen && BoardPanel.isOpen()) BoardPanel.close();
      if (typeof window.leaveRouteMode === 'function') window.leaveRouteMode();
      const dp = document.getElementById('draw-panel'); if (dp && !dp.hidden) dp.hidden = true;
    } catch (e) { /* 무시 */ }
    panel.style.display = 'block';
    panel.hidden = false;
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
    if (panel) { panel.style.display = 'none'; panel.hidden = true; }
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

  // 맞벌이 카드 값 — 화면 목록과 같은 줄(lastRows)을 그대로 쓴다 (카드 값 = 화면 값)
  function twoCardInfo() {
    const a = byId.get(destId), b = dest2Id ? byId.get(dest2Id) : null;
    if (!a || !b) return null;
    const wantPeak = !!(window.KR_WAIT && window.KR_WAIT.isPeak()), hw = !!(RouteFinder.hasHeadways && RouteFinder.hasHeadways());
    return { a: { name: a.properties.name_ko, coord: a.geometry.coordinates }, b: { name: b.properties.name_ko, coord: b.geometry.coordinates },
      limit: maxMin, rows: lastRows.slice(), lines: (typeof LINES !== 'undefined' ? LINES : []), wait: wantPeak && hw,
      q: shareQuery() + (window.KR_WAIT ? '&wait=' + (window.KR_WAIT.isPeak() ? '1' : '0') : '') };
  }
  function shareQuery() { return destId ? 'cm=' + encodeURIComponent(destId) + (dest2Id ? '&cm2=' + encodeURIComponent(dest2Id) : '') + '&t=' + maxMin : ''; }
  window.CommuteMap = { init, show, hide, isActive, compute, computeBoth, reachCardInfo, twoCardInfo, shareQuery, dest2: () => dest2Id, _debug: { bandOf, optionLabel, findByLabel } };
})();
