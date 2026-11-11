/* 투자 모드 스위치 (2026-11-09 회장님 결정)
 *
 * 꺼짐(rail, 기본) = 그냥 철도 지도. 역 상세에 시세·단지·공급이 없고, 그 자료도 받지 않는다.
 * 켜짐(invest)     = 역 상세에 시세·단지·공급, '분석 › 역세권 투자분석' 메뉴가 보인다.
 *
 * 판단은 이 파일의 KR_MODE.isInvest() 한 곳에서만 한다. 부동산 절을 그리는 곳과
 * 자료를 받는 곳이 모두 이걸 본다 → 새 부동산 자료(실거래 7종 등)도 같은 문을 지나게 한다.
 *
 * 저장: localStorage 'krrail-mode' ('rail' | 'invest'). 테마 저장(krrail-theme)과 같은 방식.
 * 공유 링크: 주소에 ?mode=invest (또는 ?mode=rail) 가 있으면 그 방문에서만 그 모드로 연다.
 *            받은 사람이 저장해 둔 설정은 바꾸지 않는다 (사용자가 스위치를 직접 누를 때만 저장).
 */
(function (global) {
  'use strict';
  var KEY = 'krrail-mode';
  var VALID = { rail: 1, invest: 1 };

  // 순수 함수 — 단위 시험용. 저장값·주소 쿼리로 시작 모드를 정한다.
  function resolve(stored, search) {
    var m = /[?&]mode=([a-z]+)/.exec(search || '');
    if (m && VALID[m[1]]) return { mode: m[1], fromUrl: true };
    return { mode: VALID[stored] ? stored : 'rail', fromUrl: false };
  }

  var stored = null;
  try { stored = global.localStorage ? global.localStorage.getItem(KEY) : null; } catch (e) { /* 사생활 보호 모드 등 */ }
  var start = resolve(stored, global.location ? global.location.search : '');
  var mode = start.mode;
  var listeners = [];

  function isInvest() { return mode === 'invest'; }

  // persist=false 는 주소 쿼리처럼 '이번 방문만' 바꿀 때
  function set(next, persist) {
    if (!VALID[next]) return;
    var changed = next !== mode;
    mode = next;
    if (persist !== false) {
      try { global.localStorage.setItem(KEY, next); } catch (e) { /* 저장 실패해도 이번 방문은 그 모드 */ }
    }
    applyDom();
    if (changed) listeners.slice().forEach(function (fn) { try { fn(mode); } catch (e) { /* 다른 구독자 보호 */ } });
    // 사용자가 직접 켰을 때만(공유 링크 ?mode=invest 는 제외) — 무엇이 보이는지 한 번 안내
    if (changed && next === 'invest' && persist !== false) showTip();
  }

  // 투자 모드 첫 안내 (2026-11-11 사용성 점검 B) — 평생 한 번. 닫기·20초 뒤 자동으로 사라짐
  var TIP_KEY = 'krrail-invest-tip-seen';
  function showTip() {
    if (typeof document === 'undefined' || !document.body || document.getElementById('invest-tip')) return;
    try { if (global.localStorage.getItem(TIP_KEY) === '1') return; global.localStorage.setItem(TIP_KEY, '1'); } catch (e) { /* 저장 못 해도 한 번은 보여 준다 */ }
    var box = document.createElement('div');
    box.id = 'invest-tip';
    box.setAttribute('role', 'status');
    box.innerHTML = '<p><b>🏠 투자 모드를 켰어요.</b> 역을 누르면 맨 위에 <b>평당 시세 · 전세가율 · 강남까지 시간</b>이 보여요. ' +
      '지도 전체를 전세가율로 색칠하려면 왼쪽 목록(휴대폰은 ☰)의 <b>‘전세가율 색칠’</b>을 켜세요. ' +
      '통근권 목록은 시세·전세가율 순으로 정렬돼요.</p><button type="button">알겠어요</button>';
    var timer = null;
    function close() { if (timer) clearTimeout(timer); if (box.parentNode) box.parentNode.removeChild(box); }
    box.querySelector('button').addEventListener('click', close);
    timer = setTimeout(close, 20000);
    document.body.appendChild(box);
  }

  function toggle() { set(isInvest() ? 'rail' : 'invest'); }
  function onChange(fn) { if (typeof fn === 'function') listeners.push(fn); }

  // 화면 쪽: body[data-mode], 스위치 버튼 눌림 표시, 투자분석 메뉴 숨김
  function applyDom() {
    if (typeof document === 'undefined' || !document.body) return;
    document.body.setAttribute('data-mode', mode);
    var btn = document.getElementById('mode-btn');
    if (btn) {
      btn.setAttribute('aria-pressed', isInvest() ? 'true' : 'false');
      btn.classList.toggle('active', isInvest());
      btn.title = isInvest() ? '투자 모드 끄기 (철도만 보기)' : '투자 모드 켜기 (시세·단지·공급 보기)';
    }
    var inv = document.getElementById('invest-btn');
    if (inv) inv.hidden = !isInvest();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyDom);
    else applyDom();
  }

  global.KR_MODE = {
    isInvest: isInvest,
    get: function () { return mode; },
    set: set,
    toggle: toggle,
    onChange: onChange,
    fromUrl: start.fromUrl,
    KEY: KEY,
    TIP_KEY: TIP_KEY,
    _resolve: resolve
  };
})(typeof window !== 'undefined' ? window : this);
