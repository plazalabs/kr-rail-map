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
  // 모듈이 패널을 게을리 만들어도 요소가 나타나는 순간 감시를 붙인다
  function watchModals() {
    MODALS.forEach(m => {
      const attach = () => {
        const el = document.getElementById(m.watchEl || m.panel);
        if (!el || el.__uiWatched) return;
        el.__uiWatched = true;
        const check = () => { if (panelOpen(m)) closeModals(m.panel); };
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
      new MutationObserver(() => {
        if (el.hidden) {
          // 길찾기 패널이 닫히면 경로 하이라이트도 같이 지운다
          if (id === 'route-panel' && typeof clearRouteHighlight === 'function') {
            clearRouteHighlight();
          }
          return;
        }
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
        setTimeout(() => { try { map.resize(); } catch (e) {} }, 60);
      });
    }
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
      if (window.DiagramMode && DiagramMode.isActive()) { DiagramMode.exit(); return; }
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
      closeDropdowns();
      if (document.body.classList.contains('drawer-open')) closeDrawer();
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

    whenReady(() => {
      const sum = document.getElementById('data-summary');
      if (sum) sum.textContent = '노선 ' + LINES.length + '개 · 역 ' + STATIONS.length.toLocaleString() + '개';
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

  return { setStatus, closeModals, closeDropdowns, openDrawer, closeDrawer, isMobile, loadGeoJSON };
})();

window.UI = UI;
