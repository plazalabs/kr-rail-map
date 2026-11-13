/* 열차 기다리는 시간 — 공통 설정 (68점 감사 5번·D9, 2026-11-13)
 * 'none'  : 기다리는 시간 뺌 — 역끼리 비교용 (떡상 순위·역 타일 기본, 역 상세 접근성 표)
 * 'peak'  : 출퇴근 배차의 절반을 탈 때·갈아탈 때 넣음 — 실제에 가깝게 (레일포털 시각표, data/headways.json)
 * 떡상 패널 '배차 포함' · 역 타일 지도 · 통근권이 이 값 하나를 같이 쓴다. 한 곳에서 바꾸면 다른 곳도 바뀐다.
 * 이 브라우저에만 저장(localStorage). 저장이 막혀 있어도 이번 화면에서는 동작.
 */
(function (global) {
  'use strict';
  var KEY = 'krrail-wait';
  var cur = 'none';
  try { var v = localStorage.getItem(KEY); if (v === 'peak' || v === 'none') cur = v; } catch (e) { /* 저장소 없음 */ }
  var fns = [];
  function get() { return cur; }
  function isPeak() { return cur === 'peak'; }
  function set(v) {
    v = v === 'peak' ? 'peak' : 'none';
    if (v === cur) return;
    cur = v;
    try { localStorage.setItem(KEY, v); } catch (e) { /* 무시 */ }
    fns.slice().forEach(function (fn) { try { fn(cur); } catch (e) { /* 한 곳 실패가 다른 곳을 막지 않게 */ } });
    try { if (global.KRTrack) global.KRTrack('대기 설정', { 값: v === 'peak' ? '배차 넣음' : '뺌' }); } catch (e) { /* 무시 */ }
  }
  function onChange(fn) { fns.push(fn); }
  function label(v) { return (v || cur) === 'peak' ? '출퇴근 배차 넣음' : '열차 대기 뺌'; }
  global.KR_WAIT = { get: get, set: set, isPeak: isPeak, onChange: onChange, label: label };
})(typeof window !== 'undefined' ? window : globalThis);
