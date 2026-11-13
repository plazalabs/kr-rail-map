/* RAIL MARKET MAP — 역 타일 지도 (2026-11-13, 회장님 확정 기능 · 외부 기획서 2건 반영)
 *
 * 떡상 랭킹(data/rank.json · js/rank.js RankTable)을 주식 히트맵처럼 역 타일로 한눈에 본다.
 *   묶기  : 새 노선(GTX-A·B·C…) / 시군구
 *   크기  : 모두 같게 / 거래 건수(투자 모드 — 역이 속한 법정동 아파트 매매, js/price.js)
 *   색    : 개선 분(지금 → 개통 후, 업무지구 가중 평균) / 순위 변화 등급(떡상·상승·보합·상대 하락·신규)
 *   연도  : 그해까지 개통한다고 가정한 노선만 (rank.json years)
 * 타일을 누르면 지도가 그 역으로 가고 역 상세가 열린다. 지도에서 역을 열면 타일도 고른다(양방향).
 *
 * 원칙 (기획서 §0·§8, 68점 감사 9번)
 *   - 접근성 순위는 집값 예측이 아니다 — 부제로 고정한다.
 *   - 색 구간은 고정(분위수 아님) — 같은 값은 언제나 같은 색. 자료 없음은 0 과 다른 빗금 회색.
 *   - 시세 크기는 투자 모드에서만, 법정동·기간·건수를 같이 적는다. 5건 미만은 '거래 적음'.
 *
 * 계산(Logic)은 DOM 없이 node 로 시험한다 (tests/market-map.test.js).
 */
(function (global) {
  'use strict';

  /* ---------------- 계산 ---------------- */
  var Logic = (function () {
    // 새 노선 묶음 — 같은 노선의 갈래는 하나로 (GTX-A 서울역~수서·창릉·평택 → GTX-A)
    var FAMILY = [
      [/^great-train-express-line-a|^gtx-a/, 'GTX-A'],
      [/^gtx-b/, 'GTX-B'],
      [/^gtx-c/, 'GTX-C'],
      [/^gtx-d/, 'GTX-D'],
      [/^gtx-e/, 'GTX-E'],
      [/^gtx-f/, 'GTX-F'],
      [/^gtx-g/, 'GTX-G'],
      [/^gtx-h/, 'GTX-H'],
    ];
    var OTHER_NEW = '그 밖의 새 노선', NO_NEW = '환승으로 빨라지는 역', NONE = '변화 없음';

    function familyOf(lineId, lines) {
      for (var i = 0; i < FAMILY.length; i++) if (FAMILY[i][0].test(lineId)) return FAMILY[i][1];
      var m = lines && lines[lineId];
      return m && m.n ? m.n : lineId;
    }
    function isNewLine(lineId, lines) {
      var m = lines && lines[lineId];
      return !!(m && m.s && m.s !== 'open');
    }

    // 개선 분 = 지금 가중 평균 분 − 개통 후. 지금 못 가는 역은 null(신규).
    function gainOf(row) {
      if (!row || row.isNew || row.now.min == null || row.aft.min == null) return null;
      return Math.round((row.now.min - row.aft.min) * 10) / 10;
    }

    // 고정 구간 (분위수 아님 — 화면이 바뀌어도 같은 값은 같은 색)
    var GAIN_BINS = [
      { max: 0, key: 'g0', label: '0분', bg: '#d5d9de', fg: '#2b3036' },
      { max: 4.99, key: 'g1', label: '~5분', bg: '#d6eedd', fg: '#17351f' },
      { max: 9.99, key: 'g2', label: '5~10분', bg: '#9fd6b2', fg: '#10301c' },
      { max: 19.99, key: 'g3', label: '10~20분', bg: '#4fb07a', fg: '#0b2a17' },
      { max: 29.99, key: 'g4', label: '20~30분', bg: '#1a7a48', fg: '#ffffff' },
      { max: Infinity, key: 'g5', label: '30분+', bg: '#0b5e36', fg: '#ffffff' },
    ];
    var TIER_COLORS = {
      rocket: { bg: '#0a8f4a', fg: '#04140a' }, up: { bg: '#3aa76d', fg: '#04140a' },
      flat: { bg: '#9aa1a8', fg: '#14181c' }, down: { bg: '#d9701a', fg: '#14181c' }, new: { bg: '#7a3fd0', fg: '#ffffff' },
    };
    var NEW_COLOR = { key: 'new', label: '신규(지금은 못 감)', bg: '#7a3fd0', fg: '#ffffff' };
    var NA_COLOR = { key: 'na', label: '자료 없음', bg: '#eceef1', fg: '#5b6470', hatch: true };

    function colorOf(row, mode, tierOf) {
      if (mode === 'tier') {
        var t = tierOf ? tierOf(row) : (row.isNew ? 'new' : 'flat');
        var c = TIER_COLORS[t] || TIER_COLORS.flat;
        return { key: t, bg: c.bg, fg: c.fg };
      }
      if (row.isNew) return NEW_COLOR;
      var g = gainOf(row);
      if (g == null) return NA_COLOR;
      for (var i = 0; i < GAIN_BINS.length; i++) if (g <= GAIN_BINS[i].max) return GAIN_BINS[i];
      return GAIN_BINS[GAIN_BINS.length - 1];
    }

    // 묶기
    //  line : 그 역에 서는 새 노선(첫 번째 — GTX 를 먼저). 새 노선이 없는데 빨라지면 '환승으로 빨라지는 역', 그대로면 '변화 없음'
    //  sgg  : 시군구
    function groupOf(row, by, lines) {
      if (by === 'sgg') return row.sgg || row.region || '기타';
      var news = (row.lines || []).filter(function (l) { return isNewLine(l, lines); });
      if (news.length) {
        var fams = news.map(function (l) { return familyOf(l, lines); });
        for (var i = 0; i < FAMILY.length; i++) if (fams.indexOf(FAMILY[i][1]) >= 0) return FAMILY[i][1];
        return OTHER_NEW;
      }
      var g = gainOf(row);
      return g != null && g > 0 ? NO_NEW : NONE;
    }

    // squarified treemap (Bruls·Huizing·van Wijk 2000). items: [{v}], 반환: 같은 순서로 {x,y,w,h}
    function squarify(values, x, y, w, h) {
      var n = values.length, out = new Array(n);
      if (!n) return out;
      var total = 0; for (var i = 0; i < n; i++) total += Math.max(0, values[i]);
      if (!(total > 0) || w <= 0 || h <= 0) { for (var j = 0; j < n; j++) out[j] = { x: x, y: y, w: 0, h: 0 }; return out; }
      var idx = values.map(function (v, k) { return k; }).sort(function (a, b) { return values[b] - values[a]; });
      var scale = (w * h) / total;
      var areas = idx.map(function (k) { return Math.max(0, values[k]) * scale; });
      var rx = x, ry = y, rw = w, rh = h, start = 0;
      function worst(s, e, side) {
        var sum = 0, mx = 0, mn = Infinity;
        for (var q = s; q < e; q++) { sum += areas[q]; if (areas[q] > mx) mx = areas[q]; if (areas[q] < mn) mn = areas[q]; }
        if (sum <= 0) return Infinity;
        var s2 = sum * sum, sd2 = side * side;
        return Math.max((sd2 * mx) / s2, s2 / (sd2 * (mn || 1e-9)));
      }
      while (start < n) {
        var side = Math.min(rw, rh), end = start + 1;
        while (end < n && worst(start, end + 1, side) <= worst(start, end, side)) end++;
        var sum = 0; for (var q = start; q < end; q++) sum += areas[q];
        if (rw >= rh) {   // 왼쪽에 세로 줄
          var cw = rh > 0 ? sum / rh : 0, cy = ry;
          for (var a = start; a < end; a++) { var hh = cw > 0 ? areas[a] / cw : 0; out[idx[a]] = { x: rx, y: cy, w: cw, h: hh }; cy += hh; }
          rx += cw; rw -= cw;
        } else {           // 위에 가로 줄
          var ch = rw > 0 ? sum / rw : 0, cx = rx;
          for (var b = start; b < end; b++) { var ww = ch > 0 ? areas[b] / ch : 0; out[idx[b]] = { x: cx, y: ry, w: ww, h: ch }; cx += ww; }
          ry += ch; rh -= ch;
        }
        start = end;
      }
      return out;
    }

    /* 모델 만들기
     *   rows   : RankTable.compute(doc, …).rows
     *   opts   : { group:'line'|'sgg', size:'equal'|'deals', color:'gain'|'tier', scope:'new'|'affected'|'all', sizeOf(id) }
     *   scope new = 새 노선이 서는 역만(기본 — 타일이 커서 역 이름이 보인다), affected = 빨라지는 역 모두, all = 전체
     * 반환: { groups:[{name, value, tiles:[{row, v, color, gain}]}], total } — 큰 묶음 먼저 */
    function build(rows, lines, opts, tierOf) {
      opts = opts || {};
      var by = opts.group || 'line', scope = opts.scope || 'new';
      var map = new Map();
      rows.forEach(function (r) {
        var g = groupOf(r, by, lines);
        var lg = by === 'line' ? g : groupOf(r, 'line', lines);
        if (scope === 'new' && (lg === NONE || lg === NO_NEW)) return;
        if (scope === 'affected' && lg === NONE) return;
        var sv = opts.size === 'deals' && opts.sizeOf ? opts.sizeOf(r.id) : null;
        var v = opts.size === 'deals' ? (sv && sv > 0 ? sv : 1) : 1;
        var t = { row: r, v: v, color: colorOf(r, opts.color, tierOf), gain: gainOf(r), sizeMissing: opts.size === 'deals' && !(sv > 0) };
        if (!map.has(g)) map.set(g, { name: g, value: 0, tiles: [] });
        var G = map.get(g); G.tiles.push(t); G.value += v;
      });
      var order = FAMILY.map(function (f) { return f[1]; }).concat([OTHER_NEW, NO_NEW, NONE]);
      var groups = Array.from(map.values());
      groups.forEach(function (G) { G.tiles.sort(function (a, b) { return b.v - a.v || ((b.gain || 0) - (a.gain || 0)) || (a.row.aft.rank - b.row.aft.rank); }); });
      groups.sort(function (a, b) {
        if (by === 'line') { var ia = order.indexOf(a.name), ib = order.indexOf(b.name); if (ia !== ib) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); }
        return b.value - a.value || (a.name < b.name ? -1 : 1);
      });
      var total = groups.reduce(function (s, G) { return s + G.tiles.length; }, 0);
      return { groups: groups, total: total };
    }

    // 묶음 배치 + 타일 배치를 한 번에. head: 묶음 이름 줄 높이(px)
    function layout(model, W, H, head) {
      head = head == null ? 18 : head;
      var gr = squarify(model.groups.map(function (G) { return G.value; }), 0, 0, W, H);
      model.groups.forEach(function (G, i) {
        var r = gr[i]; G.rect = r;
        var inner = { x: r.x + 1, y: r.y + head, w: Math.max(0, r.w - 2), h: Math.max(0, r.h - head - 1) };
        var tr = squarify(G.tiles.map(function (t) { return t.v; }), inner.x, inner.y, inner.w, inner.h);
        G.tiles.forEach(function (t, k) { t.rect = tr[k]; });
      });
      return model;
    }

    return { FAMILY: FAMILY, GAIN_BINS: GAIN_BINS, TIER_COLORS: TIER_COLORS, NEW_COLOR: NEW_COLOR, NA_COLOR: NA_COLOR,
      OTHER_NEW: OTHER_NEW, NO_NEW: NO_NEW, NONE: NONE,
      familyOf: familyOf, isNewLine: isNewLine, gainOf: gainOf, colorOf: colorOf, groupOf: groupOf, squarify: squarify, build: build, layout: layout };
  })();

  if (typeof document === 'undefined') { global.MarketMap = { Logic: Logic }; return; }

  /* ---------------- 화면 ---------------- */
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var WLABEL = { avg: '평균', cbd: '도심', ybd: '여의도', gbd: '강남' };
  var st = { w: 'avg', y: 'all', group: 'line', size: 'equal', color: 'gain', scope: 'new', sel: null, tab: 'tiles' };
  var el = null, isOpen = false, model = null, doc = null, rowsById = new Map(), tileById = new Map(), opener = null;

  // rank.js 는 'const RankTable' 로 선언돼 window 에 안 붙는다 — 이름으로 직접 찾는다
  function RTab() { return typeof RankTable !== 'undefined' ? RankTable : global.RankTable; }
  function invest() { return typeof KR_MODE === 'undefined' || (KR_MODE.isInvest && KR_MODE.isInvest()); }
  function track(name, data) { try { if (global.KRTrack) global.KRTrack(name, data); } catch (e) { /* 통계 실패는 무시 */ } }
  function isMobile() { return global.matchMedia ? global.matchMedia('(max-width: 768px)').matches : false; }

  function css() {
    if (document.getElementById('mm-style')) return;
    var s = document.createElement('style'); s.id = 'mm-style';
    s.textContent =
      '#mm-panel{position:fixed;z-index:950;left:12px;top:64px;bottom:12px;width:min(620px,calc(100vw - 420px));min-width:360px;display:flex;flex-direction:column;' +
      'background:var(--panel-bg,#fff);color:var(--text,#222);border:1px solid var(--border,#dfe3e8);border-radius:14px;box-shadow:0 10px 32px rgba(0,0,0,.18);overflow:hidden}' +
      '#mm-panel[hidden]{display:none}' +
      '.mm-head{display:flex;align-items:flex-start;gap:8px;padding:12px 14px 6px}' +
      '.mm-head h2{margin:0;font-size:var(--fs-lg);font-weight:800;letter-spacing:-.02em}' +
      '.mm-eyebrow{margin:0;font-size:var(--fs-xs);font-weight:700;color:var(--accent,#1565c0)}' +
      '.mm-def{margin:2px 0 0;font-size:var(--fs-xs);color:var(--muted,#5b6470);line-height:1.45}' +
      '.mm-link{margin-left:auto;border:0;background:none;color:var(--muted,#5b6470);cursor:pointer;padding:4px 6px;border-radius:6px}' +
      '.mm-close{border:0;background:none;color:var(--muted,#5b6470);font-size:var(--fs-xl);cursor:pointer;padding:2px 6px;border-radius:6px}' +
      '.mm-ctrl{display:flex;flex-wrap:wrap;gap:6px 10px;padding:4px 14px 6px;font-size:var(--fs-xs);align-items:center}' +
      '.mm-ctrl label{display:inline-flex;gap:4px;align-items:center;color:var(--muted,#5b6470)}' +
      '.mm-ctrl select{font:inherit;font-size:var(--fs-xs);padding:3px 4px;border:1px solid var(--border,#ccd);border-radius:6px;background:var(--panel-bg,#fff);color:var(--text,#222)}' +
      '.mm-years{display:flex;flex-wrap:wrap;gap:4px;padding:0 14px 6px}' +
      '.mm-years button,.mm-tabs button{font:inherit;font-size:var(--fs-xs);padding:3px 9px;border-radius:999px;border:1px solid var(--border,#ccd);background:var(--panel-bg,#fff);color:var(--text,#222);cursor:pointer}' +
      '.mm-years button[aria-pressed="true"],.mm-tabs button[aria-selected="true"]{background:var(--accent,#1565c0);border-color:var(--accent,#1565c0);color:#fff;font-weight:700}' +
      '.mm-legend{display:flex;flex-wrap:wrap;gap:3px 9px;padding:0 14px 6px;font-size:var(--fs-xs);color:var(--muted,#5b6470)}' +
      '.mm-legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:3px;vertical-align:-1px}' +
      '.mm-board{position:relative;flex:1 1 auto;min-height:200px;margin:0 10px 8px;overflow:hidden}' +
      '.mm-group{position:absolute;box-sizing:border-box;border:1px solid var(--border,#cfd5dc);border-radius:4px;background:var(--surface,#f6f7f9)}' +
      '.mm-gname{position:absolute;left:4px;top:1px;right:4px;font-size:var(--fs-xs);font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text,#222)}' +
      '.mm-tile{position:absolute;box-sizing:border-box;border:1px solid rgba(255,255,255,.75);border-radius:2px;overflow:hidden;cursor:pointer;padding:2px 3px;' +
      'font-size:var(--fs-xs);line-height:1.2;text-align:left;font-family:inherit}' +
      '.mm-tile:focus-visible{outline:3px solid var(--accent,#1565c0);outline-offset:-3px;z-index:2}' +
      '.mm-tile.na{background-image:repeating-linear-gradient(45deg,transparent 0 4px,rgba(0,0,0,.06) 4px 8px)}' +
      '.mm-tile.few{border-style:dashed;border-color:rgba(0,0,0,.45)}' +
      '.mm-tile.sel{box-shadow:inset 0 0 0 3px #111;z-index:3}' +
      '.mm-tile b{display:block;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.mm-tile span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.92}' +
      '.mm-card{border-top:1px solid var(--border,#e3e6ea);padding:8px 14px 10px;font-size:var(--fs-sm);line-height:1.5;max-height:42%;overflow:auto}' +
      '.mm-card h3{margin:0 0 2px;font-size:var(--fs-md)}' +
      '.mm-card .mm-src{font-size:var(--fs-xs);color:var(--muted,#5b6470)}' +
      '.mm-card table{border-collapse:collapse;font-size:var(--fs-xs);margin:4px 0}' +
      '.mm-card td,.mm-card th{padding:1px 8px 1px 0;text-align:left;font-weight:normal}' +
      '.mm-card .mm-acts{display:flex;gap:6px;margin-top:4px;flex-wrap:wrap}' +
      '.mm-card .mm-acts button{font:inherit;font-size:var(--fs-xs);padding:4px 10px;border-radius:8px;border:1px solid var(--border,#ccd);background:var(--panel-bg,#fff);color:var(--text,#222);cursor:pointer}' +
      '.mm-tabs{display:none;gap:6px;padding:0 14px 6px}' +
      '.mm-opts>summary{cursor:pointer;padding:2px 14px 6px;font-size:var(--fs-xs);font-weight:700;color:var(--accent,#1565c0);list-style:revert}' +
      '.mm-sum{font-weight:normal;color:var(--muted,#5b6470)}' +
      '.mm-empty{padding:24px;text-align:center;color:var(--muted,#5b6470);font-size:var(--fs-sm)}' +
      '#mm-return{position:fixed;z-index:940;left:50%;transform:translateX(-50%);bottom:calc(76px + env(safe-area-inset-bottom,0px));border:0;border-radius:999px;padding:9px 16px;' +
      'background:var(--accent,#1565c0);color:#fff;font:inherit;font-size:var(--fs-sm);font-weight:700;box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer}' +
      '#mm-return[hidden]{display:none}' +
      '@media (max-width:768px){#mm-panel{left:0;right:0;top:auto;bottom:0;width:auto;min-width:0;height:min(78vh,640px);border-radius:16px 16px 0 0}' +
      '.mm-tabs{display:flex}.mm-head h2{font-size:var(--fs-md)}.mm-def{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}#mm-panel[data-tab="card"] .mm-board,#mm-panel[data-tab="card"] .mm-legend,#mm-panel[data-tab="card"] .mm-years,#mm-panel[data-tab="card"] .mm-ctrl{display:none}' +
      '#mm-panel[data-tab="tiles"] .mm-card{display:none}#mm-panel[data-tab="card"] .mm-card{max-height:none;flex:1 1 auto;border-top:0}}';
    document.head.appendChild(s);
  }

  function build() {
    if (el) return;
    css();
    el = document.createElement('div');
    el.id = 'mm-panel';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'RAIL MARKET MAP 역 타일');
    el.innerHTML =
      '<div class="mm-head"><div><p class="mm-eyebrow">RAIL MARKET MAP · 수도권 <span class="mm-n"></span>역</p>' +
      '<h2>개통하면 어느 역이 얼마나 빨라지나</h2>' +
      '<p class="mm-def">업무지구까지 걸리는 시간(열차 대기 뺌)으로 본 <b>교통 접근성</b>입니다 · 집값이나 투자수익 예측이 아닙니다</p></div>' +
      '<button class="mm-link" type="button" aria-label="지금 보는 조건으로 링크 복사" title="지금 보는 조건(연도·기준·색·묶기·고른 역)으로 링크 복사"><i data-ic="link"></i></button>' +
      '<button class="mm-close" type="button" aria-label="타일 지도 닫기"><i data-ic="close"></i></button></div>' +
      '<div class="mm-tabs" role="tablist" aria-label="보기"><button type="button" role="tab" data-tab="map">지도</button>' +
      '<button type="button" role="tab" data-tab="tiles">타일</button><button type="button" role="tab" data-tab="card">분석</button></div>' +
      '<details class="mm-opts" open><summary>보기 설정 <span class="mm-sum"></span></summary>' +
      '<div class="mm-ctrl">' +
        '<label>묶기 <select data-k="group"><option value="line">새 노선</option><option value="sgg">시군구</option></select></label>' +
        '<label>색 <select data-k="color"><option value="gain">빨라지는 분</option><option value="tier">순위 변화</option></select></label>' +
        '<label>크기 <select data-k="size"><option value="equal">모두 같게</option><option value="deals">아파트 거래 건수 (투자 모드)</option></select></label>' +
        '<label>기준 <select data-k="w"><option value="avg">평균</option><option value="cbd">도심</option><option value="ybd">여의도</option><option value="gbd">강남</option></select></label>' +
        '<label>역 <select data-k="scope"><option value="new">새 노선이 서는 역</option><option value="affected">빨라지는 역 모두</option><option value="all">수도권 전체</option></select></label>' +
      '</div>' +
      '<div class="mm-years" role="group" aria-label="이 해까지 개통한다고 가정"></div>' +
      '<div class="mm-legend" aria-label="색 뜻"></div></details>' +
      '<div class="mm-board" role="grid" aria-label="역 타일"></div>' +
      '<div class="mm-card" aria-live="polite"></div>';
    document.body.appendChild(el);
    var back = document.createElement('button');
    back.id = 'mm-return'; back.type = 'button'; back.hidden = true; back.textContent = '타일로 돌아가기';
    back.addEventListener('click', function () { setTab('tiles'); });
    document.body.appendChild(back);

    el.querySelector('.mm-close').addEventListener('click', close);
    el.querySelector('.mm-link').addEventListener('click', function () {
      var url = location.origin + location.pathname + linkQuery() + location.hash;
      var done = function () { note('타일 지도 링크를 복사했습니다 — 같은 조건으로 열립니다'); track('market_map_share'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { note('주소: ' + url); }); else note('주소: ' + url);
    });
    el.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    el.querySelectorAll('.mm-ctrl select').forEach(function (s) {
      s.addEventListener('change', function () {
        st[s.dataset.k] = s.value;
        if (s.dataset.k === 'size' && s.value === 'deals' && !invest()) {
          st.size = 'equal'; s.value = 'equal';
          note('거래 건수 크기는 투자 모드에서만 씁니다 (시세는 투자 모드 자료)');
        }
        if (s.dataset.k === 'size' && st.size === 'deals') ensurePrice();
        track('market_map_filter_change', { 종류: s.dataset.k });
        render();
      });
    });
    el.querySelector('.mm-tabs').addEventListener('click', function (e) { var b = e.target.closest('button[data-tab]'); if (b) setTab(b.dataset.tab); });
    var board = el.querySelector('.mm-board');
    board.addEventListener('click', function (e) { var t = e.target.closest('.mm-tile'); if (t) pick(t.dataset.id, { fromTile: true }); });
    board.addEventListener('keydown', function (e) {
      var t = e.target.closest && e.target.closest('.mm-tile'); if (!t) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(t.dataset.id, { fromTile: true }); return; }
      var dir = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[e.key];
      if (!dir) return;
      e.preventDefault();
      var r = t.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, best = null;
      board.querySelectorAll('.mm-tile').forEach(function (o) {
        if (o === t) return; var q = o.getBoundingClientRect(), ox = q.left + q.width / 2, oy = q.top + q.height / 2;
        var dx = ox - cx, dy = oy - cy; if (dx * dir[0] + dy * dir[1] <= 0) return;
        var d = Math.abs(dx * dir[0] + dy * dir[1]) + 2 * Math.abs(dx * dir[1] + dy * dir[0]);
        if (!best || d < best.d) best = { o: o, d: d };
      });
      if (best) best.o.focus();
    });
    if (global.ResizeObserver) new ResizeObserver(function () { if (isOpen && st.tab !== 'card') draw(); }).observe(board);
  }

  // 링크: ?market=1&y=&w=&c=&g=&s=&st= — 모르는 값은 무시(기본값)
  var ALLOWED = { w: ['avg', 'cbd', 'ybd', 'gbd'], color: ['gain', 'tier'], group: ['line', 'sgg'], scope: ['new', 'affected', 'all'] };
  function linkQuery() {
    return '?market=1&y=' + encodeURIComponent(st.y) + '&w=' + st.w + '&c=' + st.color + '&g=' + st.group + '&s=' + st.scope + (st.sel ? '&st=' + encodeURIComponent(st.sel) : '');
  }
  function note(msg) { var s = document.getElementById('status'); if (s) s.textContent = msg; }

  function ensurePrice() {
    if (typeof StationPrice === 'undefined' || StationPrice.isReady()) return;
    if (typeof global.loadDetailData === 'function') { try { global.loadDetailData(); } catch (e) { /* 무시 */ } }
    var tries = 0, iv = setInterval(function () { tries++; if (StationPrice.isReady() || tries > 40) { clearInterval(iv); if (isOpen) render(); } }, 250);
  }

  function setTab(tab) {
    st.tab = tab;
    var back = document.getElementById('mm-return');
    if (tab === 'map') { el.hidden = true; if (back) back.hidden = false; return; }
    el.hidden = false; if (back) back.hidden = true;
    el.dataset.tab = tab;
    el.querySelectorAll('.mm-tabs button').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.tab === tab ? 'true' : 'false'); });
    if (tab === 'tiles') draw();
  }

  function compute() {
    var RT = RTab();
    if (st.y !== 'all' && (doc.years || []).map(String).indexOf(String(st.y)) < 0) st.y = 'all';
    var out = RT.compute(doc, { weight: st.w, region: 'capital', at: st.y });
    rowsById = new Map(out.rows.map(function (r) { return [r.id, r]; }));
    var sizeOf = function (id) { if (typeof StationPrice === 'undefined' || !StationPrice.isReady()) return null; var p = StationPrice.of(id); return p ? p.deals : null; };
    model = Logic.build(out.rows, doc.lines, { group: st.group, size: st.size, color: st.color, scope: st.scope, sizeOf: sizeOf }, RT.tierOf);
    el.querySelector('.mm-n').textContent = out.total;
  }

  function renderYears() {
    var box = el.querySelector('.mm-years');
    var ys = ['all'].concat(doc.years || []);
    box.innerHTML = '<span class="mm-def" style="margin:0 4px 0 0">그해까지 개통한다고 가정:</span>' + ys.map(function (y) {
      return '<button type="button" data-y="' + y + '" aria-pressed="' + (String(st.y) === String(y)) + '">' + (y === 'all' ? '전체(시기 미정 포함)' : y + '년') + '</button>';
    }).join('');
    box.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () { st.y = b.dataset.y; track('market_map_filter_change', { 종류: '연도' }); render(); });
    });
  }

  function renderLegend() {
    var box = el.querySelector('.mm-legend'), items;
    if (st.color === 'tier') {
      var T = RTab().TIERS;
      items = ['rocket', 'up', 'flat', 'down', 'new'].map(function (k) { return [Logic.TIER_COLORS[k].bg, T[k].label + ' (' + T[k].hint + ')']; });
    } else {
      items = Logic.GAIN_BINS.map(function (b) { return [b.bg, b.label]; }).concat([[Logic.NEW_COLOR.bg, Logic.NEW_COLOR.label], [Logic.NA_COLOR.bg, '자료 없음(빗금)']]);
    }
    var sz = st.size === 'deals' ? ' · 크기 = 역이 속한 법정동 아파트 매매 건수(최근 6개월), 점선 = 거래 5건 미만·자료 없음' : ' · 크기 = 모두 같음';
    box.innerHTML = items.map(function (x) { return '<span><i style="background:' + x[0] + '"></i>' + esc(x[1]) + '</span>'; }).join('') +
      '<span>' + esc((st.color === 'tier' ? '순위 변화 = 지금 순위 → 개통 후 순위' : '빨라지는 분 = 지금 → 개통 후, ' + WLABEL[st.w] + ' 기준') + sz) + '</span>';
  }

  function draw() {
    if (!model) return;
    var board = el.querySelector('.mm-board');
    var W = board.clientWidth, H = board.clientHeight;
    if (W < 40 || H < 40) return;
    if (!model.total) { board.innerHTML = '<div class="mm-empty">이 조건에 맞는 역이 없습니다</div>'; return; }
    Logic.layout(model, W, H, 18);
    var html = '';
    tileById = new Map();
    model.groups.forEach(function (G) {
      var r = G.rect; if (!r || r.w < 2 || r.h < 2) return;
      html += '<div class="mm-group" style="left:' + r.x + 'px;top:' + r.y + 'px;width:' + r.w + 'px;height:' + r.h + 'px">' +
        '<div class="mm-gname" title="' + esc(G.name) + ' · ' + G.tiles.length + '역">' + esc(G.name) + ' · ' + G.tiles.length + '</div></div>';
      G.tiles.forEach(function (t) {
        var q = t.rect; if (!q || q.w < 1 || q.h < 1) return;
        var row = t.row, val = t.gain == null ? (row.isNew ? '신규' : '—') : (t.gain > 0 ? '−' + t.gain + '분' : '0분');
        var lab = row.name + ' · ' + (row.isNew ? '지금은 철도로 못 감' : '지금 ' + row.now.min + '분 → 개통 후 ' + row.aft.min + '분') +
          (row.change != null ? ' · 순위 ' + row.now.rank + '→' + row.aft.rank + '위' : '');
        var cls = 'mm-tile' + (t.color.hatch ? ' na' : '') + (t.sizeMissing ? ' few' : '') + (st.sel === row.id ? ' sel' : '');
        var inner = (q.w > 27 && q.h > 15) ? '<b>' + esc(row.name) + '</b>' + ((q.w > 44 && q.h > 30) ? '<span>' + esc(val) + '</span>' : '') : '';
        html += '<button type="button" class="' + cls + '" data-id="' + esc(row.id) + '" tabindex="-1" role="gridcell" aria-label="' + esc(lab) + '" title="' + esc(lab) + '" ' +
          'style="left:' + q.x + 'px;top:' + q.y + 'px;width:' + q.w + 'px;height:' + q.h + 'px;background-color:' + t.color.bg + ';color:' + t.color.fg + '">' + inner + '</button>';
      });
    });
    board.innerHTML = html;
    board.querySelectorAll('.mm-tile').forEach(function (b) { tileById.set(b.dataset.id, b); });
    var first = (st.sel && tileById.get(st.sel)) || board.querySelector('.mm-tile');
    if (first) first.tabIndex = 0;
  }

  function render() {
    if (!el || !doc) return;
    compute();
    renderYears();
    renderLegend();
    el.querySelector('[data-k="group"]').value = st.group;
    el.querySelector('[data-k="color"]').value = st.color;
    el.querySelector('[data-k="size"]').value = st.size;
    el.querySelector('[data-k="w"]').value = st.w;
    el.querySelector('[data-k="scope"]').value = st.scope;
    var sum = el.querySelector('.mm-sum');
    if (sum) sum.textContent = '· ' + (st.y === 'all' ? '전체 개통 가정' : st.y + '년까지') + ' · ' + (st.color === 'tier' ? '순위 변화' : '빨라지는 분') + ' · ' + WLABEL[st.w] + ' 기준';
    if (st.tab !== 'card') draw();
    renderCard();
  }

  function stationById(id) { return typeof STATIONS !== 'undefined' ? STATIONS.find(function (s) { return s.properties.id === id; }) : null; }

  function renderCard() {
    var box = el.querySelector('.mm-card');
    var row = st.sel && rowsById.get(st.sel);
    if (!row) { box.innerHTML = '<p class="mm-src">타일을 누르면 여기에 그 역의 지금 → 개통 후 시간과 순위가 나옵니다. 지도에서 역을 눌러도 타일이 골라집니다.</p>'; return; }
    var tn = row.now.times || [], ta = row.aft.times || [];
    var cell = function (a, b) { return a == null ? (b == null ? '—' : '지금 못 감 → ' + b + '분') : (b == null ? a + '분' : a + '분 → ' + b + '분' + (a - b > 0 ? ' (−' + (a - b) + ')' : '')); };
    var tier = RTab().tierOf(row), T = RTab().TIERS[tier];
    var h = '<h3>' + esc(row.name) + ' <span class="mm-src">' + esc(row.sgg || row.region || '') + '</span></h3>' +
      '<div>' + esc(T.label) + ' · ' + (row.change == null ? '새로 갈 수 있게 되는 역' : '순위 ' + row.now.rank + '위 → ' + row.aft.rank + '위 (' + (row.change > 0 ? '▲' + row.change : row.change < 0 ? '▼' + (-row.change) : '그대로') + ')') + '</div>' +
      '<table><tr><th>도심</th><td>' + cell(tn[0], ta[0]) + '</td></tr><tr><th>여의도</th><td>' + cell(tn[1], ta[1]) + '</td></tr><tr><th>강남</th><td>' + cell(tn[2], ta[2]) + '</td></tr>' +
      '<tr><th>' + WLABEL[st.w] + ' 기준</th><td>' + cell(row.now.min, row.aft.min) + '</td></tr></table>';
    if (invest() && typeof StationPrice !== 'undefined' && StationPrice.isReady()) {
      var p = StationPrice.of(row.id);
      if (p && p.medianPerPyeong != null) h += '<div>평당(전용) ' + esc(StationPrice.pp(p.medianPerPyeong)) + ' <span class="mm-src">' + esc(p.dong) + ' 아파트 매매 중위 · 최근 6개월 ' + p.deals + '건' + (p.deals < 5 ? ' (거래 적음)' : '') + '</span></div>';
      if (typeof StationJeonse !== 'undefined' && StationJeonse.isReady && StationJeonse.isReady()) {
        var j = StationJeonse.of(row.id);
        if (j && j.r != null) h += '<div>전세가율 ' + Math.round(j.r * 100) + '%' + (j.r >= 0.8 ? ' (주의)' : '') + ' <span class="mm-src">같은 단지·면적 짝 ' + (j.n || 0) + '쌍 중위 · 집계상 주의 지표</span></div>';
      }
    }
    h += '<p class="mm-src">시간 = 업무지구까지 열차 대기 뺀 비교용 추정 · ' + (st.y === 'all' ? '시기 미정 노선까지 모두 개통 가정' : st.y + '년까지 개통한다고 가정') +
      ' · <a href="data.html" target="_blank" rel="noopener">출처</a>' + (doc.updated ? ' · 기준 ' + esc(doc.updated) : '') + '</p>' +
      '<div class="mm-acts"><button type="button" data-a="map">지도에서 보기</button><button type="button" data-a="detail">역 상세 열기</button></div>';
    box.innerHTML = h;
    box.querySelector('[data-a="map"]').addEventListener('click', function () { flyTo(row.id); if (isMobile()) setTab('map'); });
    box.querySelector('[data-a="detail"]').addEventListener('click', function () { openDetail(row.id); });
  }

  function flyTo(id) {
    var f = stationById(id);
    if (!f || typeof map === 'undefined' || !map.flyTo) return;
    try { map.flyTo({ center: f.geometry.coordinates, zoom: Math.max(map.getZoom ? map.getZoom() : 12, 12.5), duration: 600 }); } catch (e) { /* 지도 없음 */ }
  }
  var selfShow = false;
  function openDetail(id) {
    var f = stationById(id);
    if (!f || typeof global.showStation !== 'function') return;
    selfShow = true;
    try { global.showStation(f, f.geometry.coordinates); } finally { selfShow = false; }
  }

  function highlight(id) {
    tileById.forEach(function (b, k) { b.classList.toggle('sel', k === id); b.tabIndex = k === id ? 0 : -1; });
  }

  // 타일에서 고름(fromTile) 또는 지도에서 고름
  function pick(id, o) {
    o = o || {};
    if (!rowsById.has(id)) return false;
    st.sel = id;
    highlight(id);
    renderCard();
    if (o.fromTile) {
      track('market_map_station_select', { 역: (rowsById.get(id) || {}).name });
      flyTo(id);
      if (isMobile()) setTab('card');
      else openDetail(id);
    } else {
      var b = tileById.get(id);
      if (b && b.scrollIntoView) { try { b.scrollIntoView({ block: 'nearest' }); } catch (e) { /* 무시 */ } }
    }
    return true;
  }

  function load() {
    if (doc) return Promise.resolve(true);
    var p = (typeof StationRocket !== 'undefined' && StationRocket.load) ? StationRocket.load().then(function () { return StationRocket.doc(); })
      : fetch('data/rank.json').then(function (r) { return r.ok ? r.json() : null; });
    return p.then(function (d) { doc = d || null; return !!doc; }).catch(function () { return false; });
  }

  function open(o) {
    o = o || {};
    build();
    opener = document.activeElement;
    ['w', 'group', 'color', 'scope'].forEach(function (k) { if (o[k] && ALLOWED[k].indexOf(String(o[k])) >= 0) st[k] = String(o[k]); });
    if (o.y && /^(all|20[0-9][0-9])$/.test(String(o.y))) st.y = String(o.y);
    if (o.size === 'deals' || o.size === 'equal') st.size = o.size;
    if (st.size === 'deals' && !invest()) st.size = 'equal';
    isOpen = true;
    el.hidden = false;
    setTab('tiles');
    var opts = el.querySelector('.mm-opts'); if (opts) opts.open = !isMobile();
    el.querySelector('.mm-board').innerHTML = '<div class="mm-empty">순위 자료를 받는 중…</div>';
    track('market_map_open');
    return load().then(function (ok) {
      if (!ok) { el.querySelector('.mm-board').innerHTML = '<div class="mm-empty">순위 자료를 받지 못했습니다. 잠시 뒤 다시 열어 주세요.</div>'; return; }
      render();
      // 설정 칸(접기)·범례 줄바꿈으로 판 크기가 그린 뒤에 바뀔 수 있다 — 배치가 끝난 다음 프레임에 한 번 더 (2026-11-13)
      if (global.requestAnimationFrame) requestAnimationFrame(function () { requestAnimationFrame(function () { if (isOpen && st.tab !== 'card') draw(); }); });
      // 고른 역이 지금 보기(기본: 새 노선이 서는 역)에 없으면 '수도권 전체'로 넓혀 그 타일이 보이게
      if (o.sel && rowsById.has(o.sel) && !model.groups.some(function (G) { return G.tiles.some(function (t) { return t.row.id === o.sel; }); })) { st.scope = 'all'; render(); }
      if (o.sel) pick(o.sel, {});
      var t = el.querySelector('.mm-tile[tabindex="0"]') || el.querySelector('.mm-close');
      try { (t || el).focus({ preventScroll: true }); } catch (e) { /* 무시 */ }
    });
  }

  function close() {
    if (!el) return;
    isOpen = false;
    el.hidden = true;
    var back = document.getElementById('mm-return'); if (back) back.hidden = true;
    if (opener && opener.isConnected && opener.focus) { try { opener.focus({ preventScroll: true }); } catch (e) { /* 무시 */ } }
    opener = null;
  }

  function init() {
    // 지도·검색에서 역 상세가 열리면 타일도 고른다 (양방향 연결) — StationDetail.show 를 감싼다
    if (typeof StationDetail !== 'undefined' && StationDetail.show && !StationDetail.__mm) {
      var orig = StationDetail.show;
      StationDetail.show = function (f) {
        var r = orig.apply(this, arguments);
        try { if (isOpen && !selfShow && f && f.properties) pick(f.properties.id, {}); } catch (e) { /* 무시 */ }
        return r;
      };
      StationDetail.__mm = true;
    }
    // 역 상세의 '타일 지도에서 보기' (js/access.js) — 새로고침 없이 그 역을 고른 채 연다
    if (!document.__mmSt) {
      document.__mmSt = true;
      document.addEventListener('click', function (e) {
        var a = e.target.closest && e.target.closest('[data-market-st]');
        if (!a || e.ctrlKey || e.metaKey || e.shiftKey) return;
        e.preventDefault();
        if (isMobile() && typeof StationDetail !== 'undefined' && StationDetail.hide) StationDetail.hide();
        var id = a.getAttribute('data-market-st');
        if (isOpen && load) { if (!pick(id, {})) open({ sel: id }); } else open({ sel: id });
      });
    }
    document.querySelectorAll('[data-market-open]').forEach(function (b) {
      b.addEventListener('click', function () { open({}); });
    });
    var q = new URLSearchParams(location.search);
    if (q.get('market') === '1') open({ sel: q.get('st'), y: q.get('y'), w: q.get('w'), color: q.get('c'), group: q.get('g'), scope: q.get('s') });
  }

  global.MarketMap = { Logic: Logic, init: init, open: open, close: close, pick: pick,
    isOpen: function () { return isOpen; }, state: function () { return { w: st.w, y: st.y, group: st.group, size: st.size, color: st.color, sel: st.sel, tab: st.tab }; },
    model: function () { return model; } };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports) module.exports = (typeof window !== 'undefined' ? window : globalThis).MarketMap;
