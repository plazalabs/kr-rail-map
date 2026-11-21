/* LineStatus — 노선 상태(status) 하나에서 화면 말 하나를 만든다.
 * 표기 규칙(CLAUDE.md 3장): '운행 중 / 공사 중 / 계획 / 구상'. 화면 파일은 이 말을 직접 쓰지 않고 여기서 받는다.
 * status 가 없는 노선은 운행 중(lines.geojson 기본). */
(function () {
  'use strict';
  var WORDS = { open: '운행 중', construction: '공사 중', planned: '계획', proposed: '구상' };
  function word(st) { return WORDS[st || 'open'] || String(st); }
  /* 노선 글자 {n: 이름, s: status, y: open_year} — 지도 라벨·rank.html 역 카드·rank.html 공유 그림·앱 공유 카드·길찾기 비교 카드가
   * 이 함수 하나를 쓴다. 개통 전: '이름 (상태 말 · 연도)', 연도 없으면 '이름 (상태 말)'. 운행 중: 이름만. */
  function label(m) {
    if (!m) return '';
    if ((m.s || 'open') === 'open') return m.n;
    return m.n + ' (' + word(m.s) + (typeof m.y === 'number' ? ' · ' + m.y : '') + ')';
  }
  var api = { WORDS: WORDS, word: word, label: label };
  if (typeof globalThis !== 'undefined') globalThis.LineStatus = api;
  if (typeof window !== 'undefined') window.LineStatus = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
