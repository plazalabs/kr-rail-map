/* 처음 온 사람 안내 (Guide) + 사이드바 '빠른 시작' — 2026-11-11
 *
 * 빠른 시작: 사이드바 맨 위(검색창 아래)에 핵심 기능 네 가지를 늘 보이게 둔다. 카드는 한 번만 뜨므로
 *   (회장님: '처음 화면에 있던 게 안 보인다') 늘 누를 수 있는 자리가 따로 있어야 한다. 휴대폰은 서랍 안 맨 위.
 *
 * 왜 필요한가
 *   길찾기·통근권·투자 모드·노선도는 툴바와 '분석' 메뉴 안에 있다. 처음 온 사람은 지도만 보고
 *   무엇을 할 수 있는지 모른 채 떠난다. 첫 방문에 한 번, 할 수 있는 일 네 가지를 바로 누를 수 있게 보여 준다.
 *
 * 규칙
 *   - 첫 방문에만 뜬다. 닫거나 항목을 누르면 다시 뜨지 않는다 (localStorage 'krrail-guide-seen').
 *   - 링크로 특정 화면을 연 경우(?from= / ?line= / ?mode= 등 주소에 질문이 있으면)는 띄우지 않는다 — 그 사람은 목적이 있다.
 *   - 저장소를 못 쓰면(사생활 보호 모드) 이번 방문에만 뜨고, 닫으면 이번 방문 동안은 다시 안 뜬다.
 *   - 지도를 가리지 않게 작게, 휴대폰에서는 아래 툴바 위에 띄운다. Esc·✕ 로 닫는다.
 */
(function (global) {
  'use strict';
  var KEY = 'krrail-guide-seen';
  var el = null;

  function seen() {
    try { return global.localStorage.getItem(KEY) === '1'; } catch (e) { return false; }
  }
  function markSeen() {
    try { global.localStorage.setItem(KEY, '1'); } catch (e) { /* 저장 못 해도 닫기는 된다 */ }
  }
  function close() {
    markSeen();
    if (el) { el.remove(); el = null; }
  }
  function click(id) {
    var b = document.getElementById(id);
    if (b) b.click();
  }

  var ITEMS = [
    ['route', '길찾기', '두 역 사이 시간·환승·요금, 개통 전후 비교', function () {
      var p = document.getElementById('route-panel');
      if (p && p.hidden) click('route-btn');
      var f = document.getElementById('route-from'); if (f) try { f.focus(); } catch (e) { /* 무시 */ }
    }],
    ['clock', '통근권 찾기', '직장까지 45분 안에 닿는 역을 지도에', function () {
      if (global.CommuteMap) global.CommuteMap.show();
    }],
    ['home', '투자 모드', '역 주변 시세·전세가율·실거래·공급 물량', function () {
      if (global.KR_MODE) global.KR_MODE.toggle();
    }],
    ['map', '노선도', '전국 노선을 지하철 노선도처럼', function () { click('diagram-btn'); }],
  ];
  function itemHtml(it, i, cls) {
    // title: 휴대폰 안내 카드는 설명 글을 숨기므로(J8) 길게 누르거나 마우스를 올리면 보이게
    return '<button type="button" class="' + cls + '" data-i="' + i + '" title="' + it[1] + ' — ' + it[2] + '"><span class="gd-ic" aria-hidden="true">' + Icons.svg(it[0]) +
      '</span><span><b>' + it[1] + '</b><small>' + it[2] + '</small></span></button>';
  }
  function run(i) {
    // 휴대폰: 서랍을 닫아야 지도·패널이 보인다
    if (global.UI && global.UI.closeDrawer && document.body.classList.contains('drawer-open')) global.UI.closeDrawer();
    try { ITEMS[i][3](); } catch (e) { /* 모듈이 없으면 조용히 */ }
    syncQuick();
  }

  /* 사이드바 '빠른 시작' — 늘 보이는 네 칸. 투자 모드 칸은 켜짐/꺼짐을 보여 준다 */
  function renderQuick() {
    var box = document.getElementById('quick-start');
    if (!box || box.childElementCount) return;
    box.innerHTML = ITEMS.map(function (it, i) { return itemHtml(it, i, 'qs-item'); }).join('');
    box.querySelectorAll('.qs-item').forEach(function (b) {
      b.addEventListener('click', function () { run(+b.getAttribute('data-i')); });
    });
    if (global.KR_MODE && global.KR_MODE.onChange) global.KR_MODE.onChange(syncQuick);
    syncQuick();
  }
  function syncQuick() {
    var b = document.querySelector('#quick-start .qs-item[data-i="2"]');
    if (!b || !global.KR_MODE) return;
    var on = global.KR_MODE.isInvest();
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.querySelector('b').textContent = on ? '투자 모드 켜짐' : '투자 모드';
  }

  // force: '사용법' 버튼으로 다시 열 때 — 이미 본 사람·링크로 온 사람도 연다 (작업 8)
  function show(force) {
    if (el) return;
    if (!force && seen()) return;
    if (!force && global.location && global.location.search) return;   // 링크로 들어온 사람
    el = document.createElement('div');
    el.id = 'guide-card';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', '처음 오셨나요 — 할 수 있는 일');
    el.innerHTML =
      '<div class="gd-head"><b>처음 오셨나요?</b> 이런 걸 할 수 있어요' +
      '<button type="button" class="gd-close" aria-label="안내 닫기"><i data-ic="close"></i></button></div>' +
      '<div class="gd-list">' + ITEMS.map(function (it, i) { return itemHtml(it, i, 'gd-item'); }).join('') + '</div>' +
      '<div class="gd-foot">이 버튼들은 왼쪽 메뉴 맨 위 <b>빠른 시작</b>에 늘 있어요</div>';
    el.querySelector('.gd-close').addEventListener('click', close);
    el.querySelectorAll('.gd-item').forEach(function (b) {
      b.addEventListener('click', function () {
        var i = +b.getAttribute('data-i');
        close();
        run(i);
      });
    });
    el.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    var host = document.getElementById('map-wrap') || document.body;
    host.appendChild(el);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderQuick);
  else renderQuick();

  global.Guide = { show: show, close: close, KEY: KEY, renderQuick: renderQuick };
})(typeof window !== 'undefined' ? window : this);
