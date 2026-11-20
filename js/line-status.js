/* LineStatus — 노선 상태(status) 하나에서 화면 말 하나를 만든다.
 * 표기 규칙(CLAUDE.md 3장): '운행 중 / 공사 중 / 계획 / 구상'. 화면 파일은 이 말을 직접 쓰지 않고 여기서 받는다.
 * status 가 없는 노선은 운행 중(lines.geojson 기본). */
(function () {
  'use strict';
  var WORDS = { open: '운행 중', construction: '공사 중', planned: '계획', proposed: '구상' };
  function word(st) { return WORDS[st || 'open'] || String(st); }
  var api = { WORDS: WORDS, word: word };
  if (typeof globalThis !== 'undefined') globalThis.LineStatus = api;
  if (typeof window !== 'undefined') window.LineStatus = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
