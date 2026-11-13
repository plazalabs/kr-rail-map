/* =========================================================
   앱 셸 (js/ui.js)
   - app.js 위에서 동작하는 UI 계층: 토스트 / 모달 관리 / 드로어 /
     드롭다운 / 키보드 / 데이터 안전장치
   - 표시 범위·딥링크는 app.js(setScope, focusLineFromUrl)가 담당한다
   ========================================================= */
'use strict';

const UI = (() => {
  const isMobile = () => window.matchMedia('(max-width: 980px)').matches;

  /* ---------- 데이터 로더 (한 번만 받는다) ---------- */
  // ui.js 가 먼저 파싱되므로 여기서 요청을 일찍 띄우고, app.js 는 같은 약속을 기다린다.
  // 같은 URL 을 두 번 fetch 하면 브라우저가 합쳐주지 않는다 — 974KB 를 두 번 받던 원인.
  const dataPromises = new Map();
  function loadGeoJSON(url) {
    if (!dataPromises.has(url)) {
      dataPromises.set(url, fetch(url).then((r) => {
        if (!r.ok) throw new Error(url);
        return r.json();
      }));
    }
    return dataPromises.get(url);
  }

  /* ---------- 토스트 ---------- */
  let toastTimer = null;
  function setStatus(msg) {
    const el = document.getElementById('status');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3400);
  }
  // app.js 의 setStatus 는 textContent 만 바꾸므로 변화를 감지해 표시한다
  function watchStatus() {
    const el = document.getElementById('status');
    if (!el) return;
    new MutationObserver(() => {
      el.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => el.classList.remove('show'), 3400);
    }).observe(el, { childList: true, characterData: true, subtree: true });
  }

  /* ---------- 모달: 한 번에 하나만 ---------- */
  const MODALS = [
    { panel: 'rs-panel', close: 'rs-close' },
    { panel: 'lc-panel', close: 'lc-close' },
    { panel: 'iv-panel', close: 'iv-close' },
    { panel: 'cv-panel', close: 'cv-close' },
    { panel: 'cm-panel', close: 'cm-close' },
    { panel: 'sd-panel', close: 'sd-close', visibleClass: 'sd-open' },
    { panel: 'rt-panel', close: 'rt-close', visibleEl: 'rt-backdrop', watchEl: 'rt-backdrop' },
  ];
  // 패널이 실제로 보이는 상태인지.
  //  - 대부분은 style.display 로 제어한다
  //  - 역 상세(sd-panel)는 클래스, 타임라인(rt-panel)은 감싼 백드롭으로 제어한다
  function panelOpen(m) {
    const el = document.getElementById(m.panel);
    if (!el || el.style.display === 'none' || el.hidden) return false;
    if (m.visibleEl) {
      const wrap = document.getElementById(m.visibleEl);
      return !!wrap && wrap.style.display !== 'none';
    }
    if (m.visibleClass) return el.classList.contains(m.visibleClass);
    return true;
  }
  function visibleModal() {
    for (const m of MODALS) if (panelOpen(m)) return m;
    return null;
  }
  function closeModals(exceptId) {
    for (const m of MODALS) {
      if (m.panel === exceptId) continue;
      const el = document.getElementById(m.panel);
      if (!el || !panelOpen(m)) continue;
      const btn = document.getElementById(m.close);
      if (btn) btn.click();
      else el.style.display = 'none';
    }
  }
  /* 포커스 (IMPL9 건 2) — 패널이 열리면 그 직전 포커스를 기억하고 패널 안으로 옮기고,
   * 닫히면 기억한 자리로 돌려준다. 키보드만 쓰는 사람이 패널을 닫은 뒤 맨 처음으로 튕기지 않게.
   * 마우스·터치로 닫을 때 입력창으로 돌려주면 휴대폰 자판이 튀어나오므로 그때는 입력창으로는 돌려주지 않는다. */
  let lastFocus = null, lastFocusAt = 0, keyboardLast = false;
  const inModal = el => MODALS.some(m => { const p = document.getElementById(m.panel); return p && p.contains(el); });
  document.addEventListener('focusin', e => {
    if (e.target && e.target !== document.body && !inModal(e.target)) { lastFocus = e.target; lastFocusAt = Date.now(); }
  }, true);
  document.addEventListener('keydown', () => { keyboardLast = true; }, true);
  document.addEventListener('pointerdown', () => { keyboardLast = false; }, true);
  const visible = el => !!el && el.isConnected && el.getClientRects().length > 0 && !el.closest('[hidden]');
  const isTextField = el => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  function onModalOpen(m) {
    const el = document.getElementById(m.panel);
    if (!el) return;
    const a = document.activeElement;
    // 검색 결과를 고르면 검색창이 먼저 blur 된 뒤 패널이 열린다 — 방금(5초 안) 포커스가 있던 곳을 쓴다
    m.opener = (a && a !== document.body && !inModal(a)) ? a
      : (lastFocus && Date.now() - lastFocusAt < 5000 ? lastFocus : null);
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    el.setAttribute('data-modal-focus', '');
    try { el.focus({ preventScroll: true }); } catch (e) { /* 무시 */ }
  }
  function onModalClose(m) {
    const el = document.getElementById(m.panel);
    const a = document.activeElement;
    const opener = m.opener; m.opener = null;
    // 이미 다른 곳(다른 패널 등)으로 포커스가 옮겨 갔으면 건드리지 않는다
    if (el && a && a !== document.body && !el.contains(a)) return;
    let target = opener;
    if (!visible(target)) {
      // 메뉴 항목으로 열었으면 그 항목은 메뉴와 함께 닫혀 안 보인다 → 메뉴 버튼으로
      const dd = opener && opener.closest && opener.closest('.tb-dropdown');
      target = dd ? dd.querySelector('.tb-dropbtn') : null;
    }
    if (!visible(target) || (!keyboardLast && isTextField(target))) {
      if (el && a && el.contains(a)) a.blur();
      return;
    }
    try { target.focus({ preventScroll: true }); } catch (e) { /* 무시 */ }
  }

  /* 길찾기·그리기 패널 포커스 — 모달이 아니라 지도 옆에 붙는 패널이라 따로 다룬다.
   * 키보드로 열면 패널 안으로(길찾기는 '출발' 칸), 닫히면 연 버튼으로 돌려준다.
   * 연 버튼이 메뉴 안에 있어 메뉴와 함께 닫혔으면 메뉴 버튼으로. 마우스로 열면 포커스를 옮기지 않는다
   * (휴대폰에서 '출발' 칸에 포커스가 가면 자판이 튀어나온다). */
  function onSidePanelOpen(el) {
    const a = document.activeElement;
    el.__opener = (a && a !== document.body && !el.contains(a)) ? a
      : (lastFocus && Date.now() - lastFocusAt < 5000 && !el.contains(lastFocus) ? lastFocus : null);
    if (!keyboardLast) return;
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    const first = el.id === 'route-panel' ? el.querySelector('#route-from') : null;
    try { (visible(first) ? first : el).focus({ preventScroll: true }); } catch (e) { /* 무시 */ }
  }
  function onSidePanelClose(el) {
    const opener = el.__opener; el.__opener = null;
    const a = document.activeElement;
    // 포커스가 패널 밖 다른 곳으로 이미 옮겨 갔으면 건드리지 않는다
    if (a && a !== document.body && !el.contains(a)) return;
    let target = opener;
    if (!visible(target)) {
      const dd = opener && opener.closest && opener.closest('.tb-dropdown');
      target = dd ? dd.querySelector('.tb-dropbtn') : null;
    }
    if (!visible(target) || (!keyboardLast && isTextField(target))) {
      if (a && el.contains(a)) a.blur();
      return;
    }
    try { target.focus({ preventScroll: true }); } catch (e) { /* 무시 */ }
  }

  // 모듈이 패널을 게을리 만들어도 요소가 나타나는 순간 감시를 붙인다
  function watchModals() {
    MODALS.forEach(m => {
      const attach = () => {
        const el = document.getElementById(m.watchEl || m.panel);
        if (!el || el.__uiWatched) return;
        el.__uiWatched = true;
        const check = () => {
          const open = panelOpen(m);
          if (open && !m.__open) onModalOpen(m);
          else if (!open && m.__open) onModalClose(m);
          m.__open = open;
          if (open) closeModals(m.panel);
        };
        new MutationObserver(check).observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
        check();  // 생성과 동시에 열린 경우를 위해 한 번 검사
      };
      attach();
      if (document.body) {
        new MutationObserver(attach).observe(document.body, { childList: true, subtree: true });
      }
    });
    ['route-panel', 'draw-panel'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      let wasOpen = !el.hidden;
      new MutationObserver(() => {
        if (el.hidden) {
          // 길찾기 패널이 닫히면 경로 하이라이트도 같이 지운다
          if (id === 'route-panel' && typeof clearRouteHighlight === 'function') {
            clearRouteHighlight();
          }
          if (wasOpen) { wasOpen = false; onSidePanelClose(el); }
          return;
        }
        if (!wasOpen) { wasOpen = true; onSidePanelOpen(el); }
        ['route-panel', 'draw-panel'].forEach(other => {
          if (other === id) return;
          const o = document.getElementById(other);
          if (o && !o.hidden) o.hidden = true;
        });
      }).observe(el, { attributes: true, attributeFilter: ['hidden'] });
    });
  }

  /* ---------- 드로어 ---------- */
  function openDrawer() {
    document.body.classList.add('drawer-open');
    const b = document.getElementById('sidebar-backdrop');
    if (b) { b.hidden = false; requestAnimationFrame(() => b.classList.add('show')); }
  }
  function closeDrawer() {
    document.body.classList.remove('drawer-open');
    const b = document.getElementById('sidebar-backdrop');
    if (b) {
      b.classList.remove('show');
      setTimeout(() => {
        if (!document.body.classList.contains('drawer-open')) b.hidden = true;
      }, 200);
    }
  }
  function initDrawer() {
    const btn = document.getElementById('sidebar-toggle');
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = '1';
      btn.setAttribute('aria-expanded', 'true');
      btn.addEventListener('click', () => {
        if (isMobile()) { openDrawer(); return; }
        const hidden = document.body.classList.toggle('sidebar-hidden');
        // 아이콘은 그대로 둔다. 접기/펼치기 모두 '패널 토글'이라 메뉴 아이콘이 맞다.
        btn.setAttribute('aria-expanded', hidden ? 'false' : 'true');
        btn.setAttribute('aria-label', hidden ? '패널 펼치기' : '패널 접기');
        btn.title = hidden ? '패널 펼치기' : '패널 접기';
        setTimeout(() => { try { map.resize(); } catch (e) {} syncSidePad(); }, 60);
      });
    }
    // F5: PC 사이드바는 지도 위에 뜬 카드 — 지도 가운데를 카드에 안 가린 곳으로 (setPadding)
    function syncSidePad() {
      try {
        if (typeof map === 'undefined' || !map || !map.setPadding) return;
        const sb = document.getElementById('sidebar'), cv = map.getCanvas();
        let left = 0;
        if (!isMobile() && sb && !document.body.classList.contains('sidebar-hidden') && getComputedStyle(sb).position === 'absolute') {
          left = Math.max(0, Math.round(sb.getBoundingClientRect().right - cv.getBoundingClientRect().left));
        }
        const p = map.getPadding();
        if (p.left !== left) map.setPadding({ top: p.top, right: p.right, bottom: p.bottom, left: left });
      } catch (e) {}
    }
    window.KR_syncSidePad = syncSidePad;
    // 지도는 app.js 에서 만든 뒤 KR_syncSidePad 를 부르고 resize 에 연결한다
    const cls = document.getElementById('sidebar-close');
    if (cls) cls.addEventListener('click', closeDrawer);
    const bd = document.getElementById('sidebar-backdrop');
    if (bd) bd.addEventListener('click', closeDrawer);
    window.matchMedia('(max-width: 980px)').addEventListener('change', e => {
      if (!e.matches) closeDrawer();
    });
  }

  /* ---------- 드롭다운 ---------- */
  function closeDropdowns() {
    document.querySelectorAll('.tb-dropdown.open').forEach(d => {
      d.classList.remove('open');
      const b = d.querySelector('.tb-dropbtn');
      if (b) b.setAttribute('aria-expanded', 'false');
    });
  }
  function initDropdowns() {
    document.querySelectorAll('.tb-dropdown').forEach(dd => {
      const btn = dd.querySelector('.tb-dropbtn');
      if (!btn) return;
      const fresh = btn.cloneNode(true);
      btn.replaceWith(fresh);
      fresh.addEventListener('click', e => {
        e.stopPropagation();
        const wasOpen = dd.classList.contains('open');
        closeDropdowns();
        if (!wasOpen) {
          dd.classList.add('open');
          fresh.setAttribute('aria-expanded', 'true');
        }
      });
      dd.querySelectorAll('.tb-dropmenu button').forEach(b => {
        b.addEventListener('click', () => closeDropdowns());
      });
    });
    document.addEventListener('click', closeDropdowns);
  }

  /* ---------- 키보드 ---------- */
  function initKeys() {
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (e.defaultPrevented || e.isComposing || e.keyCode === 229) return;   // 안쪽에서 이미 처리 · 한글 조합 중
      if (window.DiagramMode && DiagramMode.isActive()) { DiagramMode.exit(); return; }
      // 위에 떠 있는 창부터 (K1, 2026-11-13) — 포커스가 창 밖(지도 등)에 있어도 Esc 로 닫힌다
      if (window.StationQuiz && StationQuiz.isOpen && StationQuiz.isOpen()) { StationQuiz.close(); return; }
      // 역 상세는 떡상 패널·타일 지도 위에 뜬다(z 1000) — 그것부터
      const sdm = MODALS.find(x => x.panel === 'sd-panel');
      if (sdm && panelOpen(sdm)) { const b = document.getElementById(sdm.close); if (b) b.click(); return; }
      if (window.MarketMap && MarketMap.isOpen && MarketMap.isOpen()) { MarketMap.close(); return; }
      if (window.RocketPanel && RocketPanel.isOpen && RocketPanel.isOpen()) { RocketPanel.close(); return; }
      const m = visibleModal();
      if (m) {
        const btn = document.getElementById(m.close);
        if (btn) btn.click();
        return;
      }
      // 역을 클릭해 뜬 정보 팝업
      if (document.querySelector('.maplibregl-popup') && typeof closeStationPopup === 'function') {
        closeStationPopup();
        return;
      }
      const open = document.querySelector('#route-panel:not([hidden]), #draw-panel:not([hidden])');
      if (open) { open.hidden = true; return; }
      const ddOpen = !!document.querySelector('.tb-dropdown.open');
      closeDropdowns();
      if (document.body.classList.contains('drawer-open')) { closeDrawer(); return; }
      if (ddOpen) return;
      // 닫을 것이 없으면: 입력칸에서 빠져나와 지도로 (K1) — 지도에서는 화살표·+/− 로 움직인다(map-keyboard)
      const a = document.activeElement;
      if (a && a !== document.body && a.blur) a.blur();
      const cv = (typeof map !== 'undefined' && map && map.getCanvas) ? map.getCanvas() : null;
      if (cv) { try { cv.focus({ preventScroll: true }); } catch (err) { /* 무시 */ } }
    });
    document.querySelectorAll('[data-close]').forEach(b => {
      b.addEventListener('click', () => {
        const el = document.getElementById(b.dataset.close);
        if (el) el.hidden = true;
      });
    });
  }

  /* ---------- 데이터 안전장치 ----------
   * data/lines.geojson 이 정리되기 전 상태에서도 연장이 2배로 보이지 않도록
   * 같은 구간이 양방향으로 중복된 조각을 런타임에서도 한 번 걸러낸다.
   */
  function havKm(a, b) {
    const R = Math.PI / 180;
    const dLat = (b[1] - a[1]) * R, dLon = (b[0] - a[0]) * R;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * R) * Math.cos(b[1] * R) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(h));
  }
  function partLen(p) {
    let km = 0;
    for (let i = 0; i < p.length - 1; i++) km += havKm(p[i], p[i + 1]);
    return km;
  }
  function partBox(p) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    p.forEach(c => {
      if (c[0] < x0) x0 = c[0];
      if (c[0] > x1) x1 = c[0];
      if (c[1] < y0) y0 = c[1];
      if (c[1] > y1) y1 = c[1];
    });
    return [x0, y0, x1, y1];
  }
  function cleanDuplicates() {
    let removed = 0;
    LINES.forEach(f => {
      const g = f.geometry;
      if (!g || g.type !== 'MultiLineString') return;
      const parts = g.coordinates.filter(p => p.length >= 2);
      if (parts.length < 2) return;
      const sig = parts.map(p => ({ p, len: partLen(p), bb: partBox(p) }))
        .sort((a, b) => b.len - a.len);
      const keep = [];
      sig.forEach(s => {
        const dup = keep.some(k =>
          Math.abs(k.len - s.len) <= Math.max(k.len, s.len) * 0.015 + 0.05 &&
          k.bb.every((v, i) => Math.abs(v - s.bb[i]) <= 0.002));
        if (!dup) keep.push(s);
      });
      if (keep.length === parts.length) return;
      removed += parts.length - keep.length;
      const set = new Set(keep.map(k => k.p));
      const coords = parts.filter(p => set.has(p));
      f.geometry = coords.length === 1
        ? { type: 'LineString', coordinates: coords[0] }
        : { type: 'MultiLineString', coordinates: coords };
    });
    return removed;
  }

  function whenReady(fn) {
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      const ok = typeof LINES !== 'undefined' && LINES.length &&
                 document.querySelectorAll('#line-list .line-item').length > 0;
      if (ok || tries > 150) {
        clearInterval(t);
        if (tries <= 150) fn();
      }
    }, 120);
  }

  /* 휴대폰 아래 툴바는 옆으로 밀어야 '분석·저장' 이 보인다. 밀 수 있다는 표시가 없어서 처음 온 사람은
   * 그 메뉴가 있는 줄 모른다(2026-11-11 사용성 점검). 오른쪽에 더 있으면 끝을 흐리게 하고 › 를 보여 준다.
   * 표시만 한다(눌리지 않음, pointer-events: none) — 눌리게 했더니 오른쪽 끝 '분석' 버튼을 가렸다.
   * 끝까지 밀었으면 숨는다. */
  function initToolbarMore() {
    const tb = document.getElementById('toolbar');
    if (!tb || document.getElementById('tb-more')) return;
    const more = document.createElement('div');
    more.id = 'tb-more';
    more.setAttribute('aria-hidden', 'true');
    more.textContent = '›';
    document.body.appendChild(more);
    const sync = () => {
      const can = isMobile() && tb.scrollWidth - tb.clientWidth - tb.scrollLeft > 8;
      more.hidden = !can;
    };
    tb.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    setTimeout(sync, 0); setTimeout(sync, 1500);
  }

  function boot() {
    // 데이터를 미리 받아 캐시를 데운다.
    // 예전에는 fetch(u) 를 그냥 한 번 더 던지고 "app.js 가 재사용한다"고 적어뒀는데,
    // 브라우저는 별개의 fetch() 를 합쳐주지 않는다. 그래서 lines.geojson 974KB 를
    // 두 번 내려받았다(전체 전송량의 35%). 이제는 '약속(promise)' 자체를 공유한다.
    loadGeoJSON('data/lines.geojson').catch(() => {});
    loadGeoJSON('data/stations.geojson').catch(() => {});
    watchStatus();
    watchModals();
    initKeys();
    initDropdowns();
    initDrawer();
    initToolbarMore();

    whenReady(() => {
      const sum = document.getElementById('data-summary');
      // 숫자마다 기준을 밝힌다 — 위 '86' 은 전국·계획 포함, 목록 '54' 는 수도권 범위 (감사 N13, 2026-11-13)
      if (sum) sum.textContent = '전국 노선 ' + LINES.length + '개(계획 포함) · 역 ' + STATIONS.length.toLocaleString() + '개';
      if (cleanDuplicates()) {
        try {
          const src = map.getSource('lines');
          if (src) src.setData({ type: 'FeatureCollection', features: LINES });
        } catch (e) {}
        renderLineList();
        updateFilters();
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  /* 역 노선 필터 (환승역 대응) — 역은 lines(지나는 노선 전부)를 가진다. line_id(대표 노선) 하나만 보면
   * 환승역이 대표 아닌 노선만 켰을 때 사라진다. MapLibre(4.x)는 GeoJSON 의 배열 속성을 타일로 넘길 때
   * 문자열로 바꾸므로 배열을 필터에 직접 쓰지 않고, '|노선1|노선2|' 문자열 키를 만들어 부분 문자열로 찾는다. */
  function stationLineIds(p) {
    const ls = (p && Array.isArray(p.lines) && p.lines.length) ? p.lines : (p && p.line_id ? [p.line_id] : []);
    return ls.filter(Boolean);
  }
  function linesKey(p) { return '|' + stationLineIds(p).join('|') + '|'; }
  // ids 중 하나라도 역의 노선이면 통과. ids 가 비면 아무것도 통과하지 않는다 (예전 ['in', …, []] 와 같음).
  function lineFilterExpr(ids, prop) {
    const key = ['get', prop || 'lines_key'];
    if (!ids || !ids.length) return ['==', 1, 0];
    return ['any'].concat(ids.map(id => ['in', '|' + id + '|', key]));
  }

  return { setStatus, closeModals, closeDropdowns, openDrawer, closeDrawer, isMobile, loadGeoJSON,
    stationLineIds, linesKey, lineFilterExpr };
})();

window.UI = UI;
