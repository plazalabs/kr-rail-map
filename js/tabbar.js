/* TabBar — 휴대폰 아래 탭 5칸 (디자인 결함 전수 수정 작업 1, 2026-11-12)
 * 길찾기 · 떡상 · 시세 · 게시판 · 더보기
 * 탭은 새 기능이 아니라 '기존 버튼을 대신 눌러 주는 리모컨'이다 — app.js 로직·버튼 id 를 그대로 두려고.
 *   길찾기 = #route-btn, 떡상 = #rocket-btn, 시세 = 투자 모드 켜고(#mode-btn) 전세가율 색칠(#layer-jeonse)
 *   게시판 = board.html, 더보기 = 나머지 툴바(#toolbar)를 아래 시트로 (body.tb-more-open)
 * 선택 표시(aria-current)는 각 패널이 열려 있는지 보고 정한다.
 */
(function (global) {
  'use strict';
  if (typeof document === 'undefined') return;

  function $(id) { return document.getElementById(id); }
  function isOpen(id) { var el = $(id); return !!(el && !el.hidden); }

  var STATE = {
    route: function () { return isOpen('route-panel'); },
    rocket: function () { return isOpen('rocket-panel'); },
    price: function () { var cb = $('layer-jeonse'); return !!(cb && cb.checked); },
    more: function () { return document.body.classList.contains('tb-more-open'); },
    side: function () { return !document.body.classList.contains('sidebar-hidden'); }
  };

  function setMore(on) {
    // 시트를 열고 닫을 때 안의 드롭다운(도구·분석·저장)은 늘 닫힌 상태로 — 열린 채 남으면
    // 다음에 시트를 열고 그 메뉴를 누를 때 열리는 대신 닫혀 버린다 (e2e ui-fixes ⑧·panel-state 에서 발견)
    if (global.UI && global.UI.closeDropdowns) global.UI.closeDropdowns();
    document.body.classList.toggle('tb-more-open', !!on);
    var b = document.querySelector('#tabbar [data-tab="more"]');
    if (b) b.setAttribute('aria-expanded', on ? 'true' : 'false');
    sync();
  }

  function price() {
    var mode = global.KR_MODE;
    if (mode && !mode.isInvest()) { var mb = $('mode-btn'); if (mb) mb.click(); }
    var cb = $('layer-jeonse');
    if (!cb) return;
    cb.checked = !cb.checked;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
  }

  var ACT = {
    route: function () { var b = $('route-btn'); if (b) b.click(); },
    rocket: function () { var b = $('rocket-btn'); if (b) b.click(); },
    price: price,
    more: function () { setMore(!STATE.more()); },
    // PC 레일 '노선' = 기존 사이드바 접기 버튼 (js/ui.js)
    side: function () { var b = $('sidebar-toggle'); if (b) b.click(); },
    help: function () { if (global.Guide) global.Guide.show(true); }
  };

  function sync() {
    var bar = $('tabbar');
    if (!bar) return;
    bar.querySelectorAll('[data-tab]').forEach(function (b) {
      var f = STATE[b.getAttribute('data-tab')];
      var on = !!(f && f());
      if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
  }

  function init() {
    var bar = $('tabbar');
    if (!bar || bar.__tb) return;
    bar.__tb = true;
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-tab]');
      if (!b) return;
      var t = b.getAttribute('data-tab');
      if (t !== 'more') setMore(false);
      if (ACT[t]) ACT[t]();
      setTimeout(sync, 0);
    });
    var ms = $('m-search');
    if (ms) ms.addEventListener('click', function () {
      setMore(false);
      if (global.UI && global.UI.openDrawer) global.UI.openDrawer();
      var inp = $('search');
      if (inp) { try { inp.focus({ preventScroll: true }); } catch (e) { inp.focus(); } }
    });
    var gb = $('guide-btn');
    if (gb) gb.addEventListener('click', function () { if (global.Guide) global.Guide.show(true); });
    // 더보기 시트: 안의 버튼을 누르면 닫힘 (드롭다운 여는 버튼·배경 지도 고르기는 빼고), Esc·바깥 누르면 닫힘
    var tb = $('toolbar');
    if (tb) tb.addEventListener('click', function (e) {
      if (!STATE.more()) return;
      var b = e.target.closest('button, a');
      if (!b || b.classList.contains('tb-dropbtn') || b.closest('.tb-group')) return;
      setTimeout(function () { setMore(false); }, 0);
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && STATE.more()) setMore(false); });
    document.addEventListener('pointerdown', function (e) {
      if (!STATE.more()) return;
      if (e.target.closest('#toolbar, #tabbar, .tb-dropmenu')) return;
      setMore(false);
    });
    // 패널이 열리고 닫히는 것(hidden)·체크박스 변화를 보고 선택 표시를 맞춘다
    // 떡상 패널은 나중에 만들어지므로 지도 영역 전체를 본다
    var wrap = $('map-wrap') || document.body;
    if (global.MutationObserver) new MutationObserver(sync).observe(wrap, { attributes: true, attributeFilter: ['hidden'], subtree: true, childList: true });
    var cb = $('layer-jeonse');
    if (cb) cb.addEventListener('change', sync);
    if (global.MutationObserver) new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    sync();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  global.TabBar = { sync: sync, setMore: setMore, _state: STATE };
})(typeof window !== 'undefined' ? window : this);
