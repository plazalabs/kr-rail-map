/* 몇분컷 바로가기 — 역 상세·랭킹 카드·첫 방문 안내 카드가 같이 쓴다.
 * 바로가기는 data/gtx-card.json 에 카드가 있는 역에만 붙인다(없는 역에 붙이면 빈 화면으로 간다).
 * 주소는 gtx.html?st=역id(동명역도 id 로 한 곳) + ?ref=entry-…(들어온 곳 표시, js/track.js 가 '몇분컷 입구'로 센다).
 * 카드 자료는 처음 필요할 때 한 번만 받는다 — 지도 첫 화면에서는 받지 않는다.
 */
(function (global) {
  'use strict';
  var TEXT = '몇분컷 카드로 보기 →';
  var ids = null, wait = null;

  function load() {
    if (ids) return Promise.resolve(ids);
    if (!wait) {
      wait = fetch('data/gtx-card.json')
        .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
        .then(function (d) { ids = d && d.s ? d.s : {}; return ids; })
        .catch(function () { wait = null; return {}; });   // 못 받으면 링크를 안 붙인다(다음에 다시 시도)
    }
    return wait;
  }
  // 자료가 와 있으면 바로 답(true/false), 아직이면 null
  function hasNow(id) { return ids ? Object.prototype.hasOwnProperty.call(ids, id) : null; }
  function has(id) { return load().then(function (s) { return Object.prototype.hasOwnProperty.call(s, id); }); }
  function href(id, where) { return 'gtx.html?st=' + encodeURIComponent(id) + '&ref=entry-' + where; }

  global.GtxLink = { TEXT: TEXT, load: load, has: has, hasNow: hasNow, href: href };
})(typeof window !== 'undefined' ? window : this);
