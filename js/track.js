/* 기능 사용 횟수 세기 (Umami 이벤트, 2026-11-13)
 * 어떤 기능을 실제로 쓰는지 알아야 다음에 무엇을 고칠지 정할 수 있다 — 방문 수만으로는 모른다.
 * - 쿠키·개인 정보 없음. 역 이름·탭 이름 같은 '무엇을 눌렀나'만 보낸다(검색어 원문·좌표는 안 보냄).
 * - Umami 스크립트는 실제 사이트(plazalabs.github.io)에서만 센다(data-domains). 로컬 시험에서는 아무 일도 안 한다.
 * - Umami 가 못 떴거나 막혀 있어도(광고 차단 등) 앱 동작에는 영향 없다.
 */
(function (global) {
  'use strict';
  var last = {};
  function track(name, data) {
    try {
      // 같은 일을 1초 안에 두 번 세지 않는다 (버튼 연타·자동 다시 그리기)
      var key = name + JSON.stringify(data || {}), now = Date.now();
      if (last[key] && now - last[key] < 1000) return;
      last[key] = now;
      var u = global.umami;
      if (u && typeof u.track === 'function') u.track(name, data);
    } catch (e) { /* 통계 실패는 조용히 무시 */ }
  }
  global.KRTrack = track;
})(typeof window !== 'undefined' ? window : this);
