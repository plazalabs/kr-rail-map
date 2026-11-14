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
      send(name, data, 0);
    } catch (e) { /* 통계 실패는 조용히 무시 */ }
  }
  // Umami 가 아직 안 떴으면(느린 망) 0.5초씩 최대 10번 기다렸다 보낸다 — 첫 화면 이벤트(공유로 도착 등)를 잃지 않게
  function send(name, data, n) {
    var u = global.umami;
    if (u && typeof u.track === 'function') { try { u.track(name, data); } catch (e) { /* 무시 */ } return; }
    if (n < 10 && typeof setTimeout === 'function') setTimeout(function () { send(name, data, n + 1); }, 500);
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
  // 공유 성공 통계 (2026-11-15): 카드·링크로 '받은 사람이 실제로 들어왔나'를 센다.
  // 공유 카드 주소는 ?ref=card-… (예전 11-14 판은 ?from=card-… — from 은 길찾기 출발역 칸이라 겹쳤다).
  // 센 뒤 주소에서 이름표를 지운다 — 그대로 두면 이 사람이 다시 링크를 복사할 때 따라가 숫자가 부풀고,
  // 첫 방문 안내(js/guide.js)가 '링크로 온 사람'으로 잘못 보고 숨는다.
  function shareRef(search) {
    try {
      var q = new URLSearchParams(search || '');
      var r = q.get('ref'), f = q.get('from');
      if (r && /^[a-z0-9-]{1,32}$/.test(r)) return r;
      if (f && /^card-[a-z0-9-]{1,26}$/.test(f)) return f;
    } catch (e) { /* 무시 */ }
    return null;
  }
  function landing() {
    try {
      var loc = global.location; if (!loc) return;
      var ref = shareRef(loc.search); if (!ref) return;
      track('공유로 도착', { 종류: ref, 첫방문: first });
      var u = new URL(loc.href);
      u.searchParams.delete('ref');
      if (/^card-/.test(u.searchParams.get('from') || '')) u.searchParams.delete('from');
      if (global.history && history.replaceState) history.replaceState(history.state, '', u.pathname + (u.search === '?' ? '' : u.search) + u.hash);
    } catch (e) { /* 무시 */ }
  }
  landing();
  track.task = task;
  track.shareRef = shareRef;   // 시험용
  track._bucket = bucket;   // 시험용
  global.KRTrack = track;
})(typeof window !== 'undefined' ? window : this);
