/* 처음 온 사람 안내 (Guide) — 2026-11-11
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
    ['🧭', '길찾기', '두 역 사이 시간·환승·요금, 개통 전후 비교', function () { click('route-btn'); }],
    ['⏱', '통근권 찾기', '직장까지 45분 안에 닿는 역을 지도에', function () {
      if (global.CommuteMap) global.CommuteMap.show();
    }],
    ['🏠', '투자 모드', '역 주변 시세·실거래·공급 물량', function () {
      if (global.KR_MODE && !global.KR_MODE.isInvest()) global.KR_MODE.set('invest');
    }],
    ['🗺', '노선도', '전국 노선을 지하철 노선도처럼', function () { click('diagram-btn'); }],
  ];

  function show() {
    if (el || seen()) return;
    if (global.location && global.location.search) return;   // 링크로 들어온 사람
    el = document.createElement('div');
    el.id = 'guide-card';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', '처음 오셨나요 — 할 수 있는 일');
    el.innerHTML =
      '<div class="gd-head"><b>처음 오셨나요?</b> 이런 걸 할 수 있어요' +
      '<button type="button" class="gd-close" aria-label="안내 닫기">✕</button></div>' +
      '<div class="gd-list">' + ITEMS.map(function (it, i) {
        return '<button type="button" class="gd-item" data-i="' + i + '"><span class="gd-ic" aria-hidden="true">' + it[0] +
          '</span><span><b>' + it[1] + '</b><small>' + it[2] + '</small></span></button>';
      }).join('') + '</div>';
    el.querySelector('.gd-close').addEventListener('click', close);
    el.querySelectorAll('.gd-item').forEach(function (b) {
      b.addEventListener('click', function () {
        var fn = ITEMS[+b.getAttribute('data-i')][3];
        close();
        try { fn(); } catch (e) { /* 모듈이 없으면 조용히 */ }
      });
    });
    el.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    var host = document.getElementById('map-wrap') || document.body;
    host.appendChild(el);
  }

  global.Guide = { show: show, close: close, KEY: KEY };
})(typeof window !== 'undefined' ? window : this);
