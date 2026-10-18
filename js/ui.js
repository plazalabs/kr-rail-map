/* =========================================================
   앱 셸 (js/ui.js)
   - app.js 를 건드리지 않고 UI 계층만 담당한다.
   - 토스트 / 모달 관리 / 드로어 / 드롭다운 / 키보드
   - 표시 범위(수도권·전국)와 ?line= 딥링크
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
    // app.js 가 이미 같은 버튼에 접기 핸들러를 걸어두었으므로,
    // 노드를 복제해 기존 리스너를 제거한 뒤 우리 동작만 연결한다.
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
      // app.js 가 걸어둔 토글과 중복되지 않도록 노드를 교체한다
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
    // 패널 공통 닫기 버튼
    document.querySelectorAll('[data-close]').forEach(b => {
      b.addEventListener('click', () => {
        const el = document.getElementById(b.dataset.close);
        if (el) el.hidden = true;
      });
    });
  }


  /* ---------- 선형 중복 제거 (data/dedupe_geometry.py 와 같은 규칙) ---------- */
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
      if (c[0] < x0) x0 = c[0]; if (c[0] > x1) x1 = c[0];
      if (c[1] < y0) y0 = c[1]; if (c[1] > y1) y1 = c[1];
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

  /* ---------- 노선 길이 표기 보정 (조각을 이어붙여 계산하면 과대계상됨) ---------- */
  function fixLineMeta() {
    document.querySelectorAll('#line-list .line-item').forEach(label => {
      const line = lineOfLabel(label);
      if (!line) return;
      const g = line.geometry;
      const parts = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
      const km = parts.reduce((s, p) => s + partLen(p), 0);
      const names = new Set();
      STATIONS.forEach(st => {
        if ((st.properties.lines || []).includes(line.properties.id)) names.add(st.properties.name_ko);
      });
      const meta = label.querySelector('.line-meta');
      if (meta) meta.textContent = km.toFixed(1) + 'km · ' + names.size + '역';
    });
  }

  /* ---------- 분류 순서 정리 ---------- */
  const CAT_ORDER = ['도시철도', '광역·도시', 'KTX·고속', '일반철도', '기타'];
  function sortGroups() {
    const box = document.getElementById('line-list');
    if (!box) return;
    const ds = [...box.querySelectorAll('details')];
    ds.sort((a, b) => {
      const ta = (a.querySelector('summary') || {}).textContent || '';
      const tb = (b.querySelector('summary') || {}).textContent || '';
      const ia = CAT_ORDER.findIndex(c => ta.startsWith(c));
      const ib = CAT_ORDER.findIndex(c => tb.startsWith(c));
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    ds.forEach(d => box.appendChild(d));
  }

  function refreshFromData() {
    const removed = cleanDuplicates();
    try {
      const src = map.getSource('lines');
      if (src) src.setData({ type: 'FeatureCollection', features: LINES });
    } catch (e) {}
    renderLineList();
    fixLineMeta();
    sortGroups();
    return removed;
  }

  /* ---------- 표시 범위 ---------- */
  const BBOX = { minLng: 126.28, maxLng: 128.02, minLat: 36.88, maxLat: 38.36 };
  function inMetro(c) {
    return c[0] >= BBOX.minLng && c[0] <= BBOX.maxLng && c[1] >= BBOX.minLat && c[1] <= BBOX.maxLat;
  }
  function metroIdSet() {
    const ids = new Set();
    STATIONS.forEach(s => {
      if (!inMetro(s.geometry.coordinates)) return;
      (s.properties.lines || []).forEach(l => ids.add(l));
    });
    return ids;
  }
  // 라벨 DOM 에서 노선을 찾는다 (app.js 의 renderLineList 구조에 의존)
  function lineOfLabel(label) {
    const node = label.childNodes[2];
    const name = node && node.nodeValue ? node.nodeValue.trim() : '';
    return LINES.find(l => (l.properties.name_ko || '') === name) || null;
  }
  function applyScope(mode, opts) {
    const ids = mode === 'all' ? null : metroIdSet();
    let shown = 0;
    document.querySelectorAll('#line-list .line-item').forEach(label => {
      const line = lineOfLabel(label);
      const on = !ids || (line && ids.has(line.properties.id));
      label.style.display = on ? '' : 'none';
      const cb = label.querySelector('input[type="checkbox"]');
      if (cb) cb.checked = !!on;
      if (line) on ? visibleLines.add(line.properties.id) : visibleLines.delete(line.properties.id);
      if (on) shown++;
    });
    // 비어 있는 분류는 접는다
    document.querySelectorAll('#line-list details').forEach(d => {
      const any = [...d.querySelectorAll('.line-item')].some(l => l.style.display !== 'none');
      d.style.display = any ? '' : 'none';
    });
    updateFilters();
    const lc = document.getElementById('line-count');
    if (lc) lc.textContent = '(' + shown + ')';
    const sc = document.getElementById('scope-count');
    if (sc) sc.textContent = shown + '개 노선';
    document.querySelectorAll('.scope-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.scope === mode));
    if (!opts || opts.fly !== false) {
      if (mode === 'metro') map.fitBounds([[126.28, 36.88], [128.02, 38.36]], { padding: 40, duration: 700 });
      else map.fitBounds([[125.9, 33.0], [129.6, 38.6]], { padding: 40, duration: 700 });
    }
    return shown;
  }
  function initScope() {
    document.querySelectorAll('.scope-btn').forEach(b => {
      b.addEventListener('click', () => applyScope(b.dataset.scope));
    });
  }

  /* ---------- ?line= 딥링크 ---------- */
  function applyDeepLink() {
    const lid = new URLSearchParams(location.search).get('line');
    if (!lid) return false;
    const f = LINES.find(l => l.properties.id === lid);
    if (!f) return false;
    applyScope('all', { fly: false });
    document.querySelectorAll('#line-list .line-item').forEach(label => {
      const line = lineOfLabel(label);
      const on = !!line && line.properties.id === lid;
      const cb = label.querySelector('input[type="checkbox"]');
      if (cb) cb.checked = on;
      if (line) on ? visibleLines.add(line.properties.id) : visibleLines.delete(line.properties.id);
    });
    updateFilters();
    const b = new maplibregl.LngLatBounds();
    const parts = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
    parts.forEach(p => p.forEach(c => b.extend(c)));
    map.fitBounds(b, { padding: 60, duration: 0 });
    setStatus(f.properties.name_ko + ' 노선만 표시 중 · 범위 버튼으로 전체 보기');
    return true;
  }

  /* ---------- 데이터 준비 후 ---------- */
  function whenReady(fn) {
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      const listReady = document.querySelectorAll('#line-list .line-item').length > 0;
      if ((listReady && typeof LINES !== 'undefined' && LINES.length) || tries > 120) {
        clearInterval(t);
        if (tries <= 120) fn();
      }
    }, 120);
  }

  function boot() {
    watchStatus();
    watchModals();
    initKeys();
    initDropdowns();
    initDrawer();
    initScope();
    whenReady(() => {
      const sum = document.getElementById('data-summary');
      if (sum) sum.textContent = '노선 ' + LINES.length + '개 · 역 ' + STATIONS.length.toLocaleString() + '개';
      refreshFromData();
      const linked = applyDeepLink();
      if (!linked) {
        applyScope('metro', { fly: false });
        map.fitBounds([[126.28, 36.88], [128.02, 38.36]], { padding: 40, duration: 0 });
      } else {
        document.querySelectorAll('.scope-btn').forEach(b =>
          b.classList.toggle('active', b.dataset.scope === 'all'));
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  return { setStatus, closeModals, closeDropdowns, openDrawer, closeDrawer, applyScope, isMobile };
})();

window.UI = UI;
