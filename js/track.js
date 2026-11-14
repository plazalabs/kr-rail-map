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
  // 과업 측정 (종합피드백 12장 A③, 2026-11-14): '처음 온 사람이 하려던 일을 해냈나'를 숫자로.
  // 단계마다 이 페이지에서 한 번만 '과업' 이벤트를 보낸다 — 단계 이름 · 첫 방문 여부 · 들어온 뒤 걸린 시간(구간).
  // 전환율 = 단계별 과업 수 ÷ 방문 수 (Umami 이벤트 화면에서 '과업' → 단계·첫방문으로 나눠 본다).
  var T0 = Date.now(), done = {}, first = '아니오';
  try {
    var ls = global.localStorage;
    if (ls && !ls.getItem('krrail-seen')) { first = '예'; ls.setItem('krrail-seen', String(T0)); }
  } catch (e) { first = '모름'; }   // 저장소가 막혀 있으면(사생활 보호 창 등) 첫 방문을 알 수 없다
  function bucket(ms) {
    var s = ms / 1000;
    return s < 30 ? '30초 안' : s < 120 ? '2분 안' : s < 300 ? '5분 안' : '5분 넘게';
  }
  var STEPS = { search: '역 검색 성공', route: '길찾기 결과', price: '시세 상세', top3: 'TOP3 카드' };
  function task(step) {
    if (!STEPS[step] || done[step]) return;
    done[step] = true;
    track('과업', { 단계: STEPS[step], 첫방문: first, 걸린시간: bucket(Date.now() - T0) });
  }
  track.task = task;
  track._bucket = bucket;   // 시험용
  global.KRTrack = track;
})(typeof window !== 'undefined' ? window : this);
