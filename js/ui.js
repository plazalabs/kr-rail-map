/* =========================================================
   앱 셸 (js/ui.js)
   - app.js 위에서 동작하는 UI 계층: 토스트 / 모달 관리 / 드로어 /
     드롭다운 / 키보드 / 데이터 안전장치
   - 표시 범위·딥링크는 app.js(setScope, focusLineFromUrl)가 담당한다
   ========================================================= */
'use strict';

const UI = (() => {
  const isMobile = () => window.matchMedia('(max-width: 980px)').matches;

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
    { panel: 'sd-panel', close: 'sd-close' },
    { panel: 'rt-panel', close: 'rt-close' },
  ];
  function visibleModal() {
    for (const m of MODALS) {
      const el = document.getElementById(m.panel);
      if (el && el.style.display !== 'none' && !el.hidden) return m;
    }
    return null;
  }
  function closeModals(exceptId) {
    for (const m of MODALS) {
      if (m.panel === exceptId) continue;
      const el = document.getElementById(m.panel);
      if (!el || el.style.display === 'none') continue;
      const btn = document.getElementById(m.close);
      if (btn) btn.click();
      else el.style.display = 'none';
    }
  }
  function watchModals() {
    MODALS.forEach(m => {
      const el = document.getElementById(m.panel);
      if (!el) return;
      new MutationObserver(() => {
        if (el.style.display !== 'none') closeModals(m.panel);
      }).observe(el, { attributes: true, attributeFilter: ['style'] });
    });
    ['route-panel', 'draw-panel'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      new MutationObserver(() => {
        if (el.hidden) return;
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
    // app.js 가 같은 버튼에 접기 핸들러를 걸어두므로 노드를 교체해 리스너를 비운다
    const old = document.getElementById('sidebar-toggle');
    if (old) {
      const btn = old.cloneNode(true);
      old.replaceWith(btn);
      btn.addEventListener('click', () => {
        if (isMobile()) { openDrawer(); return; }
        document.body.classList.toggle('sidebar-hidden');
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
    // 데이터를 미리 받아 캐시를 데운다 (app.js 는 이 fetch 를 재사용)
    ['data/lines.geojson', 'data/stations.geojson'].forEach(u => {
      try { fetch(u).catch(() => {}); } catch (e) {}
    });
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

  return { setStatus, closeModals, closeDropdowns, openDrawer, closeDrawer, isMobile };
})();

window.UI = UI;
