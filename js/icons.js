/* Icons — 한국철도맵 선 아이콘 한 벌 (디자인 결함 전수 수정, 2026-11-12)
 *
 * 이모지·그림 문자(✕ ☆ ◎ …)를 모두 이 아이콘으로 바꾼다. 같은 굵기(1.8)·같은 판(24×24)·글자색(currentColor).
 * 쓰는 법
 *   JS 문자열:   Icons.svg('close')              → '<svg class="ic" …>…</svg>'
 *   HTML 고정:   <i class="ic" data-ic="close"></i>  → 페이지가 뜨면 hydrate() 가 SVG 로 바꾼다
 * 그림은 단순 도형으로 직접 그렸다 (외부 아이콘 세트를 가져오지 않음).
 * tests/no-emoji.test.js 가 이모지 재유입을, tests/icons.test.js 가 쓰는 이름이 모두 있는지 본다.
 */
(function (global) {
  'use strict';
  var P = {
    close: 'M6 6l12 12M18 6L6 18',
    star: 'M12 3.5l2.6 5.5 6 .7-4.5 4 1.3 5.8L12 16.5 6.6 19.5 7.9 13.7 3.4 9.7l6-.7z',
    locate: 'M12 2v3M12 19v3M2 12h3M19 12h3M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
    swap: 'M8 20V4M5 7l3-3 3 3M16 4v16M13 17l3 3 3-3',
    trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
    home: 'M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6',
    message: 'M4 5h16v11H9l-5 4z',
    route: 'M8 18h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7M6 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM18 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
    clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
    map: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14',
    play: 'M8 5l11 7-11 7z',
    pause: 'M8 5v14M16 5v14',
    stop: 'M7 7h10v10H7z',
    up: 'M3 3v18h18M7 15l4-4 3 3 5-6',
    down: 'M3 3v18h18M7 9l4 4 3-3 5 6',
    flat: 'M5 12h14',
    sparkle: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18',
    camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 9.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
    link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
    tool: 'M15 4a5 5 0 0 0-5 6l-6 6v4h4l6-6a5 5 0 0 0 6-5l-3 3-3-1-1-3z',
    coffee: 'M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 10h2a2 2 0 0 1 0 4h-2M8 3v3M12 3v3',
    train: 'M7 3h10a2 2 0 0 1 2 2v9a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2zM5 10h14M8 21l2-4M16 21l-2-4M9 14h.01M15 14h.01',
    transfer: 'M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4',
    alert: 'M12 3l10 18H2zM12 10v5M12 18v.5',
    walk: 'M13 4.5a1.5 1.5 0 1 0 0-.01M13 8l-2 6 3 3v4M11 14l-3 7M12 10l4 2M12 10l-4 2',
    pin: 'M12 21s-6-6-6-11a6 6 0 0 1 12 0c0 5-6 11-6 11zM12 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
    chart: 'M5 20V10M12 20V4M19 20v-7',
    building: 'M5 21V3h14v18M3 21h18M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2',
    calendar: 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4',
    check: 'M5 12l5 5 9-10',
    menu: 'M4 6h16M4 12h16M4 18h16',
    repeat: 'M4 12a8 8 0 0 1 14-5l2 2M20 4v5h-5M20 12a8 8 0 0 1-14 5l-2-2M4 20v-5h5',
    won: 'M5 8l2.5 9 2.5-6 2 0 2.5 6L17 8M4 11h16',
    zap: 'M13 3L5 14h6l-1 7 8-11h-6z',
    depart: 'M6 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM8 12h12M16 8l4 4-4 4',
    flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
    theme: 'M12 3a9 9 0 1 0 0 18V3z',
    help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14M12 17v.5',
    search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
    save: 'M12 4v11M7 10l5 5 5-5M5 20h14',
    pencil: 'M4 20l1-5L15 5l4 4L9 19zM13 7l4 4',
    ruler: 'M3 17L17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2',
    circle: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  };
  // 속을 칠하는 아이콘 (선만으로는 작게 보일 때)
  var FILL = { star_on: 'star', play: 'play', stop: 'stop' };

  function svg(name, opts) {
    var fillName = FILL[name] && name !== 'play' && name !== 'stop' ? FILL[name] : null;
    var key = fillName || name;
    var d = P[key];
    if (!d) return '';
    var filled = !!fillName || name === 'play' || name === 'stop';
    var label = opts && opts.label;
    return '<svg class="ic ic-' + name + '" viewBox="0 0 24 24" width="1.15em" height="1.15em" style="vertical-align:-0.2em;flex:none" fill="' + (filled ? 'currentColor' : 'none') +
      '" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"' +
      (label ? ' role="img" aria-label="' + String(label).replace(/"/g, '&quot;') + '"' : ' aria-hidden="true" focusable="false"') +
      '><path d="' + d + '"/></svg>';
  }
  function has(name) { return !!(P[name] || FILL[name]); }
  // <i class="ic" data-ic="이름"></i> → SVG
  function hydrate(root) {
    if (typeof document === 'undefined') return 0;
    var n = 0;
    (root || document).querySelectorAll('[data-ic]').forEach(function (el) {
      if (el.__ic) return;
      var h = svg(el.getAttribute('data-ic'));
      if (!h) return;
      el.insertAdjacentHTML('afterbegin', h); el.__ic = true; n++;
    });
    return n;
  }
  if (typeof document !== 'undefined') {
    var start = function () {
      hydrate();
      // 코드가 나중에 넣는 조각(innerHTML)의 <i data-ic> 도 바로 그린다
      if (typeof MutationObserver === 'function') {
        new MutationObserver(function (list) {
          for (var i = 0; i < list.length; i++) {
            var added = list[i].addedNodes;
            for (var j = 0; j < added.length; j++) {
              var nd = added[j];
              if (nd.nodeType !== 1) continue;
              if (nd.hasAttribute('data-ic') || nd.querySelector('[data-ic]')) hydrate(nd.parentNode || nd);
            }
          }
        }).observe(document.documentElement, { childList: true, subtree: true });
      }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }
  global.Icons = { svg: svg, has: has, hydrate: hydrate, names: Object.keys(P).concat(Object.keys(FILL)) };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports) module.exports = (typeof window !== 'undefined' ? window : globalThis).Icons;
