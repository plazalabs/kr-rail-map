/* 처음 온 사람 안내 (Guide) + 사이드바 '빠른 시작' — 2026-11-11
 *
 * 빠른 시작: 사이드바 맨 위(검색창 아래)에 핵심 기능 네 가지를 늘 보이게 둔다. 카드는 한 번만 뜨므로
 *   (회장님: '처음 화면에 있던 게 안 보인다') 늘 누를 수 있는 자리가 따로 있어야 한다. 휴대폰은 서랍 안 맨 위.
 *
 * 왜 필요한가
 *   길찾기·통근권·투자 모드·노선도는 툴바와 '분석' 메뉴 안에 있다. 처음 온 사람은 지도만 보고
 *   무엇을 할 수 있는지 모른 채 떠난다. 첫 방문에 한 번, 할 수 있는 일 네 가지를 바로 누를 수 있게 보여 준다.
 *
 * 규칙
 *   - 첫 방문에만 뜬다. 닫거나 항목을 누르면 다시 뜨지 않는다 (localStorage 'krrail-guide-seen').
 *   - 링크로 특정 화면을 연 경우(?from= / ?line= / ?mode= 등 주소에 질문이 있으면)는 띄우지 않는다 — 그 사람은 목적이 있다.
 *   - 저장소를 못 쓰면(사생활 보호 모드) 이번 방문에만 뜨고, 닫으면 이번 방문 동안은 다시 안 뜬다.
 *   - 지도를 가리지 않게 작게, 휴대폰에서는 아래 툴바 위에 띄운다. Esc·✕ 로 닫는다.
 */
(function (global) {
  'use strict';
  var KEY = 'krrail-guide-seen';
  var el = null;

  function seen() {
    try { return global.localStorage.getItem(KEY) === '1'; } catch (e) { return false; }
  }
  function markSeen() {
    try { global.localStorage.setItem(KEY, '1'); } catch (e) { /* 저장 못 해도 닫기는 된다 */ }
  }
  function close() {
    markSeen();
    if (el) { el.remove(); el = null; }
  }
  function click(id) {
    var b = document.getElementById(id);
    if (b) b.click();
  }

  var ITEMS = [
    ['route', '길찾기', '두 역 사이 시간·환승·요금, 개통 전후 비교', function () {
      var p = document.getElementById('route-panel');
      if (p && p.hidden) click('route-btn');
      var f = document.getElementById('route-from'); if (f) try { f.focus(); } catch (e) { /* 무시 */ }
    }],
    ['clock', '통근권 찾기', '직장까지 45분 안에 닿는 역을 지도에', function () {
      if (global.CommuteMap) global.CommuteMap.show();
    }],
    ['home', '투자 모드', '역 주변 시세·전세가율·실거래·공급 물량', function () {
      if (global.KR_MODE) global.KR_MODE.toggle();
    }],
    ['map', '노선도', '전국 노선을 지하철 노선도처럼', function () { click('diagram-btn'); }],
  ];
  function itemHtml(it, i, cls) {
    // title: 휴대폰 안내 카드는 설명 글을 숨기므로(J8) 길게 누르거나 마우스를 올리면 보이게
    return '<button type="button" class="' + cls + '" data-i="' + i + '" title="' + it[1] + ' — ' + it[2] + '"><span class="gd-ic" aria-hidden="true">' + Icons.svg(it[0]) +
      '</span><span><b>' + it[1] + '</b><small>' + it[2] + '</small></span></button>';
  }
  function run(i) {
    // 휴대폰: 서랍을 닫아야 지도·패널이 보인다
    if (global.UI && global.UI.closeDrawer && document.body.classList.contains('drawer-open')) global.UI.closeDrawer();
    try { ITEMS[i][3](); } catch (e) { /* 모듈이 없으면 조용히 */ }
    syncQuick();
  }

  /* 사이드바 '빠른 시작' — 늘 보이는 네 칸. 투자 모드 칸은 켜짐/꺼짐을 보여 준다 */
  function renderQuick() {
    var box = document.getElementById('quick-start');
    if (!box || box.childElementCount) return;
    // J7 가안(2026-11-14): '길찾기'(0번)는 왼쪽 레일에 있어 사이드바 빠른 시작에서는 뺀다 — 첫 방문 안내 카드에는 그대로
    box.innerHTML = ITEMS.map(function (it, i) { return i === 0 ? '' : itemHtml(it, i, 'qs-item'); }).join('');
    box.querySelectorAll('.qs-item').forEach(function (b) {
      b.addEventListener('click', function () { run(+b.getAttribute('data-i')); });
    });
    if (global.KR_MODE && global.KR_MODE.onChange) global.KR_MODE.onChange(syncQuick);
    syncQuick();
  }
  function syncQuick() {
    var b = document.querySelector('#quick-start .qs-item[data-i="2"]');
    if (!b || !global.KR_MODE) return;
    var on = global.KR_MODE.isInvest();
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.querySelector('b').textContent = on ? '투자 모드 켜짐' : '투자 모드';
  }

  // force: '사용법' 버튼으로 다시 열 때 — 이미 본 사람·링크로 온 사람도 연다 (작업 8)
  function show(force) {
    if (el) return;
    if (!force && seen()) return;
    if (!force && global.location && global.location.search) return;   // 링크로 들어온 사람
    el = document.createElement('div');
    el.id = 'guide-card';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', '처음 오셨나요 — 할 수 있는 일');
    el.innerHTML =
      // 메타 피드백(2026-11-15): 첫 30초에 '이 앱이 나에게 뭘 해 주는지'가 없었다 → 질문 한 줄 + 우리 동네 역 입력.
      '<div class="gd-head"><b class="gd-q" id="gd-q">GTX 개통 후, 우리 동네는 얼마나 가까워질까?</b>' +
      '<button type="button" class="gd-close" aria-label="안내 닫기"><i data-ic="close"></i></button></div>' +
      '<div class="gd-ask"><input id="gd-st" type="text" autocomplete="off" spellcheck="false" enterkeyhint="search"' +
      ' role="combobox" aria-autocomplete="list" aria-expanded="false" aria-labelledby="gd-q"' +
      ' placeholder="우리 동네 역 이름 (예: 종로3가)"><div class="ac-list" hidden></div></div>' +
      '<div class="gd-ans" aria-live="polite"></div>' +
      '<div class="gd-sub">이런 것도 할 수 있어요</div>' +
      '<div class="gd-list">' + ITEMS.map(function (it, i) { return itemHtml(it, i, 'gd-item'); }).join('') + '</div>' +
      '<div class="gd-foot">이 버튼들은 왼쪽 메뉴 맨 위 <b>빠른 시작</b>에 늘 있어요</div>';
    el.querySelector('.gd-close').addEventListener('click', close);
    el.querySelectorAll('.gd-item').forEach(function (b) {
      b.addEventListener('click', function () {
        var i = +b.getAttribute('data-i');
        close();
        run(i);
      });
    });
    // 후보 목록이 열린 채 Esc → 목록만 닫는다(카드까지 닫지 않게). 자동완성보다 먼저 상태를 적어 둔다
    var inp = el.querySelector('#gd-st'), listOpen = false;
    inp.addEventListener('keydown', function () { listOpen = inp.getAttribute('aria-expanded') === 'true'; });
    el.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (e.target === inp && listOpen) return;
      close();
    });
    var host = document.getElementById('map-wrap') || document.body;
    host.appendChild(el);
    if (typeof global.KR_attachAutocomplete === 'function') global.KR_attachAutocomplete(inp);
    var pre = function () { if (global.KR_loadDetailData) try { global.KR_loadDetailData(); } catch (e) { /* 무시 */ } };
    inp.addEventListener('focus', pre, { once: true });
    inp.addEventListener('ac:pick', function () { pre(); answer(inp.dataset.sid); });
  }

  function escHtml(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* 고른 역 → 한 줄 답: 개통으로 가장 많이 줄어드는 도심까지 '지금 N분 → 개통 후 M분'.
   * 숫자는 access.json(도심 접근성, 추정값) 그대로. 자료가 아직 안 왔으면 오면 다시 그린다. */
  function answer(sid) {
    if (!el || !sid) return;
    var box = el.querySelector('.gd-ans');
    var nm = (el.querySelector('#gd-st').value || '').trim();
    // access.js 는 const StationAccess 라 window 에 붙지 않는다 → 이름으로 찾는다
    function acc() { return typeof StationAccess !== 'undefined' ? StationAccess : null; }
    var A = acc();
    if (!A || !A.isReady()) {
      box.innerHTML = '<span class="gd-wait">시간 자료를 불러오는 중…</span>';
      var tries = 0, t = setInterval(function () {
        if ((A = acc()) && A.isReady()) { clearInterval(t); answer(sid); }
        else if (++tries > 40) { clearInterval(t); box.textContent = '시간 자료를 불러오지 못했어요. 역 상세에서 다시 볼 수 있어요.'; }
      }, 250);
      return;
    }
    var ac = A.of(sid), best = A.biggestGain(sid), html;
    if (!ac) {
      html = '<b>' + escHtml(nm) + '</b>은(는) 수도권 밖이라 도심까지 시간 비교 자료가 아직 없어요.';
    } else if (best) {
      html = '<b>' + escHtml(nm) + '</b> → ' + escHtml(best.label.split('(')[0].trim()) +
        '<div class="gd-num">지금 <b>' + best.now + '분</b> → 개통 후 <b class="gd-after">' + best.after + '분</b>' +
        ' <span class="gd-save">' + best.save + '분 단축</span></div>';
    } else {
      var r0 = ac.rows[0];
      html = '<b>' + escHtml(nm) + '</b>은(는) 지금 계획된 개통으로는 도심까지 시간이 거의 그대로예요' +
        (r0 && r0.now != null ? ' · ' + escHtml(r0.label.split('(')[0].trim()) + ' 지금 ' + r0.now + '분' : '') + '.';
    }
    html += '<div class="gd-acts"><button type="button" class="gd-more">자세히 보기</button>' +
      '<a class="gd-rank" href="rank.html">가장 가까워지는 역 TOP 10</a></div>' +
      '<div class="gd-src">추정값 · 시각표 미반영' + (A.asof && A.asof() ? ' · ' + escHtml(A.asof()) + ' 기준' : '') + '</div>';
    box.innerHTML = html;
    box.querySelector('.gd-more').addEventListener('click', function () {
      close();
      if (global.KR_openStationById) global.KR_openStationById(sid);
    });
    if (global.KRTrack) global.KRTrack('첫화면 우리동네', { 결과: best ? '단축' : ac ? '그대로' : '자료없음' });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderQuick);
  else renderQuick();

  global.Guide = { show: show, close: close, KEY: KEY, renderQuick: renderQuick };
})(typeof window !== 'undefined' ? window : this);
