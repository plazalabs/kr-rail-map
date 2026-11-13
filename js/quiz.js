/* 나에게 맞는 역 찾기 — 질문 4개 (영상 기능 1번 · 뮤즈 TASK 2, 2026-11-13)
 *
 * 질문은 계산에 실제로 쓰는 것만 4개 (계산 안 하는 질문을 넣으면 운세가 된다 — 피드백_영상기능23 2-1):
 *   1) 직장(자주 가는 곳) 역      → 통근 계산 목적지 (CommuteMap.compute — 길찾기와 같은 규칙, 환승 대기 포함)
 *   2) 몇 분까지 괜찮아요?        → 30·45·60·90분
 *   3) 집값 예산(아파트 매매)     → 역이 속한 법정동 아파트 매매 중위 총액(js/price.js) ≤ 예산. '상관없음' 가능
 *   4) 개통 예정 노선도 넣을까요?  → 넣으면 개통 후 시간으로 계산
 * TOP 3 규칙 (화면에 그대로 적는다)
 *   시간 안 + 예산 안 역 가운데,
 *     개통 예정 포함: 개통하면 직장까지 줄어드는 분이 큰 순 → 같으면 개통 후 시간이 짧은 순
 *     지금 기준   : 지금 시간이 짧은 순 → 같으면 중위 총액이 낮은 순(예산이 있을 때)
 *   목적지 역과 같은 역은 뺀다. 시세가 없는 역(지방·자료 없음)은 예산을 고르면 뺀다(자료 없음을 0원으로 보지 않는다).
 * 결과 주소: ?quiz=1&d=<역ID>&t=45&b=70000&u=1 — 주소만으로 다시 계산(저장 없음).
 */
(function (global) {
  'use strict';

  var LIMITS = [30, 45, 60, 90];
  var BUDGETS = [0, 50000, 70000, 100000, 150000, 200000];   // 만원, 0 = 상관없음

  var Logic = {
    LIMITS: LIMITS, BUDGETS: BUDGETS,
    budgetLabel: function (b) { return !b ? '상관없음' : (b >= 10000 ? (b / 10000) + '억' : b + '만') + '원 이하'; },
    /* rowsNow/rowsAfter: [{id,name,min}] (CommuteMap.compute 결과, 시간 한도 안)
     * priceOf(id) → 중위 총액(만원) 또는 null
     * opts: { budget, withUnopened, dest }
     * 반환: { top:[{id,name,min,minNow,gain,price}], pool: 조건 맞는 역 수, rule: 문장 } */
    pick: function (rowsNow, rowsAfter, priceOf, opts) {
      opts = opts || {};
      var nowById = new Map((rowsNow || []).map(function (r) { return [r.id, r.min]; }));
      var base = opts.withUnopened ? (rowsAfter || []) : (rowsNow || []);
      var pool = [];
      base.forEach(function (r) {
        if (r.id === opts.dest) return;
        var price = priceOf ? priceOf(r.id) : null;
        if (opts.budget) { if (price == null || price > opts.budget) return; }
        var minNow = nowById.has(r.id) ? nowById.get(r.id) : null;
        var gain = opts.withUnopened ? (minNow == null ? null : minNow - r.min) : 0;
        pool.push({ id: r.id, name: r.name, min: r.min, minNow: minNow, gain: gain, price: price, isNew: opts.withUnopened && minNow == null });
      });
      var g = function (x) { return x.isNew ? 999 : (x.gain || 0); };
      if (opts.withUnopened) pool.sort(function (a, b) { return g(b) - g(a) || a.min - b.min || a.name.localeCompare(b.name, 'ko'); });
      else pool.sort(function (a, b) { return a.min - b.min || ((a.price || 0) - (b.price || 0)) || a.name.localeCompare(b.name, 'ko'); });
      // 같은 이름 역(환승역이 노선마다 따로인 곳)은 한 번만
      var seen = new Set(), top = [];
      for (var i = 0; i < pool.length && top.length < 3; i++) { if (seen.has(pool[i].name)) continue; seen.add(pool[i].name); top.push(pool[i]); }
      var rule = opts.withUnopened
        ? '시간·예산 안의 역 가운데 개통하면 직장까지 가장 많이 줄어드는 순(같으면 개통 후 시간이 짧은 순)'
        : '시간·예산 안의 역 가운데 지금 직장까지 가장 가까운 순' + (opts.budget ? '(같으면 집값 중위값이 낮은 순)' : '');
      return { top: top, pool: pool.length, rule: rule };
    },
    toQuery: function (a) { return '?quiz=1&d=' + encodeURIComponent(a.dest) + '&t=' + a.limit + '&b=' + (a.budget || 0) + '&u=' + (a.withUnopened ? 1 : 0); },
    fromQuery: function (search) {
      var q = new URLSearchParams(search || '');
      if (q.get('quiz') !== '1') return null;
      var t = +q.get('t'), b = +q.get('b');
      return { dest: q.get('d') || null, limit: LIMITS.indexOf(t) >= 0 ? t : 45, budget: BUDGETS.indexOf(b) >= 0 ? b : 0, withUnopened: q.get('u') === '1' };
    },
  };

  if (typeof document === 'undefined') { global.StationQuiz = { Logic: Logic }; return; }

  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var el = null, ans = { dest: null, limit: 45, budget: 0, withUnopened: false }, step = 0, opener = null;

  function css() {
    if (document.getElementById('qz-style')) return;
    var s = document.createElement('style'); s.id = 'qz-style';
    s.textContent =
      '#qz-panel{position:fixed;z-index:960;left:50%;top:50%;transform:translate(-50%,-50%);width:min(440px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;' +
      'background:var(--panel-bg,#fff);color:var(--text,#222);border:1px solid var(--border,#dfe3e8);border-radius:16px;box-shadow:0 14px 40px rgba(0,0,0,.25);padding:16px 18px}' +
      '#qz-panel[hidden]{display:none}' +
      '.qz-top{display:flex;align-items:center;gap:8px}.qz-top p{margin:0;font-size:var(--fs-xs);font-weight:700;color:var(--accent,#1565c0)}' +
      '.qz-close{margin-left:auto;border:0;background:none;color:var(--muted,#5b6470);cursor:pointer;padding:4px 6px;border-radius:6px;font-size:var(--fs-lg)}' +
      '.qz-dots{display:flex;gap:5px;margin:8px 0 10px}.qz-dots i{width:22px;height:4px;border-radius:2px;background:var(--border,#dfe3e8)}.qz-dots i.on{background:var(--accent,#1565c0)}' +
      '#qz-panel h2{margin:0 0 10px;font-size:var(--fs-lg);font-weight:800;letter-spacing:-.02em}' +
      '.qz-opts{display:grid;grid-template-columns:1fr 1fr;gap:8px}' +
      '.qz-opts button,.qz-nav button{font:inherit;font-size:var(--fs-sm);padding:11px 10px;border-radius:10px;border:1px solid var(--border,#ccd);background:var(--panel-bg,#fff);color:var(--text,#222);cursor:pointer}' +
      '.qz-opts button[aria-pressed="true"]{border-color:var(--accent,#1565c0);background:var(--accent,#1565c0);color:#fff;font-weight:700}' +
      '.qz-nav{display:flex;gap:8px;margin-top:12px}.qz-nav .qz-next{margin-left:auto;background:var(--accent,#1565c0);border-color:var(--accent,#1565c0);color:#fff;font-weight:700}' +
      '.qz-nav button:disabled{opacity:.45;cursor:default}' +
      '.qz-in{width:100%;box-sizing:border-box;font:inherit;font-size:var(--fs-md);padding:10px 12px;border:1px solid var(--border,#ccd);border-radius:10px;background:var(--panel-bg,#fff);color:var(--text,#222)}' +
      '.qz-hint{font-size:var(--fs-xs);color:var(--muted,#5b6470);line-height:1.5;margin:8px 0 0}' +
      '.qz-res{list-style:none;margin:0;padding:0;display:grid;gap:8px}' +
      '.qz-res li{border:1px solid var(--border,#e3e6ea);border-radius:12px;padding:10px 12px}' +
      '.qz-res b{font-size:var(--fs-md)}.qz-res .qz-n{display:inline-block;min-width:22px;font-weight:800;color:var(--accent,#1565c0)}' +
      '.qz-res .qz-m{font-size:var(--fs-sm);margin-top:2px}.qz-res .qz-s{font-size:var(--fs-xs);color:var(--muted,#5b6470)}' +
      '.qz-res button{font:inherit;font-size:var(--fs-xs);margin-top:6px;padding:4px 10px;border-radius:8px;border:1px solid var(--border,#ccd);background:var(--panel-bg,#fff);color:var(--text,#222);cursor:pointer}';
    document.head.appendChild(s);
  }

  function build() {
    if (el) return;
    css();
    el = document.createElement('div');
    el.id = 'qz-panel'; el.hidden = true;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'false'); el.setAttribute('aria-label', '나에게 맞는 역 찾기');
    document.body.appendChild(el);
    el.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  }

  function stationById(id) { return typeof STATIONS !== 'undefined' ? STATIONS.find(function (s) { return s.properties.id === id; }) : null; }
  function nameOf(id) { var s = stationById(id); return s ? s.properties.name_ko : ''; }
  function track(n, d) { try { if (global.KRTrack) global.KRTrack(n, d); } catch (e) { /* 무시 */ } }

  function head(title) {
    return '<div class="qz-top"><p>나에게 맞는 역 찾기 · 질문 ' + Math.min(step + 1, 4) + '/4</p>' +
      '<button type="button" class="qz-close" aria-label="닫기"><i data-ic="close"></i></button></div>' +
      '<div class="qz-dots" aria-hidden="true">' + [0, 1, 2, 3].map(function (i) { return '<i class="' + (i <= step ? 'on' : '') + '"></i>'; }).join('') + '</div>' +
      '<h2>' + esc(title) + '</h2>';
  }
  function nav(canNext, last) {
    return '<div class="qz-nav">' + (step > 0 ? '<button type="button" class="qz-prev">이전</button>' : '') +
      '<button type="button" class="qz-next"' + (canNext ? '' : ' disabled') + '>' + (last ? '결과 보기' : '다음') + '</button></div>';
  }
  function hydrate() { if (global.Icons && Icons.hydrate) Icons.hydrate(el); el.querySelector('.qz-close').addEventListener('click', close); }
  function bindNav() {
    var p = el.querySelector('.qz-prev'); if (p) p.addEventListener('click', function () { step--; render(); });
    var n = el.querySelector('.qz-next'); if (n) n.addEventListener('click', function () { step++; render(); });
  }
  function opts(list, cur, label, key) {
    return '<div class="qz-opts" role="group">' + list.map(function (v) {
      return '<button type="button" data-v="' + v + '" aria-pressed="' + (String(cur) === String(v)) + '">' + esc(label(v)) + '</button>';
    }).join('') + '</div>';
  }
  function bindOpts(key, conv) {
    el.querySelectorAll('.qz-opts button').forEach(function (b) {
      b.addEventListener('click', function () { ans[key] = conv(b.dataset.v); step++; render(); });
    });
  }

  function render() {
    if (step === 0) {
      el.innerHTML = head('직장(자주 가는 곳)은 어느 역인가요?') +
        '<div class="ac-wrap"><input id="qz-dest" class="qz-in" placeholder="예: 강남, 여의도, 판교" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" value="' + esc(nameOf(ans.dest)) + '"><div class="ac-list" hidden></div></div>' +
        '<p class="qz-hint">목록에서 고르면 다음으로 넘어갑니다.</p>' + nav(!!ans.dest, false);
      hydrate(); bindNav();
      var inp = el.querySelector('#qz-dest');
      if (inp.dataset) inp.dataset.sid = ans.dest || '';
      if (typeof global.KR_attachAutocomplete === 'function') global.KR_attachAutocomplete(inp);
      inp.addEventListener('ac:pick', function () { if (inp.dataset.sid) { ans.dest = inp.dataset.sid; step = 1; render(); } });
      inp.addEventListener('input', function () { ans.dest = null; el.querySelector('.qz-next').disabled = true; });
      setTimeout(function () { try { inp.focus(); } catch (e) { /* 무시 */ } }, 30);
      return;
    }
    if (step === 1) {
      el.innerHTML = head(nameOf(ans.dest) + '까지 몇 분까지 괜찮아요?') + opts(LIMITS, ans.limit, function (v) { return v + '분 안'; }) +
        '<p class="qz-hint">역에서 역까지 시간입니다(갈아탈 때 기다리는 시간 포함, 집·회사까지 걷는 시간은 빠짐).</p>' + nav(true, false);
      hydrate(); bindNav(); bindOpts('limit', Number); return;
    }
    if (step === 2) {
      el.innerHTML = head('집값 예산은요? (아파트 매매)') + opts(BUDGETS, ans.budget, Logic.budgetLabel) +
        '<p class="qz-hint">역이 속한 <b>법정동의 아파트 매매 중위 총액</b>(최근 6개월, 국토교통부 실거래)으로 비교합니다 — 그 역 바로 앞 집값이 아닙니다. 수도권 역만 자료가 있습니다.</p>' + nav(true, false);
      hydrate(); bindNav(); bindOpts('budget', Number); return;
    }
    if (step === 3) {
      el.innerHTML = head('개통 예정 노선(GTX 등)도 넣어서 볼까요?') +
        '<div class="qz-opts" role="group"><button type="button" data-v="0" aria-pressed="' + !ans.withUnopened + '">지금 운행 중인 노선만</button>' +
        '<button type="button" data-v="1" aria-pressed="' + ans.withUnopened + '">개통 예정도 넣기</button></div>' +
        '<p class="qz-hint">넣으면 개통 후 시간으로 계산합니다 — 개통 시기는 발표 기준이라 바뀔 수 있습니다.</p>' + nav(true, true);
      hydrate(); bindNav(); bindOpts('withUnopened', function (v) { return v === '1'; }); return;
    }
    showResult();
  }

  function needPrice(cb) {
    if (!ans.budget || typeof StationPrice === 'undefined') return cb();
    if (StationPrice.isReady()) return cb();
    if (typeof global.loadDetailData === 'function') { try { global.loadDetailData(); } catch (e) { /* 무시 */ } }
    var n = 0, iv = setInterval(function () { n++; if (StationPrice.isReady() || n > 40) { clearInterval(iv); cb(); } }, 250);
  }

  function showResult() {
    step = 4;
    el.innerHTML = '<div class="qz-top"><p>나에게 맞는 역 찾기 · 결과</p><button type="button" class="qz-close" aria-label="닫기"><i data-ic="close"></i></button></div><p class="qz-hint">계산 중…</p>';
    hydrate();
    needPrice(function () {
      var CM = global.CommuteMap;
      if (!CM || !CM.compute) { el.querySelector('.qz-hint').textContent = '통근 계산 모듈을 불러오지 못했습니다.'; return; }
      var rowsNow = CM.compute(ans.dest, ans.limit, { withUnopened: false });
      var rowsAft = ans.withUnopened ? CM.compute(ans.dest, ans.limit, { withUnopened: true }) : null;
      var priceOf = function (id) { if (typeof StationPrice === 'undefined' || !StationPrice.isReady()) return null; var p = StationPrice.of(id); return p && p.medianPrice ? p.medianPrice : null; };
      var r = Logic.pick(rowsNow, rowsAft, priceOf, { budget: ans.budget, withUnopened: ans.withUnopened, dest: ans.dest });
      track('유형 테스트 결과', { 한도: ans.limit, 예산: ans.budget ? '있음' : '없음', 개통: ans.withUnopened ? '포함' : '지금' });
      var cond = esc(nameOf(ans.dest)) + '까지 ' + ans.limit + '분 안 · 예산 ' + esc(Logic.budgetLabel(ans.budget)) + ' · ' + (ans.withUnopened ? '개통 예정 포함' : '지금 운행 중');
      var h = '<div class="qz-top"><p>나에게 맞는 역 찾기 · 결과</p><button type="button" class="qz-close" aria-label="닫기"><i data-ic="close"></i></button></div>' +
        '<h2 style="margin-top:8px">' + (r.top.length ? '이런 역은 어때요?' : '조건에 맞는 역이 없어요') + '</h2>' +
        '<p class="qz-hint" style="margin:0 0 8px">' + cond + ' · 조건에 맞는 역 ' + r.pool + '곳</p>';
      if (r.top.length) {
        h += '<ol class="qz-res">' + r.top.map(function (x, i) {
          var t = ans.withUnopened
            ? (x.isNew ? '지금은 철도로 못 감 → 개통 후 ' + x.min + '분' : '지금 ' + x.minNow + '분 → 개통 후 ' + x.min + '분' + (x.gain > 0 ? ' (−' + x.gain + '분)' : ''))
            : '직장까지 약 ' + x.min + '분';
          var pr = x.price != null && typeof StationPrice !== 'undefined' ? '법정동 아파트 매매 중위 ' + esc(StationPrice.won(x.price)) : '';
          return '<li><span class="qz-n">' + (i + 1) + '</span><b>' + esc(x.name) + '</b><div class="qz-m">' + t + '</div>' + (pr ? '<div class="qz-s">' + pr + '</div>' : '') +
            '<button type="button" data-id="' + esc(x.id) + '">지도에서 보기</button></li>';
        }).join('') + '</ol>';
      } else {
        h += '<p class="qz-hint">시간을 늘리거나 예산을 \'상관없음\'으로 바꿔 보세요.</p>';
      }
      h += '<p class="qz-hint"><b>고른 규칙</b>: ' + esc(r.rule) + '. 시간은 역 간 추정(시각표 아님), 집값은 법정동 단위 참고값입니다 — 투자 권유가 아닙니다.</p>' +
        '<div class="qz-nav"><button type="button" class="qz-again">다시 하기</button><button type="button" class="qz-share">결과 링크 복사</button>' +
        '<button type="button" class="qz-next qz-commute">통근권 지도로 보기</button></div>';
      el.innerHTML = h;
      hydrate();
      el.querySelectorAll('.qz-res button[data-id]').forEach(function (b) {
        b.addEventListener('click', function () {
          var s = stationById(b.dataset.id); if (!s) return;
          close();
          try { map.flyTo({ center: s.geometry.coordinates, zoom: 13.5, duration: 600 }); } catch (e) { /* 무시 */ }
          if (typeof global.showStation === 'function') global.showStation(s, s.geometry.coordinates);
        });
      });
      el.querySelector('.qz-again').addEventListener('click', function () { step = 0; render(); });
      el.querySelector('.qz-share').addEventListener('click', function () {
        var url = location.origin + location.pathname + Logic.toQuery(ans) + location.hash;
        var done = function () { var s = document.getElementById('status'); if (s) s.textContent = '결과 링크를 복사했습니다'; track('유형 테스트 공유'); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, done); else done();
        try { history.replaceState(null, '', Logic.toQuery(ans) + location.hash); } catch (e) { /* 무시 */ }
      });
      el.querySelector('.qz-commute').addEventListener('click', function () {
        close();
        if (CM.show) { try { CM.show(ans.dest); } catch (e) { var b = document.getElementById('commute-btn'); if (b) b.click(); } }
      });
      var first = el.querySelector('.qz-res button, .qz-again'); if (first) try { first.focus(); } catch (e) { /* 무시 */ }
    });
  }

  function open(a) {
    build();
    opener = document.activeElement;
    if (a) { ans = Object.assign({ dest: null, limit: 45, budget: 0, withUnopened: false }, a); }
    step = (a && a.dest) ? 4 : 0;
    el.hidden = false;
    track('유형 테스트 열기');
    if (step === 4) showResult(); else render();
  }
  function close() {
    if (!el) return;
    el.hidden = true;
    if (opener && opener.isConnected && opener.focus) { try { opener.focus({ preventScroll: true }); } catch (e) { /* 무시 */ } }
  }
  function init() {
    document.querySelectorAll('[data-quiz-open]').forEach(function (b) { b.addEventListener('click', function () { open(null); }); });
    var q = Logic.fromQuery(location.search);
    if (q && q.dest && stationById(q.dest)) open(q);
  }

  global.StationQuiz = { Logic: Logic, init: init, open: open, close: close, isOpen: function () { return !!el && !el.hidden; }, answers: function () { return ans; } };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports) module.exports = (typeof window !== 'undefined' ? window : globalThis).StationQuiz;
