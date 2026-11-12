/* RocketPanel — 지도 안 'GTX 떡상' 패널 (디자인 개편 v109, 2026-11-12)
 *
 * 툴바 '🚀 GTX 떡상' 을 누르면 지도 오른쪽(PC) 카드 / 아래쪽(휴대폰) 불투명 시트가 열린다.
 *   - 문장형 제목: '2031년, 광운대는 강남까지 9분'
 *   - 기준 4개(평균·도심·여의도·강남), 개통 연도 칩 + ▶ 재생
 *   - 고른 역 카드: 지금 순위에 취소선 → 개통 후 순위, 연도별 순위 곡선(재생 때 그려짐), 업무지구 3곳 시간 막대
 *   - 그 해에 가장 많이 오르는 역 TOP 10 (누르면 지도가 그 역으로 간다)
 * 지도의 역 점 색(js/rocket-map.js)도 같은 기준·연도로 다시 칠한다.
 * 계산은 js/rank.js(RankTable) 그대로라 순위표(rank.html)와 숫자가 같다.
 * 주소: ?rocket=1[&st=역ID][&y=2031][&w=gbd] 로 바로 연다.
 * Logic(순수 계산)은 node 시험용으로 따로 내보낸다 (tests/rocket-panel.test.js).
 */
(function (global) {
  'use strict';

  /* ---------- 순수 계산 ---------- */
  var WEIGHT_LABEL = { avg: '평균', cbd: '도심', ybd: '여의도', gbd: '강남' };
  // 권역 — 그 안 역 중 가장 빠른 역까지의 시간이라 '강남'이 아니라 '강남권'이다 (감사 이전1, 2026-11-13)
  var DEST = ['도심권', '여의도권', '강남권'];
  var HUB_NOTE = '도심권 = 시청·광화문·종각·서울역, 여의도권 = 여의도·여의나루, 강남권 = 강남·역삼·선릉·삼성 — 그중 가장 빠른 역까지';

  // 받침이 있으면 '은', 없으면 '는' (한글이 아니면 '는')
  function topic(name) {
    var c = (name || '').charCodeAt((name || '').length - 1);
    if (c >= 0xAC00 && c <= 0xD7A3) return name + (((c - 0xAC00) % 28) ? '은' : '는');
    return name + '는';
  }
  function when(y) { return y === 'all' ? '모두 개통하면' : y + '년,'; }
  function rankText(rk, tie) { return rk == null ? '—' : (tie ? '공동 ' : '') + rk + '위'; }
  // 큰 순위 숫자: 보이는 숫자만 올라가고(css .rkp-now[data-n]) 진짜 글자는 최종값 (작업 6)
  // countFrom: 숫자가 어디서부터 올라갈지. null 이면 움직이지 않고 바로 최종값 (재생이 아닌 다시 그리기)
  var countFrom = null, lastHero = { sel: undefined, rank: null };
  function rankBig(rk, tie) {
    if (rk == null || !(rk > 0) || rk > 9999) return '<b class="rkp-now">' + rankText(rk, tie) + '</b>';
    if (countFrom == null) return '<b class="rkp-now">' + rankText(rk, tie) + '</b>';
    return '<b class="rkp-now" data-n="' + rk + '" data-pre="' + (tie ? '공동 ' : '') + '" style="--rkp-n:' + rk + ';--rkp-from:' + countFrom + '"><span class="rkp-now-t">' + rankText(rk, tie) + '</span></b>';
  }

  // 가장 많이 빨라지는 업무지구 (지금 갈 수 없던 곳이 생기면 그곳)
  function bestDest(r) {
    var best = -1, gain = -Infinity;
    for (var i = 0; i < 3; i++) {
      var a = r.aft.times && r.aft.times[i], n = r.now.times && r.now.times[i];
      if (a == null) continue;
      var g = n == null ? 1e9 : n - a;
      if (g > gain) { gain = g; best = i; }
    }
    return { i: best, gain: gain };
  }

  // 문장형 제목
  function titleOf(r, y) {
    if (!r) return '개통하면 우리 역은 몇 등이 될까요?';
    var b = bestDest(r);
    if ((r.isNew || (r.change != null && r.change > 0)) && b.i >= 0 && b.gain > 0) {
      return when(y) + ' ' + topic(r.name) + ' ' + DEST[b.i] + '까지 ' + r.aft.times[b.i] + '분';
    }
    return topic(r.name) + ' ' + (y === 'all' ? '개통 후에도' : y + '년에도') + ' ' + rankText(r.aft.rank, r.tie);
  }

  // 기본 연도 — 모두 개통했을 때 떡상 역 수의 80% 를 처음 넘는 해 (지금 자료로는 2031)
  function defaultYear(doc) {
    if (!doc || !doc.years || !doc.years.length || typeof RankTable === 'undefined') return 'all';
    var count = function (at) {
      return RankTable.compute(doc, { weight: 'avg', region: 'capital', at: at }).rows
        .filter(function (r) { return RankTable.tierOf(r) === 'rocket'; }).length;
    };
    var all = count('all');
    if (!all) return 'all';
    for (var i = 0; i < doc.years.length; i++) {
      var y = String(doc.years[i]);
      if (count(y) >= all * 0.8) return y;
    }
    return 'all';
  }

  // 연도별 순위 곡선 점 — [{k:'지금'|'2027'…, rank}]
  function curvePoints(doc, id, opts) {
    if (!doc) return [];
    var pts = [];
    var stops = (doc.years || []).map(String);
    stops.forEach(function (y, i) {
      var res = RankTable.compute(doc, { weight: opts.weight, region: 'capital', at: y, wait: opts.wait });
      var r = res.rows.find(function (x) { return x.id === id; });
      if (!r) return;
      if (i === 0) pts.push({ k: '지금', rank: r.now.rank });
      pts.push({ k: y, rank: r.aft.rank });
    });
    return pts.filter(function (p) { return p.rank != null; });
  }

  // 곡선 SVG 경로 (순위 1 이 위). 점 사이를 부드러운 곡선으로.
  function curvePath(pts, w, h, pad) {
    if (pts.length < 2) return { d: '', xy: [] };
    var lo = Math.min.apply(null, pts.map(function (p) { return p.rank; }));
    var hi = Math.max.apply(null, pts.map(function (p) { return p.rank; }));
    if (hi === lo) hi = lo + 1;
    var xy = pts.map(function (p, i) {
      return [pad + (w - 2 * pad) * i / (pts.length - 1), pad + (h - 2 * pad) * (p.rank - lo) / (hi - lo)];
    });
    var d = 'M' + xy[0][0].toFixed(1) + ' ' + xy[0][1].toFixed(1);
    for (var i = 1; i < xy.length; i++) {
      var mx = (xy[i - 1][0] + xy[i][0]) / 2;
      d += ' C' + mx.toFixed(1) + ' ' + xy[i - 1][1].toFixed(1) + ' ' + mx.toFixed(1) + ' ' + xy[i][1].toFixed(1) + ' ' + xy[i][0].toFixed(1) + ' ' + xy[i][1].toFixed(1);
    }
    return { d: d, xy: xy };
  }

  // 그 역을 오르게 하는 새 노선 (개통 전 노선) + 개통 연도
  function newLinesOf(doc, row) {
    var out = [];
    (row.lines || []).forEach(function (lid) {
      var ln = doc.lines && doc.lines[lid];
      if (!ln || ln.s === 'open') return;
      var y = null;
      Object.keys(doc.year_lines || {}).forEach(function (k) { if (doc.year_lines[k].indexOf(lid) >= 0) y = k; });
      out.push({ id: lid, n: ln.n, c: ln.c, y: y });
    });
    return out;
  }

  var Logic = { topic: topic, titleOf: titleOf, bestDest: bestDest, defaultYear: defaultYear, curvePoints: curvePoints, curvePath: curvePath, newLinesOf: newLinesOf, rankText: rankText, WEIGHT_LABEL: WEIGHT_LABEL, DEST: DEST };

  if (typeof document === 'undefined') { global.RocketPanel = { Logic: Logic }; return; }

  /* ---------- 화면 ---------- */
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var mapRef = null, stationsRef = null, el = null, doc = null;
  // full: 패널 안 전체 순위(예전엔 rank.html 로 넘어갔다 — 회장님: 화면 바뀌지 말고 한 화면에, 2026-11-12)
  var st = { w: 'avg', y: null, wait: false, sel: null, full: false, q: '', sort: 'rise', n: 50 };
  var isOpen = false, turnedLayerOn = false, selfToggle = false, playT = null, tip = null, cache = {};
  var mobile = function () { return global.matchMedia && global.matchMedia('(max-width: 980px)').matches; };

  function res() {
    var k = st.w + '|' + st.y + '|' + (st.wait ? 1 : 0);
    if (!cache[k]) {
      var r = RankTable.compute(doc, { weight: st.w, region: 'capital', at: st.y, wait: st.wait });
      var byId = {};
      r.rows.forEach(function (x) { byId[x.id] = x; });
      cache[k] = { rows: r.rows, total: r.total, byId: byId };
    }
    return cache[k];
  }

  function build() {
    el = document.createElement('section');
    el.id = 'rocket-panel';
    // 패널이 생긴 뒤에야 버튼이 가리킬 수 있다 (axe aria-valid-attr-value — 감사 N9, 2026-11-13)
    var rb = document.getElementById('rocket-btn'); if (rb) rb.setAttribute('aria-controls', 'rocket-panel');
    el.className = 'rkp';
    el.hidden = true;
    el.setAttribute('aria-label', 'GTX 떡상 랭킹');
    el.innerHTML =
      '<button class="rkp-grip mob-only" type="button" aria-label="시트 접기·펴기" aria-expanded="true"><i></i></button>' +
      '<div class="rkp-head"><p class="rkp-eyebrow">GTX 떡상 랭킹 · 수도권 <span id="rkp-total"></span>역</p>' +
      '<button class="rkp-close" type="button" aria-label="떡상 패널 닫기"><i data-ic="close"></i></button></div>' +
      '<h2 class="rkp-title" id="rkp-title" aria-live="polite"></h2>' +
      '<div class="rkp-seg" role="group" aria-label="기준">' +
        Object.keys(WEIGHT_LABEL).map(function (k) { return '<button type="button" data-w="' + k + '" aria-pressed="false">' + WEIGHT_LABEL[k] + '</button>'; }).join('') +
      '</div>' +
      '<div class="rkp-years" role="group" aria-label="이 해까지 개통한 노선으로 보기">' +
        '<button type="button" class="rkp-play" aria-label="연도 차례로 보기"><i data-ic="play"></i></button>' +
        '<div class="rkp-chips" id="rkp-chips"></div>' +
      '</div>' +
      '<div id="rkp-hero"></div>' +
      '<h3 class="rkp-sub" id="rkp-list-h"></h3>' +
      '<div class="rkp-tools" hidden>' +
        '<input type="search" class="rkp-q" placeholder="우리 역 찾기 (예: 노원구, 광운대)" aria-label="순위에서 역 찾기" autocomplete="off">' +
        '<div class="rkp-sort" role="group" aria-label="정렬"><button type="button" data-sort="rise">많이 오른 순</button><button type="button" data-sort="after">개통 후 순위</button><button type="button" data-sort="now">지금 순위</button></div>' +
      '</div>' +
      '<ol class="rkp-list" id="rkp-list" aria-labelledby="rkp-list-h"></ol>' +
      '<button type="button" class="rkp-more" hidden>더 보기</button>' +
      '<button type="button" class="rkp-allbtn" aria-expanded="false"></button>' +
      '<div class="rkp-legend" aria-label="지도 점 색">' +
        '<span><i style="background:#0a8f4a"></i>떡상</span><span><i style="background:#3aa76d"></i>상승</span><span><i style="background:#9aa1a8"></i>보합</span><span><i style="background:#d9701a"></i>상대 하락</span><span><i style="background:#7a3fd0"></i>신규</span>' +
      '</div>' +
      '<div class="rkp-foot">' +
        '<button type="button" class="rkp-wait" aria-pressed="false" title="처음 탈 때·갈아탈 때 출퇴근 시간에 열차를 기다리는 시간을 더합니다"><i data-ic="clock"></i> 배차 포함</button>' +
      '</div>' +
      '<p class="rkp-note">업무지구(도심·여의도·강남)까지 걸리는 시간으로 매긴 수도권 순위 · 공개 자료 바탕 추정값 · <a href="data.html">출처</a></p>';
    document.getElementById('map-wrap').appendChild(el);

    el.querySelector('.rkp-close').addEventListener('click', function () { close(); });
    el.querySelector('.rkp-grip').addEventListener('click', function () {
      var c = el.classList.toggle('is-peek');
      this.setAttribute('aria-expanded', String(!c));
    });
    el.querySelector('.rkp-seg').addEventListener('click', function (e) {
      var b = e.target.closest('[data-w]'); if (!b) return;
      st.w = b.getAttribute('data-w'); render(true);
    });
    el.querySelector('#rkp-chips').addEventListener('click', function (e) {
      var b = e.target.closest('[data-y]'); if (!b) return;
      stopPlay(); st.y = b.getAttribute('data-y'); render(true);
    });
    el.querySelector('.rkp-play').addEventListener('click', function () { playT ? stopPlay() : play(); });
    el.querySelector('.rkp-wait').addEventListener('click', function () { st.wait = !st.wait; render(true); });
    el.querySelector('.rkp-allbtn').addEventListener('click', function () {
      st.full = !st.full; st.n = 50;
      renderList();
      var h = el.querySelector('#rkp-list-h');
      if (h && h.scrollIntoView) h.scrollIntoView({ block: 'start', behavior: 'smooth' });
      if (st.full) { var qi = el.querySelector('.rkp-q'); if (qi && !mobile()) qi.focus({ preventScroll: true }); }
    });
    el.querySelector('.rkp-q').addEventListener('input', function () { st.q = this.value; st.n = 50; renderList(); });
    el.querySelector('.rkp-sort').addEventListener('click', function (e) {
      var b = e.target.closest('[data-sort]'); if (!b) return;
      st.sort = b.getAttribute('data-sort'); st.n = 50; renderList();
    });
    el.querySelector('.rkp-more').addEventListener('click', function () { st.n += 50; renderList(); });
    el.querySelector('#rkp-list').addEventListener('click', function (e) {
      var b = e.target.closest('[data-id]'); if (!b) return;
      select(b.getAttribute('data-id'), { fly: true });
    });
    el.querySelector('#rkp-hero').addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return;
      var act = b.getAttribute('data-act');
      if (act === 'detail') {
        var f = (stationsRef || []).find(function (s) { return s.properties.id === st.sel; });
        if (f && global.showStation) global.showStation(f);
      } else if (act === 'link') {
        copyLink(b);
      } else if (act === 'share') {
        // 패널 안에서 바로 1080×1080 이미지 저장·공유 (예전엔 rank.html 로 넘어갔다)
        var row = res().byId[st.sel];
        if (!row || typeof StationShareImage === 'undefined') return;
        var t0 = b.textContent; b.disabled = true;
        StationShareImage.save(row, { doc: doc, y: st.y, w: st.w, wait: st.wait }).then(function (m) {
          b.disabled = false; if (m) { b.textContent = m; setTimeout(function () { b.textContent = t0; }, 1800); }
        }, function () { b.disabled = false; b.textContent = '저장 실패'; setTimeout(function () { b.textContent = t0; }, 1800); });
      }
    });
    el.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  }

  function chipLabel(y) { return y === 'all' ? '전체' : "'" + String(y).slice(2); }
  function stops() { return (doc.years || []).map(String).concat(['all']); }

  function heroHtml(r) {
    if (!r) return '<p class="rkp-hint">목록이나 지도의 역을 누르면 그 역의 순위 변화를 보여 드려요.</p>';
    var t = RankTable.tierOf(r);
    var where = [r.region, r.sgg].filter(Boolean).join(' ');
    var chg = r.isNew ? '<span class="rkp-chg is-new">신규</span>'
      : (r.change > 0 ? '<span class="rkp-chg up">▲' + r.change + '</span>'
        : (r.change < 0 ? '<span class="rkp-chg down">▼' + (-r.change) + '</span>' : '<span class="rkp-chg">그대로</span>'));
    var before = r.now.rank == null ? '<s class="rkp-was">지금 못 감</s>' : (r.change ? '<s class="rkp-was">' + r.now.rank + '위</s>' : '');
    // 순위 곡선
    var pts = curvePoints(doc, r.id, { weight: st.w, wait: st.wait });
    var cp = curvePath(pts, 132, 52, 6);
    var curIdx = -1;
    pts.forEach(function (p, i) { if (p.k === st.y) curIdx = i; });
    if (st.y === 'all') curIdx = pts.length - 1;
    var svg = cp.d ? '<svg class="rkp-curve" viewBox="0 0 132 52" role="img" aria-label="연도별 순위: ' +
      esc(pts.map(function (p) { return p.k + ' ' + p.rank + '위'; }).join(', ')) + '">' +
      '<path class="rkp-curve-line" d="' + cp.d + '" pathLength="100"/>' +
      cp.xy.map(function (q, i) { return '<circle cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="' + (i === curIdx ? 4 : 2) + '"' + (i === curIdx ? ' class="cur"' : '') + '/>'; }).join('') +
      '</svg>' : '';
    // 업무지구 3곳 시간 막대
    var mx = 0;
    for (var i = 0; i < 3; i++) { [r.now.times && r.now.times[i], r.aft.times && r.aft.times[i]].forEach(function (v) { if (v != null && v > mx) mx = v; }); }
    mx = Math.max(mx, 30);
    var bars = DEST.map(function (nm, i) {
      var n = r.now.times ? r.now.times[i] : null, a = r.aft.times ? r.aft.times[i] : null;
      var pct = function (v) { return v == null ? 0 : Math.max(3, Math.round(100 * v / mx)); };
      return '<div class="rkp-bar"><span class="rkp-bar-l">' + nm + '</span>' +
        '<span class="rkp-track"><i class="was" style="width:' + pct(n) + '%"></i><i class="aft" style="width:' + pct(a) + '%"></i></span>' +
        '<span class="rkp-bar-v">' + (n == null ? '—' : n) + ' → <b>' + (a == null ? '—' : a) + '분</b></span></div>';
    }).join('');
    return '<div class="rkp-hero t-' + t + '">' +
      '<p class="rkp-hero-where">선택한 역 · ' + esc(where || '수도권') + '</p>' +
      '<div class="rkp-hero-main"><div class="rkp-rankline"><span class="rkp-name">' + esc(r.name) + '</span>' + before +
        rankBig(r.aft.rank, r.tie) + chg + '</div>' + svg + '</div>' +
      '<div class="rkp-bars">' + bars + '</div>' +
      '<p class="rkp-hub-note">' + esc(HUB_NOTE) + '</p>' +
      '<div class="rkp-acts"><button type="button" data-act="detail">역 상세</button>' +
        '<button type="button" data-act="link"><i data-ic="link"></i> 링크 복사</button>' +
        '<button type="button" data-act="share"><i data-ic="camera"></i> 공유 이미지</button></div>' +
      '</div>';
  }

  function listHtml(rows, numOf) {
    if (!rows.length) return '<li class="rkp-empty">' + (st.full ? '찾는 역이 없어요.' : '이 해까지는 크게 오르는 역이 없어요.') + '</li>';
    return rows.map(function (r, i) {
      var nl = newLinesOf(doc, r)[0];
      var sub = nl ? '<i style="background:' + esc(nl.c) + '"></i>' + esc(nl.n) + (nl.y ? ' · ' + nl.y : '') : esc(r.region);
      var chg = r.isNew ? '<b class="rkp-chg is-new">신규</b>'
        : (r.change > 0 ? '<b class="rkp-chg up">▲' + r.change + '</b>' : (r.change < 0 ? '<b class="rkp-chg down">▼' + (-r.change) + '</b>' : '<b class="rkp-chg">–</b>'));
      return '<li><button type="button" class="rkp-row' + (r.id === st.sel ? ' is-sel' : '') + '" data-id="' + esc(r.id) + '">' +
        '<span class="rkp-no">' + (numOf ? numOf(r, i) : i + 1) + '</span>' +
        '<span class="rkp-nm"><b>' + esc(r.name) + '</b><small>' + sub + '</small></span>' +
        '<span class="rkp-rt">' + chg + '<small>' + (r.now.rank == null ? '새 길' : r.now.rank) + ' → ' + r.aft.rank + '위</small></span>' +
        '</button></li>';
    }).join('');
  }

  function render(animate) {
    if (!doc || !el) return;
    var R = res();
    var r = st.sel ? R.byId[st.sel] : null;
    el.querySelector('#rkp-total').textContent = R.total;
    el.querySelector('#rkp-title').textContent = titleOf(r, st.y);
    el.querySelectorAll('[data-w]').forEach(function (b) {
      var on = b.getAttribute('data-w') === st.w;
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
    });
    el.querySelector('#rkp-chips').innerHTML = stops().map(function (y) {
      return '<button type="button" data-y="' + y + '" aria-pressed="' + (y === st.y) + '"' + (y === st.y ? ' class="on"' : '') +
        ' aria-label="' + (y === 'all' ? '모두 개통' : y + '년까지 개통') + '">' + chipLabel(y) + '</button>';
    }).join('');
    var wb = el.querySelector('.rkp-wait');
    wb.classList.toggle('on', st.wait); wb.setAttribute('aria-pressed', String(st.wait));
    // 움직임 (작업 6): 처음 열 때·역 고를 때는 0 부터, 연도 재생 때는 지난 연도 순위부터 — 곡선과 같이 0.9초
    var nowRank = r && r.aft ? r.aft.rank : null;
    countFrom = !animate ? null : (lastHero.sel === st.sel && lastHero.rank > 0 && playT ? lastHero.rank : 0);
    el.querySelector('#rkp-hero').innerHTML = heroHtml(r);
    countFrom = null;
    lastHero = { sel: st.sel, rank: nowRank };
    if (animate) {
      var path = el.querySelector('.rkp-curve-line');
      if (path) { path.classList.remove('draw'); void path.getBoundingClientRect(); path.classList.add('draw'); }
    }
    renderList();
    if (typeof StationRocket !== 'undefined') {
      StationRocket.setView({ weight: st.w, at: st.y, wait: st.wait });
      StationRocket.select(st.sel);
    }
    updateTip(r);
  }

  // 목록만 다시 그린다 (찾기 글자를 칠 때마다 지도까지 다시 칠하지 않게)
  function renderList() {
    if (!doc || !el) return;
    var R = res();
    var when = st.y === 'all' ? '모두 개통하면' : st.y + '년까지';
    var tools = el.querySelector('.rkp-tools'), more = el.querySelector('.rkp-more'), allb = el.querySelector('.rkp-allbtn');
    tools.hidden = !st.full;
    allb.setAttribute('aria-expanded', String(st.full));
    allb.textContent = st.full ? '← TOP 10 으로' : '전체 순위 보기 (' + R.total + '역) ↓';
    if (!st.full) {
      var top = RankTable.sortRows(R.rows.filter(function (x) { return !x.isNew && x.change != null && x.change > 0; }), 'rise').slice(0, 10);
      el.querySelector('#rkp-list-h').textContent = when + ' 가장 많이 오르는 역';
      el.querySelector('#rkp-list').innerHTML = listHtml(top);
      more.hidden = true;
      return;
    }
    el.querySelectorAll('.rkp-sort [data-sort]').forEach(function (b) {
      var on = b.getAttribute('data-sort') === st.sort; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
    });
    var rows = RankTable.sortRows(R.rows.filter(function (x) { return RankTable.matches(x, st.q.trim()); }), st.sort);
    var label = { rise: '많이 오른 순', after: '개통 후 순위', now: '지금 순위' }[st.sort];
    el.querySelector('#rkp-list-h').textContent = '전체 ' + rows.length + '역 · ' + when + ' · ' + label;
    // 번호: 순위 정렬이면 그 순위(공동 포함), 오른 순이면 몇 번째
    var numOf = st.sort === 'after' ? function (r) { return r.aft.rank; } : st.sort === 'now' ? function (r) { return r.now.rank == null ? '–' : r.now.rank; } : null;
    el.querySelector('#rkp-list').innerHTML = listHtml(rows.slice(0, st.n), numOf);
    more.hidden = rows.length <= st.n;
    more.textContent = '더 보기 (' + Math.min(50, rows.length - st.n) + '역 더)';
  }

  function updateTip(r) {
    if (tip) { tip.remove(); tip = null; }
    if (!r || !isOpen || !mapRef || typeof maplibregl === 'undefined') return;
    var f = (stationsRef || []).find(function (s) { return s.properties.id === r.id; });
    if (!f) return;
    var chg = r.isNew ? ' <b class="new">신규</b>' : (r.change > 0 ? ' <b class="up">▲' + r.change + '</b>' : (r.change < 0 ? ' <b class="down">▼' + (-r.change) + '</b>' : ''));
    var txt = esc(r.name) + ' ' + (r.now.rank == null ? '' : r.now.rank + '위 → ') + r.aft.rank + '위' + chg;
    tip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'rkp-tip', offset: 16, anchor: 'bottom', focusAfterOpen: false })
      .setLngLat(f.geometry.coordinates).setHTML(txt).addTo(mapRef);
  }

  function flyTo(id) {
    var f = (stationsRef || []).find(function (s) { return s.properties.id === id; });
    if (!f || !mapRef) return;
    var off = mobile() ? [0, -Math.round((el.getBoundingClientRect().height || 0) / 2)] : [-Math.round((el.getBoundingClientRect().width || 0) / 2), 0];
    mapRef.flyTo({ center: f.geometry.coordinates, zoom: Math.max(mapRef.getZoom(), 12), offset: off, duration: 900 });
  }

  function select(id, o) {
    st.sel = id || null;
    render(true);
    if (o && o.fly && id) flyTo(id);
  }

  function play() {
    var s = stops();
    var i = 0;
    var b = el.querySelector('.rkp-play');
    b.innerHTML = Icons.svg('pause'); b.setAttribute('aria-label', '재생 멈추기');
    // 재생 표시(playT)를 먼저 켜서 첫 연도도 지금 보이는 순위부터 움직이게 한다 (0 부터 X)
    playT = setInterval(function () {
      i++;
      if (i >= s.length) { stopPlay(); return; }
      st.y = s[i]; render(true);
    }, 1100);
    st.y = s[0]; render(true);
  }
  function stopPlay() {
    if (!playT) return;
    clearInterval(playT); playT = null;
    var b = el && el.querySelector('.rkp-play');
    if (b) { b.innerHTML = Icons.svg('play'); b.setAttribute('aria-label', '연도 차례로 보기'); }
  }

  function copyLink(btn) {
    if (global.KRTrack) global.KRTrack('링크 복사', { 곳: '떡상' });
    var u = new URL(location.href);
    u.search = '';
    u.hash = '';
    u.searchParams.set('rocket', '1');
    if (st.sel) u.searchParams.set('st', st.sel);
    if (st.y) u.searchParams.set('y', st.y);
    if (st.w !== 'avg') u.searchParams.set('w', st.w);
    var done = function (ok) { var t = btn.textContent; btn.textContent = ok ? '복사됨' : '복사 실패'; setTimeout(function () { btn.textContent = t; }, 1500); };
    try { navigator.clipboard.writeText(u.toString()).then(function () { done(true); }, function () { done(false); }); } catch (e) { done(false); }
  }

  function setBtn(on) {
    document.querySelectorAll('[data-rocket-open]').forEach(function (b) {
      b.classList.toggle('active', on); if (b.tagName === 'BUTTON') b.setAttribute('aria-pressed', String(on));
    });
  }

  function open(o) {
    o = o || {};
    if (!el) build();
    var go = function () {
      doc = StationRocket.doc();
      if (!doc) { if (global.setStatus) global.setStatus('떡상 자료를 불러오지 못했습니다'); return; }
      if (!st.y) st.y = defaultYear(doc);
      if (o.y && (o.y === 'all' || (doc.years || []).map(String).indexOf(String(o.y)) >= 0)) st.y = String(o.y);
      if (o.w && WEIGHT_LABEL[o.w]) st.w = o.w;
      var R = res();
      // 처음엔 아무 역도 고르지 않고 순위부터 (특정 역을 앞세우지 않는다 — 회장님 지시 2026-11-12). 주소에 st= 가 있을 때만 그 역
      st.sel = (o.st && R.byId[o.st]) ? o.st : null;
      isOpen = true;
      el.hidden = false;
      if (global.KRTrack) global.KRTrack('떡상 패널', o.st ? { 링크로: '예' } : null);
      el.classList.remove('is-peek');
      document.body.classList.add('rk-open');
      setBtn(true);
      render(true);
      if (o.fly !== false && st.sel) flyTo(st.sel);
      if (o.focus) { var t = el.querySelector('.rkp-close'); if (t) t.focus(); }
    };
    if (!StationRocket.isOn()) { selfToggle = true; turnedLayerOn = true; var pr = StationRocket.setLayer(true); selfToggle = false; return pr.then(go); }
    return StationRocket.load().then(go);
  }

  function close() {
    stopPlay();
    isOpen = false;
    st.sel = null;   // 다시 열면 순위부터
    st.full = false; st.q = ''; st.n = 50;
    if (el) { var qi = el.querySelector('.rkp-q'); if (qi) qi.value = ''; }
    if (el) el.hidden = true;
    document.body.classList.remove('rk-open');
    setBtn(false);
    if (tip) { tip.remove(); tip = null; }
    if (typeof StationRocket !== 'undefined') {
      StationRocket.select(null);
      StationRocket.setView({});
      if (turnedLayerOn) { turnedLayerOn = false; selfToggle = true; StationRocket.setLayer(false); selfToggle = false; }
    }
    var b = document.querySelector('#toolbar [data-rocket-open]');
    if (b && document.activeElement && document.activeElement !== document.body && !document.activeElement.offsetParent) b.focus();
  }

  // 패널이 열려 있으면 지도에서 누른 역을 패널에서 보여 준다 (app.js map click). 순위가 없는 역은 원래대로.
  function handleMapClick(feature) {
    if (!isOpen || !doc || !feature) return false;
    var id = feature.properties && feature.properties.id;
    if (!id || !res().byId[id]) return false;
    select(id, { fly: false });
    if (mobile()) el.classList.remove('is-peek');
    return true;
  }

  function init(map, stations) {
    mapRef = map; stationsRef = stations;
    document.querySelectorAll('[data-rocket-open]').forEach(function (b) {
      if (b.__rkp) return; b.__rkp = true;
      b.addEventListener('click', function (e) {
        e.preventDefault();
        var dd = b.closest('.tb-dropdown');
        if (dd) { var db = dd.querySelector('.tb-dropbtn'); if (db && db.getAttribute('aria-expanded') === 'true') db.click(); }
        isOpen ? close() : open({ focus: true });
      });
    });
    // 역 상세의 '🚀 떡상 랭킹에서 보기' — 새로고침 없이 역 상세를 닫고 패널에서 그 역을 연다
    if (!document.__rkpSt) {
      document.__rkpSt = true;
      document.addEventListener('click', function (e) {
        var a = e.target.closest && e.target.closest('[data-rocket-st]');
        if (!a || e.ctrlKey || e.metaKey || e.shiftKey) return;
        e.preventDefault();
        if (typeof StationDetail !== 'undefined' && StationDetail.hide) StationDetail.hide();
        var id = a.getAttribute('data-rocket-st');
        if (isOpen) select(id, { fly: true }); else open({ st: id, focus: true });
      });
    }
    // 레이어를 사이드바에서 끄면 패널도 닫는다
    if (typeof StationRocket !== 'undefined' && StationRocket.onToggle) {
      // 패널이 스스로 켜고 끈 것(selfToggle)은 빼고, 사람이 사이드바에서 바꾼 것만 따른다
      StationRocket.onToggle(function (on) { if (selfToggle) return; turnedLayerOn = false; if (!on && isOpen) close(); });
    }
    var q = new URLSearchParams(location.search);
    if (q.get('rocket') === '1') open({ st: q.get('st'), y: q.get('y'), w: q.get('w') });
  }

  global.RocketPanel = {
    Logic: Logic, init: init, open: open, close: close, select: select, handleMapClick: handleMapClick,
    isOpen: function () { return isOpen; },
    state: function () { return { w: st.w, y: st.y, wait: st.wait, sel: st.sel }; },
  };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports) module.exports = (typeof window !== 'undefined' ? window : globalThis).RocketPanel;
