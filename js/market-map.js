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

    // H1 산점도 (2026-11-14): X = 개통 후 빨라지는 분, Y = 같은 두 반기 사이 법정동 아파트 매매 중위 평당가 변화율(%).
    // 기간은 모든 역에 같게 고정(SC_FROM→SC_TO, 둘 다 마감된 반기) — 역마다 기간이 다르면 비교가 안 된다.
    // 두 반기 중 하나라도 거래 5건 미만(값 null)이면 넣지 않는다(값을 지어내지 않음). 신규 역(지금은 못 감)도 X 가 없어 뺀다.
    var SC_FROM = '2024H1', SC_TO = '2026H1', SC_GAIN_SPLIT = 5;
    function scatterPoints(tiles, trendOf) {
      var pts = [], noPrice = 0, isNew = 0;
      tiles.forEach(function (t) {
        var r = t.row;
        if (r.isNew || t.gain == null) { isNew++; return; }
        var tr = trendOf(r.id), a = null, b = null;
        (tr && tr.s || []).forEach(function (x) { if (x[0] === SC_FROM) a = x; if (x[0] === SC_TO) b = x; });
        if (!a || !b || a[1] == null || b[1] == null || !(a[1] > 0)) { noPrice++; return; }
        pts.push({ t: t, id: r.id, name: r.name, x: t.gain, y: Math.round((b[1] / a[1] - 1) * 1000) / 10, n0: a[2], n1: b[2], dong: tr.dong });
      });
      var ys = pts.map(function (p) { return p.y; }).sort(function (a, b) { return a - b; });
      var med = ys.length ? (ys.length % 2 ? ys[(ys.length - 1) / 2] : (ys[ys.length / 2 - 1] + ys[ys.length / 2]) / 2) : 0;
      med = Math.round(med * 10) / 10;
      var q = { hiLo: 0, hiHi: 0, loHi: 0, loLo: 0 };
      pts.forEach(function (p) { p.q = (p.x >= SC_GAIN_SPLIT ? 'hi' : 'lo') + (p.y > med ? 'Hi' : 'Lo'); q[p.q]++; });
      return { pts: pts, med: med, split: SC_GAIN_SPLIT, from: SC_FROM, to: SC_TO, noPrice: noPrice, isNew: isNew, q: q };
    }
    // 사분면 이름 — 기획서 4.5 그대로. '저평가'·'매수' 같은 단정 말은 쓰지 않는다.
    // H8 노선 × 빨라지는 분 구간 (고정 구간 — 같은 값은 언제나 같은 칸)
    var BANDS = [
      { key: 'b0', label: '0분', test: function (g) { return g != null && g <= 0; } },
      { key: 'b1', label: '0~5분', test: function (g) { return g > 0 && g < 5; } },
      { key: 'b2', label: '5~10분', test: function (g) { return g >= 5 && g < 10; } },
      { key: 'b3', label: '10~20분', test: function (g) { return g >= 10 && g < 20; } },
      { key: 'b4', label: '20분+', test: function (g) { return g >= 20; } },
      { key: 'bn', label: '신규', test: null }
    ];
    function bandOf(t) {
      if (t.row.isNew) return 'bn';
      if (t.gain == null) return null;
      for (var i = 0; i < BANDS.length - 1; i++) if (BANDS[i].test(t.gain)) return BANDS[i].key;
      return null;
    }
    function bandMatrix(groups) {
      return groups.map(function (G) {
        var c = {}; BANDS.forEach(function (B) { c[B.key] = 0; });
        var gs = [];
        G.tiles.forEach(function (t) { var k = bandOf(t); if (k) c[k]++; if (!t.row.isNew && t.gain != null) gs.push(t.gain); });
        gs.sort(function (a, b) { return a - b; });
        var med = gs.length ? (gs.length % 2 ? gs[(gs.length - 1) / 2] : (gs[gs.length / 2 - 1] + gs[gs.length / 2]) / 2) : null;
        return { name: G.name, n: G.tiles.length, c: c, med: med == null ? null : Math.round(med * 10) / 10 };
      });
    }
    var QUAD_LABEL = {
      hiLo: '접근성 개선 대비 가격 반응 제한', hiHi: '접근성과 시장 반응 동반',
      loHi: '교통 외 요인 점검', loLo: '두 지표 변화 제한'
    };

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
    // 투자 색 (고정 구간 — 같은 값은 언제나 같은 색). 전세가율 80% 이상은 '주의'(따뜻한 색)
    var JEONSE_BINS = [
      { max: 0.4999, key: 'j0', label: '50% 미만', bg: '#dbe8f6', fg: '#13263b' },
      { max: 0.5999, key: 'j1', label: '50~60%', bg: '#a9c8ea', fg: '#13263b' },
      { max: 0.6999, key: 'j2', label: '60~70%', bg: '#6f9fd6', fg: '#0b1a2b' },
      { max: 0.7999, key: 'j3', label: '70~80%', bg: '#f3d9a4', fg: '#3a2600' },
      { max: Infinity, key: 'j4', label: '80% 이상(주의)', bg: '#c2410c', fg: '#ffffff' },
    ];
    var PRICE_BINS = [   // 만원/평 (전용면적)
      { max: 1999, key: 'p0', label: '2천만 미만', bg: '#dbe8f6', fg: '#13263b' },
      { max: 2999, key: 'p1', label: '2~3천만', bg: '#a9c8ea', fg: '#13263b' },
      { max: 4499, key: 'p2', label: '3~4.5천만', bg: '#6f9fd6', fg: '#0b1a2b' },
      { max: 5999, key: 'p3', label: '4.5~6천만', bg: '#2f6db5', fg: '#ffffff' },
      { max: Infinity, key: 'p4', label: '6천만 이상', bg: '#17457a', fg: '#ffffff' },
    ];
    var NEW_COLOR = { key: 'new', label: '신규(지금은 못 감)', bg: '#7a3fd0', fg: '#ffffff' };
    var NA_COLOR = { key: 'na', label: '자료 없음', bg: '#eceef1', fg: '#5b6470', hatch: true };

    function colorOf(row, mode, tierOf, valueOf) {
      if (mode === 'jeonse' || mode === 'price') {
        var v = valueOf ? valueOf(row.id) : null;
        if (v == null) return NA_COLOR;
        var bins = mode === 'jeonse' ? JEONSE_BINS : PRICE_BINS;
        for (var k = 0; k < bins.length; k++) if (v <= bins[k].max) return bins[k];
        return bins[bins.length - 1];
      }
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
        var sized = !!opts.size && opts.size !== 'equal';
        var sv = sized && opts.sizeOf ? opts.sizeOf(r.id) : null;
        var v = sized ? (sv && sv > 0 ? sv : 1) : 1;
        var t = { row: r, v: v, color: colorOf(r, opts.color, tierOf, opts.valueOf), gain: gainOf(r), sizeMissing: sized && !(sv > 0) };
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
    // K2 라벨 단계 — 글자 크기는 12px 고정(7단계 하한)이라 줄이지 않고, 칸 크기에 맞춰 보여 줄 것을 단계적으로 줄인다.
    // 한글·한자·▲▼ 12px, 그 밖(숫자·기호·영문) 7px로 폭을 어림. 안쪽 여백 좌우 3px·위아래 2px + 테두리 1px.
    function textW(str) { var w = 0; str = String(str || ''); for (var i = 0; i < str.length; i++) { var c = str.charCodeAt(i); w += (c > 0x2e80 || c === 0x25b2 || c === 0x25bc) ? 12 : 7; } return w; }   // ▲▼는 한글 폭
    var LINE = 15, PADX = 8, PADY = 6, MIN_NAME = 20;   // 이름은 최소 한 글자+말줄임(…)이 들어가야 보임 — 예전 기준(폭 27px 넘으면 이름)과 같은 수준
    function labelPlan(name, val, w, h) {
      var cw = w - PADX, ch = h - PADY, nw = textW(name), vw = textW(val);
      var nameFits = cw >= Math.min(nw, MIN_NAME);
      if (!nameFits || ch < 10) return { mode: 'none' };   // 높이 16px부터(예전 기준 15px 초과와 같음)
      if (val && ch >= 2 * LINE - 1 && cw >= vw) return { mode: 'two' };          // 이름 / 값 두 줄
      if (val && cw >= nw + 4 + vw) return { mode: 'inline' };                   // 한 줄에 '이름 값'
      return { mode: 'name' };                                                    // 이름만 (넘치면 말줄임)
    }
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

    return { BANDS: BANDS, bandOf: bandOf, bandMatrix: bandMatrix, scatterPoints: scatterPoints, QUAD_LABEL: QUAD_LABEL, FAMILY: FAMILY, GAIN_BINS: GAIN_BINS, TIER_COLORS: TIER_COLORS, JEONSE_BINS: JEONSE_BINS, PRICE_BINS: PRICE_BINS, NEW_COLOR: NEW_COLOR, NA_COLOR: NA_COLOR,
      OTHER_NEW: OTHER_NEW, NO_NEW: NO_NEW, NONE: NONE,
      familyOf: familyOf, isNewLine: isNewLine, gainOf: gainOf, colorOf: colorOf, groupOf: groupOf, squarify: squarify, build: build, layout: layout, textW: textW, labelPlan: labelPlan };
  })();

  if (typeof document === 'undefined') { global.MarketMap = { Logic: Logic }; return; }

  /* ---------------- 화면 ---------------- */
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var WLABEL = { avg: '평균', cbd: '도심', ybd: '여의도', gbd: '강남' };
  var st = { w: 'avg', y: 'all', group: 'line', size: 'equal', color: 'gain', scope: 'new', view: 'tiles', sel: null, cmp: [], tab: 'tiles', focus: null, band: null };
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
      '.mm-png{margin-left:auto;border:0;background:none;color:var(--muted,#5b6470);cursor:pointer;padding:4px 6px;border-radius:6px}' +
      '.mm-link{border:0;background:none;color:var(--muted,#5b6470);cursor:pointer;padding:4px 6px;border-radius:6px}' +
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
      '.mm-tile{transition:background-color .6s ease,color .6s ease}' +
      '.mm-yb{position:absolute;right:10px;bottom:10px;z-index:5;padding:8px 14px;border-radius:12px;background:rgba(17,24,39,.82);color:#fff;font-size:var(--fs-xl);font-weight:800;letter-spacing:-.02em;pointer-events:none}' +
      '.mm-yb[hidden]{display:none}' +
      '.mm-play{border:1px solid var(--border,#ccd);background:var(--panel-bg,#fff);color:var(--text,#222);border-radius:999px;width:30px;height:28px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;margin-right:4px}' +
      '@media (prefers-reduced-motion: reduce){.mm-tile{transition:none}}' +
      '.mm-tile:focus-visible{outline:3px solid var(--accent,#1565c0);outline-offset:-3px;z-index:2}' +
      '.mm-tile.na{background-image:repeating-linear-gradient(45deg,transparent 0 4px,rgba(0,0,0,.06) 4px 8px)}' +
      '.mm-tile.few{border-style:dashed;border-color:rgba(0,0,0,.45)}' +
      '.mm-tile.sel{box-shadow:inset 0 0 0 3px #111;z-index:3}' +
      '.mm-tile b{display:block;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.mm-tile span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.92}' +
      '.mm-tile.inl{display:flex;align-items:baseline;gap:4px}.mm-tile.inl b,.mm-tile.inl span{display:inline}.mm-tile.inl span{flex:none}' +
      '.mm-crowd{position:absolute;left:8px;bottom:8px;z-index:4;display:flex;align-items:center;gap:8px;flex-wrap:wrap;max-width:calc(100% - 16px);padding:6px 8px 6px 10px;border-radius:10px;background:var(--panel-bg,#fff);color:var(--text,#222);box-shadow:0 2px 8px rgba(0,0,0,.18);font-size:var(--fs-sm)}' +
      '.mm-tolist{border:1px solid var(--accent,#1565c0);background:var(--accent,#1565c0);color:#fff;border-radius:999px;padding:3px 10px;cursor:pointer;font-family:inherit;font-size:var(--fs-sm);font-weight:700}.mm-tolist:focus-visible{outline:3px solid var(--text,#222);outline-offset:2px}' +
      '.mm-mx{display:flex;flex-direction:column;gap:6px;padding:2px}' +
      '.mm-mxr{display:flex;gap:8px;align-items:flex-start}' +
      '.mm-mxh{flex:none;width:92px;font-size:var(--fs-xs);line-height:1.3}.mm-mxh b{display:block;font-size:var(--fs-sm)}.mm-mxh span{color:var(--muted,#5b6470)}' +
      '.mm-mxc{display:flex;flex-wrap:wrap;gap:2px}' +
      '.mm-tile.mm-cell{position:static;width:34px;height:28px;padding:0;display:inline-flex;align-items:center;justify-content:center;font-size:var(--fs-xs);font-weight:700;overflow:hidden;white-space:nowrap}' +
      '.mm-list{list-style:none;margin:0;padding:0}' +
      '.mm-bd-t{margin:2px 2px 6px;font-size:var(--fs-xs);color:var(--muted,#5b6470);line-height:1.45}' +
      '.mm-bd{border-collapse:collapse;width:100%;font-size:var(--fs-sm)}.mm-bd th,.mm-bd td{border-bottom:1px solid var(--border,#e3e6ea);padding:3px 4px;text-align:center}' +
      '.mm-bd th[scope=row]{text-align:left;white-space:nowrap}.mm-bd th[scope=row] span{color:var(--muted,#5b6470);font-weight:normal;font-size:var(--fs-xs)}.mm-bd thead th{font-size:var(--fs-xs);color:var(--muted,#5b6470)}' +
      '.mm-bd td.z{color:var(--muted,#9aa1a8)}.mm-bd td.md{font-size:var(--fs-xs);white-space:nowrap}' +
      '.mm-bcell{width:100%;min-width:34px;min-height:28px;border:0;border-radius:6px;cursor:pointer;font-family:inherit;font-weight:800;font-size:var(--fs-sm)}.mm-bcell:focus-visible{outline:3px solid var(--accent,#1565c0);outline-offset:1px}' +
      'button.mm-gname{border:0;background:none;padding:0;margin:0;cursor:pointer;text-align:left;font-family:inherit;z-index:1}button.mm-gname:hover{text-decoration:underline}' +
      'button.mm-gname:focus-visible{outline:3px solid var(--accent,#1565c0);outline-offset:1px}' +
      '.mm-gname-mx{position:static;font-size:var(--fs-sm);font-weight:800;color:var(--text,#222)}' +
      '.mm-focus{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 10px 6px;padding:5px 8px;border-radius:8px;background:var(--surface,#f1f5fb);font-size:var(--fs-sm)}.mm-focus[hidden]{display:none}' +
      '.mm-unfocus{border:1px solid var(--border,#ccd);background:var(--panel-bg,#fff);color:var(--text,#222);border-radius:999px;padding:3px 10px;cursor:pointer;font-family:inherit;font-size:var(--fs-sm);font-weight:700}' +
      '.mm-sc-note{position:relative;z-index:1;font-size:var(--fs-xs);line-height:1.45;color:var(--muted,#5b6470);padding:2px 2px 0}.mm-sc-note b{color:var(--text,#222)}' +
      '.mm-sc-ax{position:absolute;left:0;top:0;pointer-events:none}.mm-sc-ax text{font-size:var(--fs-xs);fill:var(--muted,#5b6470)}.mm-sc-ax .t{font-weight:700;fill:var(--text,#222)}' +
      '.mm-sc-ax .g{stroke:var(--border,#e3e6ea);stroke-width:1}.mm-sc-ax .g.z{stroke:var(--muted,#8a929c)}.mm-sc-ax .m{stroke:var(--text,#222);stroke-width:1.2;stroke-dasharray:5 4}' +
      '.mm-sc-q{position:absolute;z-index:5;font-size:var(--fs-xs);font-weight:700;color:var(--text,#222);background:var(--panel-bg,#fff);opacity:.9;padding:1px 5px;border-radius:6px;pointer-events:none;white-space:nowrap}' +
      '.mm-tile.mm-dot{width:12px;height:12px;padding:0;border-radius:50%;border:1px solid rgba(0,0,0,.45);transition:none}' +
      '.mm-tile.mm-dot.clip{border-style:dashed}.mm-tile.mm-dot.sel{box-shadow:0 0 0 3px #111;z-index:4}' +
      '.mm-sc-lab{position:absolute;z-index:4;font-size:var(--fs-xs);font-weight:800;background:var(--panel-bg,#fff);color:var(--text,#222);padding:0 4px;border-radius:4px;pointer-events:none}' +
      '.mm-tile.mm-row{position:static;display:flex;align-items:center;gap:8px;width:100%;padding:6px 8px;border:0;border-bottom:1px solid var(--border,#e3e6ea);border-radius:0;background:none;color:var(--text,#222);font-size:var(--fs-sm);height:auto}' +
      '.mm-tile.mm-row.sel{box-shadow:inset 3px 0 0 var(--accent,#1565c0);background:var(--surface,#f6f7f9)}' +
      '.mm-row i{flex:none;width:12px;height:12px;border-radius:3px}.mm-row b{display:inline;flex:0 1 auto}.mm-rk{flex:none;width:26px;color:var(--muted,#5b6470);font-size:var(--fs-xs);text-align:right}' +
      '.mm-row .mm-g{flex:none;font-size:var(--fs-xs);color:var(--muted,#5b6470)}.mm-row .mm-v{margin-left:auto;flex:none;font-size:var(--fs-xs);font-weight:700}' +
      '.mm-card{border-top:1px solid var(--border,#e3e6ea);padding:8px 14px 10px;font-size:var(--fs-sm);line-height:1.5;flex:0 0 auto;overflow:auto}.mm-card.on{flex:0 0 32%;min-height:140px}' +   // 높이 고정 — 카드 내용이 바뀔 때 타일 판이 다시 그려지지 않게
      '.mm-cmp{margin:0 0 8px;padding:6px 8px;border:1px solid var(--border,#e3e6ea);border-radius:10px;overflow-x:auto}' +
      '.mm-cmp table{width:100%}.mm-cmp th{font-weight:700;white-space:nowrap}.mm-cmp td{white-space:nowrap}' +
      '.mm-cx{border:0;background:none;color:var(--muted,#5b6470);cursor:pointer;padding:0 2px;font:inherit}' +
      '.mm-card .mm-acts button:disabled{opacity:.5;cursor:default}' +
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
      '<button class="mm-png" type="button" aria-label="이미지로 저장" title="지금 타일을 이미지로 저장 (제목·조건·범례·출처 포함)"><i data-ic="camera"></i></button>' +
      '<button class="mm-link" type="button" aria-label="지금 보는 조건으로 링크 복사" title="지금 보는 조건(연도·기준·색·묶기·고른 역)으로 링크 복사"><i data-ic="link"></i></button>' +
      '<button class="mm-close" type="button" aria-label="타일 지도 닫기"><i data-ic="close"></i></button></div>' +
      '<div class="mm-tabs" role="tablist" aria-label="보기"><button type="button" role="tab" data-tab="map">지도</button>' +
      '<button type="button" role="tab" data-tab="tiles">타일</button><button type="button" role="tab" data-tab="card">분석</button></div>' +
      '<details class="mm-opts" open><summary>보기 설정 <span class="mm-sum"></span></summary>' +
      '<div class="mm-ctrl">' +
        '<label>묶기 <select data-k="group"><option value="line">새 노선</option><option value="sgg">시군구</option></select></label>' +
        '<label>색 <select data-k="color"><option value="gain">빨라지는 분</option><option value="tier">순위 변화</option><option value="jeonse">전세가율 (투자 모드)</option><option value="price">평당가 (투자 모드)</option></select></label>' +
        '<label>크기 <select data-k="size"><option value="equal">모두 같게</option><option value="deals">아파트 거래 건수 (투자 모드)</option><option value="supply">입주 예정 세대 (투자 모드)</option></select></label>' +
        '<label>기준 <select data-k="w"><option value="avg">평균</option><option value="cbd">도심</option><option value="ybd">여의도</option><option value="gbd">강남</option></select></label>' +
        '<label>보기 <select data-k="view"><option value="tiles">타일</option><option value="list">목록(순위)</option><option value="matrix">표(노선×역)</option><option value="bands">표(노선×빨라짐 구간)</option><option value="scatter">산점도(빨라짐×가격)</option></select></label>' +
        '<label><input type="checkbox" class="mm-wait"> 출퇴근 배차 넣기</label>' +
        '<label>역 <select data-k="scope"><option value="new">새 노선이 서는 역</option><option value="affected">빨라지는 역 모두</option><option value="all">수도권 전체</option></select></label>' +
      '</div>' +
      '<div class="mm-years" role="group" aria-label="이 해까지 개통한다고 가정"></div>' +
      '<div class="mm-legend" aria-label="색 뜻"></div></details>' +
      '<div class="mm-focus" hidden></div>' +
      '<div class="mm-board" role="grid" aria-label="역 타일"></div>' +
      '<div class="mm-card" aria-live="polite"></div>';
    document.body.appendChild(el);
    var back = document.createElement('button');
    back.id = 'mm-return'; back.type = 'button'; back.hidden = true; back.textContent = '타일로 돌아가기';
    back.addEventListener('click', function () { setTab('tiles'); });
    document.body.appendChild(back);

    el.querySelector('.mm-close').addEventListener('click', close);
    el.querySelector('.mm-wait').addEventListener('change', function (e) { if (global.KR_WAIT) KR_WAIT.set(e.target.checked ? 'peak' : 'none'); });
    if (global.KR_WAIT) KR_WAIT.onChange(function () { if (isOpen) render(); });
    el.querySelector('.mm-png').addEventListener('click', function () { savePng(); });
    el.querySelector('.mm-link').addEventListener('click', function () {
      var url = location.origin + location.pathname + linkQuery() + location.hash;
      var done = function () { note('타일 지도 링크를 복사했습니다 — 같은 조건으로 열립니다'); track('market_map_share'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { note('주소: ' + url); }); else note('주소: ' + url);
    });
    el.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    el.querySelectorAll('.mm-ctrl select').forEach(function (s) {
      s.addEventListener('change', function () {
        st[s.dataset.k] = s.value;
        if (s.dataset.k === 'size' && (s.value === 'deals' || s.value === 'supply') && !invest()) {
          st.size = 'equal'; s.value = 'equal';
          note('거래 건수·입주 세대 크기는 투자 모드에서만 씁니다');
        }
        if (s.dataset.k === 'color' && (s.value === 'jeonse' || s.value === 'price') && !invest()) {
          st.color = 'gain'; s.value = 'gain';
          note('전세가율·평당가 색은 투자 모드에서만 씁니다');
        }
        if (s.dataset.k === 'view' && s.value === 'scatter' && !invest()) {
          st.view = 'tiles'; s.value = 'tiles';
          note('산점도(빨라짐×가격)는 투자 모드에서만 씁니다');
        }
        if (s.dataset.k === 'size' && st.size !== 'equal') ensurePrice();
        if (s.dataset.k === 'color' && (st.color === 'jeonse' || st.color === 'price')) ensurePrice();
        track('market_map_filter_change', { 종류: s.dataset.k });
        render();
      });
    });
    el.querySelector('.mm-tabs').addEventListener('click', function (e) { var b = e.target.closest('button[data-tab]'); if (b) setTab(b.dataset.tab); });
    var board = el.querySelector('.mm-board');
    board.addEventListener('click', function (e) {
      var bc = e.target.closest('.mm-bcell');
      if (bc) { stopPlay(); st.focus = bc.dataset.g; st.band = bc.dataset.b; st.view = 'list'; track('market_map_filter_change', { 종류: '표 칸' }); render(); var u = el.querySelector('.mm-unfocus'); if (u) u.focus(); return; }
      if (e.target.closest('.mm-tolist')) { stopPlay(); st.view = 'list'; track('market_map_filter_change', { 종류: '목록 권장' }); render(); var r0 = el.querySelector('.mm-board .mm-row'); if (r0) { try { r0.focus(); } catch (er) { /* 무시 */ } } return; }
      var g = e.target.closest('.mm-gname');
      if (g) { setFocus(st.focus ? null : g.dataset.g); return; }
      var t = e.target.closest('.mm-tile'); if (t) pick(t.dataset.id, { fromTile: true });
    });
    el.querySelector('.mm-focus').addEventListener('click', function (e) { if (e.target.closest('.mm-unfocus')) setFocus(null); });
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
    // 판 크기가 실제로 바뀔 때만 다시 그린다 (재생 중엔 안 그림 — 색만 바뀌는 중)
    var lastWH = '';
    if (global.ResizeObserver) new ResizeObserver(function () { var wh = board.clientWidth + 'x' + board.clientHeight; if (wh === lastWH) return; lastWH = wh; if (isOpen && st.tab !== 'card' && !playT) draw(); }).observe(board);
  }

  // 링크: ?market=1&y=&w=&c=&g=&s=&st= — 모르는 값은 무시(기본값)
  var ALLOWED = { w: ['avg', 'cbd', 'ybd', 'gbd'], color: ['gain', 'tier', 'jeonse', 'price'], group: ['line', 'sgg'], scope: ['new', 'affected', 'all'] };
  function linkQuery() {
    return '?market=1&y=' + encodeURIComponent(st.y) + '&w=' + st.w + '&c=' + st.color + '&g=' + st.group + '&s=' + st.scope + (st.view !== 'tiles' ? '&v=' + st.view : '') + (st.focus ? '&f=' + encodeURIComponent(st.focus) : '') + (st.band ? '&b=' + st.band : '') + (global.KR_WAIT && KR_WAIT.isPeak() ? '&wait=1' : '') + (st.sel ? '&st=' + encodeURIComponent(st.sel) : '');
  }
  function note(msg) { var s = document.getElementById('status'); if (s) s.textContent = msg; }

  // 시세·전세가율 자료 받기 (투자 모드) — 둘 다 오면 다시 그린다
  function investReady() {
    var p = typeof StationPrice === 'undefined' || StationPrice.isReady();
    var j = typeof StationJeonse === 'undefined' || !StationJeonse.isReady || StationJeonse.isReady();
    var d = typeof StationDev === 'undefined' || StationDev.isReady();
    var t = typeof StationTrend === 'undefined' || StationTrend.isReady();   // 가격 흐름 (G2)
    return p && j && d && t;
  }
  function ensurePrice() {
    if (investReady()) return;
    if (typeof global.loadDetailData === 'function') { try { global.loadDetailData(); } catch (e) { /* 무시 */ } }
    var tries = 0, iv = setInterval(function () { tries++; if (investReady() || tries > 40) { clearInterval(iv); if (isOpen) render(); } }, 250);
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
    var out = RT.compute(doc, { weight: st.w, region: 'capital', at: st.y, wait: (global.KR_WAIT && KR_WAIT.isPeak()) });   // 공통 '출퇴근 배차 넣기' (D9)
    rowsById = new Map(out.rows.map(function (r) { return [r.id, r]; }));
    var sizeOf = function (id) {
      if (st.size === 'supply') { if (typeof StationDev === 'undefined' || !StationDev.isReady()) return null; var d = StationDev.of(id); return d ? d.hh : null; }
      if (typeof StationPrice === 'undefined' || !StationPrice.isReady()) return null; var p = StationPrice.of(id); return p ? p.deals : null;
    };
    var valueOf = function (id) {
      if (st.color === 'jeonse') { if (typeof StationJeonse === 'undefined' || !StationJeonse.isReady || !StationJeonse.isReady()) return null; var j = StationJeonse.of(id); return j && j.r != null ? j.r : null; }
      if (st.color === 'price') { if (typeof StationPrice === 'undefined' || !StationPrice.isReady()) return null; var p = StationPrice.of(id); return p && p.medianPerPyeong != null && p.deals >= 5 ? p.medianPerPyeong : null; }
      return null;
    };
    model = Logic.build(out.rows, doc.lines, { group: st.group, size: st.size, color: st.color, scope: st.scope, sizeOf: sizeOf, valueOf: valueOf }, RT.tierOf);
    model.groups.forEach(function (G) { G.tiles.forEach(function (t) { t.mv = valueOf(t.row.id); }); });   // K1: 색 지표 값(평당가·전세가율)
    // H2 묶음 확대: 고른 묶음이 이 조건에 없으면(묶기 기준·범위가 바뀜) 풀어 준다
    if (st.focus) {
      var FG = model.groups.filter(function (G) { return G.name === st.focus; })[0];
      if (FG) model = Object.assign({}, model, { groups: [FG], total: FG.tiles.length }); else st.focus = null;
    }
    // H8 구간 거르기 (표 칸을 누르면): 그 구간 역만
    if (st.band) {
      var gs2 = model.groups.map(function (G) { return Object.assign({}, G, { tiles: G.tiles.filter(function (t) { return Logic.bandOf(t) === st.band; }) }); })
        .filter(function (G) { return G.tiles.length; });
      model = Object.assign({}, model, { groups: gs2, total: gs2.reduce(function (s, G) { return s + G.tiles.length; }, 0) });
    }
    el.querySelector('.mm-n').textContent = out.total;
  }

  function renderYears() {
    var box = el.querySelector('.mm-years');
    var ys = ['all'].concat(doc.years || []);
    box.innerHTML = '<button type="button" class="mm-play" aria-label="' + (playT ? '재생 멈추기' : '연도 차례로 보기') + '">' + (global.Icons ? Icons.svg(playT ? 'pause' : 'play') : (playT ? '||' : '>')) + '</button>' +
      '<span class="mm-def" style="margin:0 4px 0 0">그해까지 개통한다고 가정 (<a href="data.html#plans" target="_blank" rel="noopener">노선별 근거</a>):</span>' + ys.map(function (y) {
      return '<button type="button" data-y="' + y + '" aria-pressed="' + (String(st.y) === String(y)) + '">' + (y === 'all' ? '전체(시기 미정 포함)' : y + '년') + '</button>';
    }).join('');
    box.querySelectorAll('button').forEach(function (b) {
      if (b.classList.contains('mm-play')) { b.addEventListener('click', function () { playT ? stopPlay() : play(); }); return; }
      b.addEventListener('click', function () { stopPlay(); st.y = b.dataset.y; track('market_map_filter_change', { 종류: '연도' }); render(); });
    });
  }

  // ▶ 재생 — 2027 → … → 2035 → 전체. 타일 모양은 그대로 두고 색·값만 바꿔 부드럽게 (영상용)
  var playT = null;
  function play() {
    if (!doc) return;
    var seq = (doc.years || []).map(String).concat(['all']);
    var i = 0;
    track('market_map_play');
    var step = function () {
      st.y = seq[i];
      if (!recolor()) render();
      showYearBadge(seq[i]);
      renderYears(); renderCard();
      i++;
      if (i >= seq.length) { stopPlay(true); }
    };
    playT = setInterval(step, 1300);
    step();
  }
  function stopPlay(keepBadge) {
    if (playT) { clearInterval(playT); playT = null; }
    if (!keepBadge) hideYearBadge(); else setTimeout(hideYearBadge, 1400);
    if (el) renderYears();
  }
  function showYearBadge(y) {
    var board = el.querySelector('.mm-board'), b = board.querySelector('.mm-yb');
    if (!b) { b = document.createElement('div'); b.className = 'mm-yb'; b.setAttribute('aria-live', 'polite'); board.appendChild(b); }
    b.textContent = y === 'all' ? '모든 계획 노선 개통하면' : y + '년까지 개통하면';
    b.hidden = false;
  }
  function hideYearBadge() { var b = el && el.querySelector('.mm-board .mm-yb'); if (b) b.hidden = true; }
  // 같은 타일 묶음이면 색·값만 바꾼다. 다르면 false (다시 그리기)
  function recolor() {
    if (st.view !== 'tiles' || !model || st.size !== 'equal') return false;
    var prev = model;
    compute();
    var byId = new Map(); model.groups.forEach(function (G) { G.tiles.forEach(function (t) { byId.set(t.row.id, t); }); });
    var n = 0; prev.groups.forEach(function (G) { n += G.tiles.length; });
    // 새 해에 새로 생긴 역이 있으면 다시 그린다. 빠진 역(그해엔 아직 개통 전)은 자리를 두고 회색 빗금 '아직'
    var prevIds = new Set(); prev.groups.forEach(function (G) { G.tiles.forEach(function (t) { prevIds.add(t.row.id); }); });
    var extra = false; byId.forEach(function (v, k) { if (!prevIds.has(k)) extra = true; });
    if (extra) { draw(); return true; }
    // 같은 역들 — 자리(prev 배치)는 그대로, 값·색만 새 해로 (전후 비교 영상에서 같은 자리의 색이 바뀌어 보이게)
    prev.groups.forEach(function (G) {
      G.tiles.forEach(function (t) {
        var nt = byId.get(t.row.id);
        var b = tileById.get(t.row.id);
        if (!nt) {   // 그해엔 아직 갈 수 없는 역
          if (b) { b.style.backgroundColor = '#e5e7eb'; b.style.color = '#374151'; b.classList.add('na'); var s0 = b.querySelector('span'); if (s0) s0.textContent = '아직'; }
          return;
        }
        t.row = nt.row; t.color = nt.color; t.gain = nt.gain; t.mv = nt.mv;
        if (!b) return;
        b.style.backgroundColor = t.color.bg; b.style.color = t.color.fg;
        b.classList.toggle('na', !!t.color.hatch);
        var sp = b.querySelector('span');
        if (sp) sp.textContent = metricOf(t).main;
        var lb = tileLabel(t); b.setAttribute('aria-label', lb); b.title = lb;
      });
    });
    model = prev;
    renderLegend();
    return true;
  }


  function renderLegend() {
    var box = el.querySelector('.mm-legend'), items;
    if (st.color === 'jeonse' || st.color === 'price') {
      items = (st.color === 'jeonse' ? Logic.JEONSE_BINS : Logic.PRICE_BINS).map(function (b) { return [b.bg, b.label]; }).concat([[Logic.NA_COLOR.bg, '자료 없음·거래 적음(빗금)']]);
    } else if (st.color === 'tier') {
      var T = RTab().TIERS;
      items = ['rocket', 'up', 'flat', 'down', 'new'].map(function (k) { return [Logic.TIER_COLORS[k].bg, T[k].label + ' (' + T[k].hint + ')']; });
    } else {
      items = Logic.GAIN_BINS.map(function (b) { return [b.bg, b.label]; }).concat([[Logic.NEW_COLOR.bg, Logic.NEW_COLOR.label], [Logic.NA_COLOR.bg, '자료 없음(빗금)']]);
    }
    var sz = st.size === 'deals' ? ' · 크기 = 역이 속한 법정동 아파트 매매 건수(최근 6개월), 점선 = 자료 없음'
      : st.size === 'supply' ? ' · 크기 = 역이 속한 법정동의 아직 준공 안 된 주택인허가 세대(수록 자료 기준, 입주 물량 그대로는 아님), 점선 = 없음·자료 없음' : ' · 크기 = 모두 같음';
    box.innerHTML = items.map(function (x) { return '<span><i style="background:' + x[0] + '"></i>' + esc(x[1]) + '</span>'; }).join('') +
      '<span>' + esc((st.color === 'jeonse' ? '전세가율 = 역이 속한 법정동, 같은 단지·면적 매매·신규 전세 짝 중위 (집계상 주의 지표) · 타일 숫자도 전세가율' : st.color === 'price' ? '평당가(만원/평) = 역이 속한 법정동 아파트 매매 중위(전용면적, 최근 6개월, 5건 이상) · 타일 숫자도 평당가' : st.color === 'tier' ? '순위 변화 = 지금 순위 → 개통 후 순위 · 타일 숫자 = 오른 계단(▲)' : '빨라지는 분 = 지금 → 개통 후, ' + WLABEL[st.w] + ' 기준') + ((global.KR_WAIT && KR_WAIT.isPeak()) ? ' · 출퇴근 배차 넣음' : ' · 열차 대기 뺌') + sz) + '</span>';
  }

  // 목록 보기 — 묶음과 상관없이 한 줄로. 색 기준이 '빨라지는 분'이면 분 큰 순(신규는 맨 앞), '순위 변화'면 오른 계단 큰 순
  // 기준 시간은 업무지구 가중 평균이라 소수가 길다 — 소수 첫째 자리까지만 보인다
  function fm(v) { return v == null ? null : Math.round(v * 10) / 10; }
  /* K1 (6차 피드백, 2026-11-14): 타일·목록의 주 숫자 = 지금 고른 '색' 지표 (색은 평당가인데 숫자는 시간이던 것)
   * main: 타일·목록 주 숫자(단위 포함), sub: 목록 보조 줄, key: 목록 정렬(큰 값 먼저, 값 없음은 맨 뒤), say: 화면 읽기 앞머리
   * 시간 앞면은 정수(약 N분) — 소수는 상세 카드에 (모형의 불확실성 ≠ 소수 정밀도) */
  function metricOf(t) {
    var r = t.row, c = st.color;
    var timeTxt = r.isNew ? '지금은 철도로 못 감 → 개통 후 ' + Math.round(r.aft.min) + '분' : '지금 ' + Math.round(r.now.min) + '분 → 개통 후 ' + Math.round(r.aft.min) + '분';
    if (c === 'price' || c === 'jeonse') {
      var v = t.mv, raw = c === 'price' ? (typeof StationPrice !== 'undefined' && StationPrice.isReady() ? StationPrice.of(r.id) : null) : null;
      var miss = c === 'price' && raw && raw.medianPerPyeong != null && raw.deals < 5 ? '거래 적음' : '자료 없음';
      if (v == null) return { main: miss, sub: timeTxt, key: -1e9, say: (c === 'price' ? '평당가 ' : '전세가율 ') + miss };
      var main = c === 'price' ? Math.round(v).toLocaleString('ko-KR') + '만' : Math.round(v * 100) + '%';
      return { main: main, sub: timeTxt, key: v, say: c === 'price' ? '평당 ' + Math.round(v).toLocaleString('ko-KR') + '만원' : '전세가율 ' + Math.round(v * 100) + '%' };
    }
    if (c === 'tier') {
      var m = r.isNew ? '신규' : r.change == null ? '—' : r.change > 0 ? '▲' + r.change : r.change < 0 ? '▼' + (-r.change) : '그대로';
      return { main: m, sub: (r.isNew ? '' : r.now.rank + '→') + r.aft.rank + '위', key: r.isNew ? 1e6 : (r.change == null ? -1e9 : r.change), say: '순위 ' + (r.isNew ? '신규 ' + r.aft.rank + '위' : r.now.rank + '위→' + r.aft.rank + '위') };
    }
    var g = t.gain == null ? null : Math.round(t.gain);
    return { main: g == null ? (r.isNew ? '신규' : '—') : (g > 0 ? '−' + g + '분' : '0분'), sub: r.isNew ? '개통 후 ' + Math.round(r.aft.min) + '분' : Math.round(r.now.min) + '→' + Math.round(r.aft.min) + '분',
      key: r.isNew ? 1e6 : (t.gain == null ? -1e9 : t.gain), say: g == null ? (r.isNew ? '신규 역' : '자료 없음') : (g > 0 ? '약 ' + g + '분 빨라짐' : '변화 없음') };
  }
  function tileLabel(t) {
    var r = t.row, M = metricOf(t);
    return r.name + ' · ' + M.say + ' · ' + (r.isNew ? '지금은 철도로 못 감 → 개통 후 ' + fm(r.aft.min) + '분' : '지금 ' + fm(r.now.min) + '분 → 개통 후 ' + fm(r.aft.min) + '분') +
      (r.change != null ? ' · 순위 ' + r.now.rank + '→' + r.aft.rank + '위' : '');
  }
  function listRows() {
    var all = [];
    model.groups.forEach(function (G) { G.tiles.forEach(function (t) { all.push({ t: t, g: G.name }); }); });
    all.forEach(function (x) { x.m = metricOf(x.t); });
    all.sort(function (a, b) { return b.m.key - a.m.key || (a.t.row.aft.rank - b.t.row.aft.rank); });
    return all;
  }
  function drawList(board) {
    var rows = listRows();
    tileById = new Map();
    board.style.overflow = 'auto';
    board.innerHTML = '<ol class="mm-list">' + rows.map(function (x, i) {
      var r = x.t.row, c = x.t.color, M = x.m;
      var val = M.main + (M.sub ? ' · ' + M.sub : '');
      return '<li><button type="button" class="mm-tile mm-row' + (st.sel === r.id ? ' sel' : '') + '" data-id="' + esc(r.id) + '" tabindex="' + (i === 0 ? 0 : -1) + '" aria-label="' + esc((i + 1) + '위 ' + tileLabel(x.t)) + '">' +
        '<span class="mm-rk">' + (i + 1) + '</span><i style="background:' + c.bg + '"></i><b>' + esc(r.name) + '</b><span class="mm-g">' + esc(x.g) + '</span><span class="mm-v">' + esc(val) + '</span></button></li>';
    }).join('') + '</ol>';
    board.querySelectorAll('.mm-row').forEach(function (b) { tileById.set(b.dataset.id, b); });
  }

  function drawMatrix(board) {
    tileById = new Map();
    board.style.overflow = 'auto';
    var keyOf = function (t) { return t.row.isNew ? 1e6 : (st.color === 'tier' ? (t.row.change == null ? -1e6 : t.row.change) : (t.gain == null ? -1e6 : t.gain)); };
    var first = true;
    board.innerHTML = '<div class="mm-mx">' + model.groups.map(function (G) {
      var ts = G.tiles.slice().sort(function (a, b) { return keyOf(b) - keyOf(a); });
      var avg = (function () { var g = ts.filter(function (t) { return t.gain != null; }); return g.length ? Math.round(g.reduce(function (s2, t) { return s2 + t.gain; }, 0) / g.length * 10) / 10 : null; })();
      return '<div class="mm-mxr"><div class="mm-mxh"><b><button type="button" class="mm-gname mm-gname-mx" data-g="' + esc(G.name) + '" aria-label="' + esc(G.name) + (st.focus ? ' — 전체 보기로 돌아가기' : ' — 이 묶음만 보기') + '">' + esc(G.name) + '</button></b><span>' + ts.length + '역' + (avg != null && st.color === 'gain' ? ' · 평균 −' + avg + '분' : '') + '</span></div><div class="mm-mxc">' +
        ts.map(function (t) {
          var r = t.row;
          var lab = tileLabel(t);
          var h = '<button type="button" class="mm-tile mm-cell' + (t.color.hatch ? ' na' : '') + (st.sel === r.id ? ' sel' : '') + '" data-id="' + esc(r.id) + '" tabindex="' + (first ? 0 : -1) + '" aria-label="' + esc(lab) + '" title="' + esc(lab) + '" style="background-color:' + t.color.bg + ';color:' + t.color.fg + '">' + esc(r.name.slice(0, 2)) + '</button>';
          first = false; return h;
        }).join('') + '</div></div>';
    }).join('') + '</div>';
    board.querySelectorAll('.mm-cell').forEach(function (b) { tileById.set(b.dataset.id, b); });
  }

  // H1 산점도 (2026-11-14) — X 개통 후 빨라지는 분 · Y 같은 두 반기 가격 변화. 점 = 역(누르면 지도·상세), 색 = 지금 고른 색 기준.
  function drawScatter(board) {
    tileById = new Map();
    board.style.overflow = 'hidden';
    var TR = global.StationTrend;
    if (!TR || !TR.meta || !TR.meta()) {
      board.innerHTML = '<div class="mm-empty">가격 흐름 자료를 받는 중…</div>';
      if (TR && TR.load) TR.load('data/station-trend.json').then(function (ok) {
        if (!isOpen || st.view !== 'scatter') return;
        if (ok) draw(); else board.innerHTML = '<div class="mm-empty">가격 흐름 자료를 받지 못했습니다. 잠시 뒤 다시 열어 주세요.</div>';
      });
      return;
    }
    var tiles = []; model.groups.forEach(function (G) { G.tiles.forEach(function (t) { tiles.push(t); }); });
    var sc = Logic.scatterPoints(tiles, TR.of), P = sc.pts;
    var hl = function (h) { return h.slice(2, 4) + '년 ' + (h.slice(4) === 'H1' ? '상' : '하') + '반기'; };
    var head = '<div class="mm-sc-note">' +
      '<b>관찰 지표</b> — 철도 효과(인과)나 저평가·매수 신호가 아닙니다. ' +
      '가로: 개통 후 빨라지는 분(' + esc(WLABEL[st.w]) + ' 기준, ' + (st.y === 'all' ? '전체 개통 가정' : esc(st.y) + '년까지 개통 가정') + ') · ' +
      '세로: ' + hl(sc.from) + '→' + hl(sc.to) + ' 역이 속한 법정동 아파트 매매 중위 평당가 변화(두 반기 모두 5건 이상). ' +
      P.length + '역' + (sc.noPrice ? ' · 가격 자료 부족 ' + sc.noPrice + '역 제외' : '') + (sc.isNew ? ' · 지금은 못 가는 신규 ' + sc.isNew + '역 제외' : '') + '</div>';
    var W = board.clientWidth, H = board.clientHeight;
    if (W < 120 || H < 160) { board.innerHTML = head; return; }
    if (!P.length) { board.innerHTML = head + '<div class="mm-empty">이 조건에서 가격 자료가 있는 역이 없습니다</div>'; return; }
    board.innerHTML = head;
    var top = board.querySelector('.mm-sc-note').offsetHeight + 6;
    var mL = 44, mR = 12, mT = top + 4, mB = 34;
    var xs = P.map(function (p) { return p.x; }), ysS = P.map(function (p) { return p.y; }).sort(function (a, b) { return a - b; });
    var x0 = 0, x1 = Math.max(10, Math.ceil(Math.max.apply(null, xs) / 5) * 5);
    var pct = function (q) { return ysS[Math.min(ysS.length - 1, Math.max(0, Math.round(q * (ysS.length - 1))))]; };
    var y0 = Math.floor(Math.min(pct(0.02), sc.med - 5) / 10) * 10, y1 = Math.ceil(Math.max(pct(0.98), sc.med + 5) / 10) * 10;
    var X = function (v) { return mL + (v - x0) / (x1 - x0) * (W - mL - mR); };
    var Y = function (v) { return mT + (y1 - Math.max(y0, Math.min(y1, v))) / (y1 - y0) * (H - mT - mB); };
    var svg = '<svg class="mm-sc-ax" width="' + W + '" height="' + H + '" aria-hidden="true">';
    for (var gx = x0; gx <= x1; gx += (x1 > 40 ? 10 : 5)) svg += '<line x1="' + X(gx) + '" x2="' + X(gx) + '" y1="' + mT + '" y2="' + (H - mB) + '" class="g"/><text x="' + X(gx) + '" y="' + (H - mB + 14) + '" text-anchor="middle">' + gx + '</text>';
    var stepY = (y1 - y0) > 80 ? 20 : 10;
    for (var gy = y0; gy <= y1; gy += stepY) svg += '<line x1="' + mL + '" x2="' + (W - mR) + '" y1="' + Y(gy) + '" y2="' + Y(gy) + '" class="g' + (gy === 0 ? ' z' : '') + '"/><text x="' + (mL - 4) + '" y="' + (Y(gy) + 4) + '" text-anchor="end">' + (gy > 0 ? '+' : '') + gy + '%</text>';
    svg += '<line x1="' + X(sc.split) + '" x2="' + X(sc.split) + '" y1="' + mT + '" y2="' + (H - mB) + '" class="m"/>';
    svg += '<line x1="' + mL + '" x2="' + (W - mR) + '" y1="' + Y(sc.med) + '" y2="' + Y(sc.med) + '" class="m"/>';
    svg += '<text x="' + (W - mR) + '" y="' + (H - 4) + '" text-anchor="end" class="t">개통 후 빨라지는 분 →</text>';
    svg += '<text x="' + (mL + 2) + '" y="' + (mT - 4) + '" class="t">↑ 가격 변화 (가운데 선 = 전체 중앙값 ' + (sc.med > 0 ? '+' : '') + sc.med + '%)</text>';
    svg += '</svg>';
    var qbox = function (k, x, y, anchor) {
      return '<div class="mm-sc-q" style="' + (anchor === 'r' ? 'right:' + (W - x) + 'px' : 'left:' + x + 'px') + ';top:' + y + 'px">' + esc(Logic.QUAD_LABEL[k]) + ' · ' + sc.q[k] + '역</div>';
    };
    var qs = qbox('hiHi', W - mR - 4, mT + 14, 'r') + qbox('hiLo', W - mR - 4, H - mB - 20, 'r') + qbox('loHi', mL + 4, mT + 14, 'l') + qbox('loLo', mL + 4, H - mB - 20, 'l');
    var dots = P.slice().sort(function (a, b) { return (a.id === st.sel) - (b.id === st.sel); }).map(function (p, i) {
      var c = p.t.color, clip = p.y < y0 || p.y > y1;
      var lab = p.name + ' · 개통 후 ' + p.x + '분 빨라짐 · ' + hl(sc.from) + '→' + hl(sc.to) + ' ' + (p.y > 0 ? '+' : '') + p.y + '% (' + p.dong + ', 거래 ' + p.n0 + '→' + p.n1 + '건) · ' + Logic.QUAD_LABEL[p.q];
      return '<button type="button" class="mm-tile mm-dot' + (clip ? ' clip' : '') + (st.sel === p.id ? ' sel' : '') + '" data-id="' + esc(p.id) + '" tabindex="' + (i === 0 ? 0 : -1) + '" aria-label="' + esc(lab) + '" title="' + esc(lab) + '" ' +
        'style="left:' + (X(p.x) - 6) + 'px;top:' + (Y(p.y) - 6) + 'px;background-color:' + c.bg + '"></button>' +
        (st.sel === p.id ? '<div class="mm-sc-lab" style="left:' + (X(p.x) + 8) + 'px;top:' + (Y(p.y) - 9) + 'px">' + esc(p.name) + '</div>' : '');
    }).join('');
    board.insertAdjacentHTML('beforeend', svg + qs + dots);
    board.querySelectorAll('.mm-dot').forEach(function (b2) { tileById.set(b2.dataset.id, b2); });
    var f = (st.sel && tileById.get(st.sel)); if (f) { board.querySelectorAll('.mm-dot').forEach(function (o) { o.tabIndex = -1; }); f.tabIndex = 0; }
  }

  // H8 노선 × 빨라짐 구간 표 — 칸 = 역 수. 칸을 누르면 그 묶음·구간 역만 '목록'으로
  function drawBands(board) {
    tileById = new Map();
    board.style.overflow = 'auto';
    var M = Logic.bandMatrix(model.groups), B = Logic.BANDS;
    var max = 1; M.forEach(function (r) { B.forEach(function (x) { if (r.c[x.key] > max) max = r.c[x.key]; }); });
    var head = '<p class="mm-bd-t">행 = ' + (st.group === 'line' ? '새 노선 묶음' : '묶음') + ' · 열 = 개통 후 빨라지는 분(' + esc(WLABEL[st.w]) + ' 기준, ' + (st.y === 'all' ? '전체 개통 가정' : esc(st.y) + '년까지') + ') · 칸 = <b>역 수</b> · 중앙값 = 그 묶음 역들의 빨라지는 분 가운데 값</p>';
    var first = true;
    var html = head + '<table class="mm-bd"><thead><tr><th scope="col">묶음</th>' + B.map(function (x) { return '<th scope="col">' + esc(x.label) + '</th>'; }).join('') + '<th scope="col">중앙값</th></tr></thead><tbody>' +
      M.map(function (r) {
        return '<tr><th scope="row">' + esc(r.name) + ' <span>' + r.n + '역</span></th>' + B.map(function (x) {
          var v = r.c[x.key];
          if (!v) return '<td class="z">·</td>';
          var a = Math.round(0.12 + 0.6 * v / max * 100) / 100;
          var h = '<td><button type="button" class="mm-bcell" data-g="' + esc(r.name) + '" data-b="' + x.key + '" aria-label="' + esc(r.name) + ' · 빨라짐 ' + esc(x.label) + ' · ' + v + '역 — 이 역들만 목록으로" style="background:rgba(26,122,72,' + a + ');color:' + (a > 0.45 ? '#fff' : 'inherit') + '">' + v + '</button></td>';
          first = false; return h;
        }).join('') + '<td class="md">' + (r.med == null ? '—' : '−' + r.med + '분') + '</td></tr>';
      }).join('') + '</tbody></table>';
    board.innerHTML = html;
  }

  function draw() {
    if (!model) return;
    var board = el.querySelector('.mm-board');
    if (st.view === 'matrix') { if (!model.total) { board.innerHTML = '<div class="mm-empty">이 조건에 맞는 역이 없습니다</div>'; return; } drawMatrix(board); return; }
    if (st.view === 'scatter') { drawScatter(board); return; }
    if (st.view === 'bands') { if (!model.total) { board.innerHTML = '<div class="mm-empty">이 조건에 맞는 역이 없습니다</div>'; return; } drawBands(board); return; }
    if (st.view === 'list') { if (!model.total) { board.innerHTML = '<div class="mm-empty">이 조건에 맞는 역이 없습니다</div>'; return; } drawList(board); return; }
    board.style.overflow = 'hidden';
    var W = board.clientWidth, H = board.clientHeight;
    if (W < 40 || H < 40) return;
    if (!model.total) { board.innerHTML = '<div class="mm-empty">이 조건에 맞는 역이 없습니다</div>'; return; }
    Logic.layout(model, W, H, 18);
    var html = '', shown = 0, drawn = 0;
    tileById = new Map();
    model.groups.forEach(function (G) {
      var r = G.rect; if (!r || r.w < 2 || r.h < 2) return;
      drawn += G.tiles.length;
      html += '<div class="mm-group" style="left:' + r.x + 'px;top:' + r.y + 'px;width:' + r.w + 'px;height:' + r.h + 'px">' +
        '<button type="button" class="mm-gname" data-g="' + esc(G.name) + '" title="' + esc(G.name) + ' · ' + G.tiles.length + '역 — ' + (st.focus ? '전체 보기로' : '이 묶음만 크게') + '" aria-label="' + esc(G.name) + ' ' + G.tiles.length + '역 — ' + (st.focus ? '전체 보기로 돌아가기' : '이 묶음만 크게 보기') + '">' + esc(G.name) + ' · ' + G.tiles.length + (st.focus ? '' : ' ›') + '</button></div>';
      G.tiles.forEach(function (t) {
        var q = t.rect; if (!q || q.w < 1 || q.h < 1) return;
        var row = t.row, val = metricOf(t).main, lab = tileLabel(t);
        var cls = 'mm-tile' + (t.color.hatch ? ' na' : '') + (t.sizeMissing ? ' few' : '') + (st.sel === row.id ? ' sel' : '');
        var plan = Logic.labelPlan(row.name, val, q.w, q.h), inner = '';
        if (plan.mode !== 'none') { shown++; inner = '<b>' + esc(row.name) + '</b>'; }
        if (plan.mode === 'two') inner += '<span>' + esc(val) + '</span>';
        else if (plan.mode === 'inline') { cls += ' inl'; inner += '<span>' + esc(val) + '</span>'; }
        html += '<button type="button" class="' + cls + '" data-id="' + esc(row.id) + '" tabindex="-1" role="gridcell" aria-label="' + esc(lab) + '" title="' + esc(lab) + '" ' +
          'style="left:' + q.x + 'px;top:' + q.y + 'px;width:' + q.w + 'px;height:' + q.h + 'px;background-color:' + t.color.bg + ';color:' + t.color.fg + '">' + inner + '</button>';
      });
    });
    // 이름이 보이는 타일이 절반도 안 되면(수도권 전체 등) 목록·묶음 확대를 권한다
    if (drawn && shown / drawn < 0.5) html += '<div class="mm-crowd" role="note"><span>역이 많아 이름이 ' + (shown ? '일부만' : '안') + ' 보여요 · 묶음 이름을 누르면 크게</span>' +
      '<button type="button" class="mm-tolist">목록으로 보기</button></div>';
    board.innerHTML = html;
    board.querySelectorAll('.mm-tile').forEach(function (b) { tileById.set(b.dataset.id, b); });
    var first = (st.sel && tileById.get(st.sel)) || board.querySelector('.mm-tile');
    if (first) first.tabIndex = 0;
  }

  function setFocus(name) {
    stopPlay();
    st.focus = name || null;
    if (!name) st.band = null;
    if (name) track('market_map_filter_change', { 종류: '묶음 확대' });
    render();
    var f = st.focus ? el.querySelector('.mm-unfocus') : el.querySelector('.mm-board .mm-gname, .mm-board .mm-tile');
    if (f) { try { f.focus(); } catch (e) { /* 무시 */ } }
  }
  function renderFocus() {
    var bar = el.querySelector('.mm-focus');
    if (!bar) return;
    if (!st.focus && !st.band) { bar.hidden = true; bar.innerHTML = ''; return; }
    bar.hidden = false;
    var bl = st.band ? Logic.BANDS.filter(function (B) { return B.key === st.band; })[0] : null;
    bar.innerHTML = '<span>' + (st.focus ? '<b>' + esc(st.focus) + '</b> 묶음' : '') + (st.focus && bl ? ' · ' : '') + (bl ? '빨라짐 <b>' + esc(bl.label) + '</b>' : '') + '만 보는 중 · ' + (model ? model.total : 0) + '역</span>' +
      '<button type="button" class="mm-unfocus">← 전체 보기</button>';
  }

  function render() {
    if (!el || !doc) return;
    compute();
    renderYears();
    renderLegend();
    renderFocus();
    el.querySelector('[data-k="group"]').value = st.group;
    el.querySelector('[data-k="color"]').value = st.color;
    el.querySelector('[data-k="size"]').value = st.size;
    el.querySelector('[data-k="w"]').value = st.w;
    el.querySelector('[data-k="scope"]').value = st.scope;
    el.querySelector('[data-k="view"]').value = st.view;
    el.querySelector('.mm-wait').checked = (global.KR_WAIT && KR_WAIT.isPeak());
    var sum = el.querySelector('.mm-sum');
    if (sum) sum.textContent = '· ' + (st.y === 'all' ? '전체 개통 가정' : st.y + '년까지') + ' · ' + ({ gain: '빨라지는 분', tier: '순위 변화', jeonse: '전세가율', price: '평당가' }[st.color] || '빨라지는 분') + ' · ' + WLABEL[st.w] + ' 기준';   // 색 기준마다 이름 (감사4)
    if (st.tab !== 'card') draw();
    renderCard();
  }

  function stationById(id) { return typeof STATIONS !== 'undefined' ? STATIONS.find(function (s) { return s.properties.id === id; }) : null; }

  var CMP_MAX = 4;
  function compareHtml() {
    var rows = st.cmp.map(function (id) { return rowsById.get(id); }).filter(Boolean);
    if (!rows.length) return '';
    var inv = invest() && typeof StationPrice !== 'undefined' && StationPrice.isReady();
    var td = function (x) { return '<td>' + x + '</td>'; };
    var h = '<div class="mm-cmp"><b>비교 (' + rows.length + '/' + CMP_MAX + ')</b> <span class="mm-src">' + WLABEL[st.w] + ' 기준 · ' + (st.y === 'all' ? '전체 개통 가정' : st.y + '년까지') + '</span>' +
      '<table><tr><th></th>' + rows.map(function (r) { return '<th>' + esc(r.name) + ' <button type="button" class="mm-cx" data-id="' + esc(r.id) + '" aria-label="' + esc(r.name) + ' 비교에서 빼기">×</button></th>'; }).join('') + '</tr>' +
      '<tr><th>지금</th>' + rows.map(function (r) { return td(r.isNew ? '못 감' : fm(r.now.min) + '분'); }).join('') + '</tr>' +
      '<tr><th>개통 후</th>' + rows.map(function (r) { return td(fm(r.aft.min) + '분'); }).join('') + '</tr>' +
      '<tr><th>줄어듦</th>' + rows.map(function (r) { var g = Logic.gainOf(r); return td(r.isNew ? '신규' : g > 0 ? '−' + g + '분' : '0분'); }).join('') + '</tr>' +
      '<tr><th>순위</th>' + rows.map(function (r) { return td(r.change == null ? '→ ' + r.aft.rank + '위' : r.now.rank + '→' + r.aft.rank + '위'); }).join('') + '</tr>';
    if (inv) {
      h += '<tr><th>평당(전용)</th>' + rows.map(function (r) { var p = StationPrice.of(r.id); return td(p && p.medianPerPyeong != null ? esc(StationPrice.pp(p.medianPerPyeong)) + (p.deals < 5 ? '(적음)' : '') : '—'); }).join('') + '</tr>';
      if (typeof StationJeonse !== 'undefined' && StationJeonse.isReady && StationJeonse.isReady()) h += '<tr><th>전세가율</th>' + rows.map(function (r) { var j = StationJeonse.of(r.id); return td(j && j.r != null ? Math.round(j.r * 100) + '%' : '—'); }).join('') + '</tr>';
    }
    return h + '</table></div>';
  }
  function renderCard() {
    var box = el.querySelector('.mm-card');
    var row = st.sel && rowsById.get(st.sel);
    var cmp = compareHtml();
    box.classList.toggle('on', !!row || st.cmp.length > 0);   // 고른 역·비교가 있을 때만 카드를 키운다 (재생 중엔 높이 그대로)
    if (!row) { box.innerHTML = cmp + '<p class="mm-src">타일을 누르면 여기에 그 역의 지금 → 개통 후 시간과 순위가 나옵니다. 지도에서 역을 눌러도 타일이 골라집니다.</p>'; bindCmp(box); return; }
    var tn = row.now.times || [], ta = row.aft.times || [];
    var cell = function (a, b) { return a == null ? (b == null ? '—' : '지금 못 감 → ' + b + '분') : (b == null ? a + '분' : a + '분 → ' + b + '분' + (a - b > 0 ? ' (−' + Math.round((a - b) * 10) / 10 + ')' : '')); };
    var tier = RTab().tierOf(row), T = RTab().TIERS[tier];
    var h = '<h3>' + esc(row.name) + ' <span class="mm-src">' + esc(row.sgg || row.region || '') + '</span></h3>' +
      '<div>' + esc(T.label) + ' · ' + (row.change == null ? '새로 갈 수 있게 되는 역' : '순위 ' + row.now.rank + '위 → ' + row.aft.rank + '위 (' + (row.change > 0 ? '▲' + row.change : row.change < 0 ? '▼' + (-row.change) : '그대로') + ')') + '</div>' +
      '<table><tr><th>도심</th><td>' + cell(tn[0], ta[0]) + '</td></tr><tr><th>여의도</th><td>' + cell(tn[1], ta[1]) + '</td></tr><tr><th>강남</th><td>' + cell(tn[2], ta[2]) + '</td></tr>' +
      '<tr><th>' + WLABEL[st.w] + ' 기준</th><td>' + cell(fm(row.now.min), fm(row.aft.min)) + '</td></tr></table>';
    if (invest() && typeof StationPrice !== 'undefined' && StationPrice.isReady()) {
      var p = StationPrice.of(row.id);
      if (p && p.medianPerPyeong != null) h += '<div>평당(전용) ' + esc(StationPrice.pp(p.medianPerPyeong)) + ' <span class="mm-src">' + esc(p.dong) + ' 아파트 매매 중위 · 최근 6개월 ' + p.deals + '건' + (p.deals < 5 ? ' (거래 적음)' : '') + '</span></div>';
      if (typeof StationJeonse !== 'undefined' && StationJeonse.isReady && StationJeonse.isReady()) {
        var j = StationJeonse.of(row.id);
        if (j && j.r != null) h += '<div>전세가율 ' + Math.round(j.r * 100) + '%' + (j.r >= 0.8 ? ' (주의)' : '') + ' <span class="mm-src">같은 단지·면적 짝 ' + (j.n || 0) + '쌍 중위 · 집계상 주의 지표</span></div>';
      }
      // 가격 흐름 2023~ 반기 막대 (G2, 2026-11-13) — 역 상세 시세 탭과 같은 그림
      if (typeof StationTrend !== 'undefined' && StationTrend.isReady()) h += StationTrend.sectionHtml(row.id);
    }
    h += '<p class="mm-src">시간 = 업무지구까지 열차 대기 뺀 비교용 추정 · ' + (st.y === 'all' ? '시기 미정 노선까지 모두 개통 가정' : st.y + '년까지 개통한다고 가정') +
      ' · <a href="data.html" target="_blank" rel="noopener">출처</a>' + (doc.updated ? ' · 기준 ' + esc(doc.updated) : '') + '</p>' +
      '<div class="mm-acts"><button type="button" data-a="map">지도에서 보기</button><button type="button" data-a="detail">역 상세 열기</button>' +
      (st.cmp.indexOf(row.id) >= 0 ? '<button type="button" data-a="cmp" disabled>비교에 있음</button>' : '<button type="button" data-a="cmp"' + (st.cmp.length >= CMP_MAX ? ' disabled title="최대 4역"' : '') + '>비교에 추가</button>') + '</div>';
    box.innerHTML = cmp + h;
    bindCmp(box);
    var cb = box.querySelector('[data-a="cmp"]');
    if (cb && !cb.disabled) cb.addEventListener('click', function () { if (st.cmp.length < CMP_MAX && st.cmp.indexOf(row.id) < 0) { st.cmp.push(row.id); track('market_map_compare_add'); renderCard(); } });
    box.querySelector('[data-a="map"]').addEventListener('click', function () { flyTo(row.id); if (isMobile()) setTab('map'); });
    box.querySelector('[data-a="detail"]').addEventListener('click', function () { openDetail(row.id); });
  }

  // 이미지 저장 — 타일 배치를 1200×(조건) 캔버스에 다시 그린다 (DOM 캡처 라이브러리 없이)
  function pngCanvas() {
    if (!model) return null;
    var W = 1200, HEAD = 120, FOOT = 70, H = 760;
    var c = document.createElement('canvas'); c.width = W; c.height = HEAD + H + FOOT;
    var g = c.getContext('2d');
    var font = function (px, w) { return (w || 'normal') + ' ' + px + 'px "Pretendard Variable", Pretendard, "Noto Sans KR", sans-serif'; };
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#1565c0'; g.font = font(18, '700'); g.fillText('RAIL MARKET MAP · 한국철도맵', 24, 34);
    g.fillStyle = '#111827'; g.font = font(30, '800'); g.fillText('개통하면 어느 역이 얼마나 빨라지나', 24, 72);
    g.fillStyle = '#5b6470'; g.font = font(16);
    var cond = (st.y === 'all' ? '모든 계획 노선 개통 가정' : st.y + '년까지 개통 가정') + ' · ' + WLABEL[st.w] + ' 기준 · ' +
      (st.color === 'tier' ? '색 = 순위 변화' : st.color === 'jeonse' ? '색 = 전세가율' : st.color === 'price' ? '색 = 평당가(전용)' : '색 = 빨라지는 분') + ' · ' + model.total + '역';
    g.fillText(cond, 24, 102);
    var m2 = { groups: model.groups.map(function (G) { return { name: G.name, value: G.value, tiles: G.tiles.map(function (t) { return { v: t.v, row: t.row, color: t.color, gain: t.gain }; }) }; }), total: model.total };
    Logic.layout(m2, W - 48, H, 22);
    m2.groups.forEach(function (G) {
      var r = G.rect; if (!r) return;
      g.fillStyle = '#f3f4f6'; g.fillRect(24 + r.x, HEAD + r.y, r.w, r.h);
      g.fillStyle = '#111827'; g.font = font(14, '800'); g.fillText((G.name + ' · ' + G.tiles.length).slice(0, Math.max(3, Math.floor(r.w / 9))), 24 + r.x + 5, HEAD + r.y + 16);
      G.tiles.forEach(function (t) {
        var q = t.rect; if (!q || q.w < 1) return;
        var x = 24 + q.x, y = HEAD + q.y;
        g.fillStyle = t.color.bg; g.fillRect(x + 0.5, y + 0.5, q.w - 1, q.h - 1);
        if (q.w > 40 && q.h > 18) {
          g.fillStyle = t.color.fg; g.font = font(13, '700');
          var nm = t.row.name; while (nm.length > 1 && g.measureText(nm).width > q.w - 6) nm = nm.slice(0, -1);
          g.fillText(nm, x + 3, y + 15);
          if (q.h > 34 && st.color === 'gain') { g.font = font(12); g.fillText(t.gain == null ? (t.row.isNew ? '신규' : '—') : (t.gain > 0 ? '−' + t.gain + '분' : '0분'), x + 3, y + 31); }
        }
      });
    });
    // 범례 + 출처 + 한계
    var leg = st.color === 'tier' ? ['rocket', 'up', 'flat', 'down', 'new'].map(function (k) { return [Logic.TIER_COLORS[k].bg, RTab().TIERS[k].label]; })
      : st.color === 'jeonse' ? Logic.JEONSE_BINS.map(function (b) { return [b.bg, b.label]; })
      : st.color === 'price' ? Logic.PRICE_BINS.map(function (b) { return [b.bg, b.label]; })
      : Logic.GAIN_BINS.map(function (b) { return [b.bg, b.label]; }).concat([[Logic.NEW_COLOR.bg, '신규']]);
    var lx = 24, ly = HEAD + H + 26;
    g.font = font(13);
    leg.forEach(function (L) { g.fillStyle = L[0]; g.fillRect(lx, ly - 11, 14, 14); g.fillStyle = '#374151'; g.fillText(L[1], lx + 18, ly); lx += 18 + g.measureText(L[1]).width + 16; });
    g.fillStyle = '#5b6470'; g.font = font(12);
    g.fillText('업무지구까지 열차 대기 뺀 추정 시간으로 본 교통 접근성 · 집값이나 투자수익 예측이 아닙니다 · 출처 plazalabs.github.io/kr-rail-map/data.html' + (doc && doc.updated ? ' · 기준 ' + doc.updated : ''), 24, ly + 28);
    return c;
  }
  function savePng() {
    var c = pngCanvas(); if (!c) return;
    track('market_map_share', { 종류: '이미지' });
    c.toBlob(function (blob) {
      if (!blob) { note('이미지를 만들지 못했습니다'); return; }
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = '한국철도맵_타일지도_' + (st.y === 'all' ? '전체' : st.y) + '.png'; a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
      note('타일 지도 이미지를 저장했습니다');
    }, 'image/png');
  }

  function bindCmp(box) {
    box.querySelectorAll('.mm-cx').forEach(function (b) { b.addEventListener('click', function () { st.cmp = st.cmp.filter(function (x) { return x !== b.dataset.id; }); renderCard(); }); });
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
    if (['deals', 'supply', 'equal'].indexOf(o.size) >= 0) st.size = o.size;
    if (['list', 'tiles', 'matrix', 'scatter', 'bands'].indexOf(o.view) >= 0) st.view = o.view;
    if (o.focus && String(o.focus).length < 40) st.focus = String(o.focus);
    if (o.band && /^b[0-4n]$/.test(String(o.band))) st.band = String(o.band);   // 없는 묶음이면 compute 가 풀어 준다
    if (st.view === 'scatter' && !invest()) st.view = 'tiles';
    if (st.size !== 'equal' && !invest()) st.size = 'equal';
    if ((st.color === 'jeonse' || st.color === 'price') && !invest()) st.color = 'gain';
    if (st.color === 'jeonse' || st.color === 'price' || st.size === 'deals') ensurePrice();
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
    stopPlay();
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
    if (q.get('market') === '1') open({ sel: q.get('st'), y: q.get('y'), w: q.get('w'), color: q.get('c'), group: q.get('g'), scope: q.get('s'), view: q.get('v'), focus: q.get('f'), band: q.get('b') });
  }

  global.MarketMap = { Logic: Logic, init: init, open: open, close: close, pick: pick,
    isOpen: function () { return isOpen; }, state: function () { return { band: st.band, focus: st.focus, view: st.view, w: st.w, y: st.y, group: st.group, size: st.size, color: st.color, sel: st.sel, tab: st.tab }; },
    model: function () { return model; }, _pngCanvas: function () { return pngCanvas(); }, playing: function () { return !!playT; } };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports) module.exports = (typeof window !== 'undefined' ? window : globalThis).MarketMap;
