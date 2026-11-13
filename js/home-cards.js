/* 첫 화면 사이드바 카드 — '개통하면 가장 많이 오르는 역' TOP 3 + '지금 커뮤니티에서' (뮤즈 5-②·5-⑥, 시안 C, 2026-11-13)
 *
 * TOP 3: data/rank-top.json (data/build_rank.js 가 만드는 약 0.5KB) — rank.json(약 470KB)을 첫 화면에서 받지 않으려고.
 *        누르면 떡상 패널에서 그 역을 연다. 부제로 '교통 접근성 순위 · 집값 예측 아님'.
 * 커뮤니티: 게시판(Supabase, js/board.js KrBoard)이 켜져 있을 때 최근 글 2개. 글은 textContent 로만 넣는다.
 * 둘 다 브라우저가 한가할 때 받는다(첫 화면 속도에 영향 없게). 실패하면 그 칸만 조용히 숨긴다.
 */
(function (global) {
  'use strict';

  function ago(iso) {
    var t = Date.parse(iso); if (!t) return '';
    var m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return '방금'; if (m < 60) return m + '분 전';
    var h = Math.round(m / 60); if (h < 24) return h + '시간 전';
    return Math.round(h / 24) + '일 전';
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function css() {
    if (document.getElementById('hc-style')) return;
    var s = document.createElement('style'); s.id = 'hc-style';
    s.textContent =
      '.hc-sec{margin:4px 0 10px}' +
      '.hc-head{display:flex;align-items:baseline;gap:6px;margin:8px 0 4px}.hc-head b{font-size:var(--fs-sm)}' +
      '.hc-head a,.hc-head button{margin-left:auto;font:inherit;font-size:var(--fs-xs);color:var(--accent);background:none;border:0;cursor:pointer;text-decoration:none;padding:2px 0}' +
      '.hc-sub{font-size:var(--fs-xs);color:var(--muted);margin:0 0 4px}' +
      '.hc-top{list-style:none;margin:0;padding:0}' +
      '.hc-top button{display:flex;align-items:center;gap:10px;width:100%;padding:7px 4px;border:0;border-bottom:1px solid var(--border);background:none;color:var(--text);font:inherit;text-align:left;cursor:pointer;border-radius:0}' +
      '.hc-top button:hover{background:var(--hover)}' +
      '.hc-n{flex:none;width:16px;font-weight:800;color:var(--muted);font-size:var(--fs-sm)}' +
      '.hc-nm{display:block;font-weight:700;font-size:var(--fs-sm)}.hc-ln{display:block;font-size:var(--fs-xs);color:var(--muted)}' +
      '.hc-ln i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px;vertical-align:0}' +
      '.hc-up{margin-left:auto;font-weight:800;color:var(--rk-up);font-size:var(--fs-sm)}' +
      '.hc-post{display:block;padding:7px 4px;border-bottom:1px solid var(--border);color:var(--text);text-decoration:none}' +
      '.hc-post:hover{background:var(--hover)}' +
      '.hc-tag{display:inline-block;font-size:var(--fs-xs);font-weight:700;color:var(--accent);background:var(--accent-weak);border-radius:6px;padding:0 6px;margin-bottom:2px}' +
      '.hc-body{display:block;font-size:var(--fs-sm);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.hc-meta{display:block;font-size:var(--fs-xs);color:var(--muted)}';
    document.head.appendChild(s);
  }

  function renderTop(box, d) {
    if (!d || !d.top || !d.top.length) return;
    var sec = el('div', 'hc-sec hc-rank');
    var head = el('div', 'hc-head'); head.appendChild(el('b', null, '개통하면 가장 많이 오르는 역'));
    var all = el('button', null, '전체 →'); all.type = 'button'; all.setAttribute('data-rocket-open', '');
    all.addEventListener('click', function () { if (global.RocketPanel && RocketPanel.open) RocketPanel.open({}); });
    head.appendChild(all); sec.appendChild(head);
    sec.appendChild(el('p', 'hc-sub', (d.year === 'all' ? '모든 계획 노선' : d.year + '년까지') + ' 개통 가정 · 수도권 ' + (d.total || '') + '역 교통 접근성 순위 · ▲ = 오르는 순위 칸 수 · 집값 예측 아님'));
    var ol = el('ol', 'hc-top');
    d.top.forEach(function (t, i) {
      var li = el('li'), b = el('button'); b.type = 'button';
      b.setAttribute('aria-label', (i + 1) + '위 ' + t.n + ' — 순위 ' + t.now + '위에서 ' + t.aft + '위로 ' + t.ch + '계단 오름');
      b.appendChild(el('span', 'hc-n', String(i + 1)));
      var mid = el('span'); mid.appendChild(el('span', 'hc-nm', t.n));
      var ln = el('span', 'hc-ln'); var dot = el('i'); dot.style.background = /^#[0-9a-f]{6}$/i.test(t.c || '') ? t.c : '#888'; ln.appendChild(dot);
      ln.appendChild(document.createTextNode((t.line || '') + (t.y ? ' · ' + t.y : ''))); mid.appendChild(ln); b.appendChild(mid);
      b.appendChild(el('span', 'hc-up', '▲' + t.ch + '위'));   // 단위 — 오르는 순위 칸 수 (4차 N6)
      b.addEventListener('click', function () { if (global.RocketPanel && RocketPanel.open) RocketPanel.open({ st: t.id, focus: true }); });
      li.appendChild(b); ol.appendChild(li);
    });
    sec.appendChild(ol);
    box.appendChild(sec);
  }

  function renderFeed(box, posts) {
    if (!posts || !posts.length) return;
    var sec = el('div', 'hc-sec hc-feed');
    var head = el('div', 'hc-head'); head.appendChild(el('b', null, '지금 커뮤니티에서'));
    var more = el('a', null, '더 보기 →'); more.href = 'board.html'; head.appendChild(more); sec.appendChild(head);
    var KIND = { free: '자유', station: '우리 역', dev: '의견' };
    posts.slice(0, 2).forEach(function (p) {
      var a = el('a', 'hc-post'); a.href = 'board.html#' + encodeURIComponent(p.id || '');
      var st = (p.station || '').split('·')[0];
      a.appendChild(el('span', 'hc-tag', st || KIND[p.kind] || '글'));
      a.appendChild(el('span', 'hc-body', String(p.body || '').replace(/\s+/g, ' ').slice(0, 80)));
      a.appendChild(el('span', 'hc-meta', (p.nick || '익명') + ' · ' + ago(p.created_at)));
      sec.appendChild(a);
    });
    box.appendChild(sec);
  }

  function load() {
    var box = document.getElementById('home-cards');
    if (!box || box.dataset.loaded) return;
    box.dataset.loaded = '1';
    css();
    fetch('data/rank-top.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      renderTop(box, d);
      // 커뮤니티 칸은 TOP 3 아래에 (게시판이 켜져 있을 때만)
      var B = typeof KrBoard !== 'undefined' ? KrBoard : null;
      if (B && B.ready && B.ready() && B.list) return B.list({ limit: 2 }).then(function (posts) { renderFeed(box, (posts || []).filter(function (p) { return !(p.reports >= 3); })); });
    }).catch(function () { /* 카드만 안 보인다 */ });
  }

  function init() {
    var go = function () { load(); };
    if (typeof global.requestIdleCallback === 'function') global.requestIdleCallback(go, { timeout: 4000 }); else setTimeout(go, 1500);
  }

  global.HomeCards = { init: init, load: load, _render: { top: renderTop, feed: renderFeed } };
})(typeof window !== 'undefined' ? window : globalThis);
