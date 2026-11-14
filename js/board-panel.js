/* BoardPanel — 지도 화면 안에서 여는 게시판 (회장님 피드백 2026-11-14: "글 쓰려는데 왜 다른 페이지로 넘어가냐, 한 공간에서 쓰게")
 *
 * 떡상 패널과 같은 자리·모양(.rkp — PC 오른쪽 카드 / 휴대폰 아래 시트)에 글쓰기 + 목록을 한 화면에 둔다.
 * 통신·검사는 js/board.js(KrBoard) 그대로 — board.html 과 같은 규칙(익명·신고 3번 숨김·링크 2개·꿀단지 칸).
 * 사용자 글은 textContent 로만 넣는다(HTML 로 해석하지 않음).
 * board.html 은 그대로 둔다(링크로 들어오는 사람·검색 엔진용). 왼쪽 레일·메뉴의 '게시판'은 이 패널을 연다.
 */
(function (global) {
  'use strict';
  var el = null, isOpen = false, kind = '', last = null, opener = null;
  function B() { return global.KrBoard || (typeof KrBoard !== 'undefined' ? KrBoard : null); }   // board.js 는 const KrBoard (window 에 안 붙음)
  function $(s) { return el.querySelector(s); }
  function track(n, d) { try { if (global.KRTrack) global.KRTrack(n, d); } catch (e) { /* 통계 실패는 무시 */ } }

  function css() {
    if (document.getElementById('bdp-css')) return;
    var s = document.createElement('style'); s.id = 'bdp-css';
    s.textContent =
      '.bdp form{display:grid;gap:8px;margin:4px 0 6px}' +
      '.bdp .bdp-row{display:grid;grid-template-columns:1fr 1fr;gap:6px}' +
      '.bdp label{display:grid;gap:3px;font-size:var(--fs-xs);color:var(--muted)}' +
      '.bdp select,.bdp input[type=text],.bdp textarea{border:1px solid var(--border);border-radius:9px;padding:7px 9px;background:var(--card,var(--panel));color:var(--text);font:inherit;font-size:var(--fs-md);width:100%;box-sizing:border-box}' +
      '.bdp textarea{min-height:84px;resize:vertical}' +
      '.bdp .bdp-hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}' +
      '.bdp .bdp-foot{display:flex;align-items:center;gap:8px}' +
      '.bdp .bdp-cnt{font-size:var(--fs-xs);color:var(--muted);margin-right:auto}' +
      '.bdp .bdp-send{border:0;border-radius:10px;padding:8px 18px;background:var(--accent);color:var(--accent-text,#fff);font:inherit;font-weight:700;cursor:pointer}' +
      '.bdp .bdp-send:disabled{opacity:.6;cursor:default}' +
      '.bdp .bdp-msg{font-size:var(--fs-sm);min-height:1em}.bdp .bdp-msg.err{color:var(--rk-up,#c9272e)}.bdp .bdp-msg.ok{color:var(--rk-green,#087a3e)}' +
      '.bdp .bdp-tabs{display:flex;flex-wrap:wrap;gap:5px;margin:8px 0 4px}' +
      '.bdp .bdp-tabs button{border:0;background:var(--surface,var(--hover));border-radius:999px;padding:5px 11px;font:inherit;font-size:var(--fs-sm);color:var(--text);cursor:pointer}' +
      '.bdp .bdp-tabs button[aria-pressed=true]{background:var(--accent);color:var(--accent-text,#fff);font-weight:700}' +
      '.bdp .bdp-list{list-style:none;margin:0;padding:0}' +
      '.bdp .bdp-post{padding:9px 2px;border-bottom:1px solid var(--border)}' +
      '.bdp .bdp-meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:var(--fs-xs);color:var(--muted)}' +
      '.bdp .bdp-kind{font-weight:700;color:var(--accent)}.bdp .bdp-nick{color:var(--text);font-weight:600}' +
      '.bdp .bdp-rep{margin-left:auto;border:0;background:none;color:var(--muted);font:inherit;font-size:var(--fs-xs);cursor:pointer;text-decoration:underline}' +
      '.bdp .bdp-body{margin-top:3px;font-size:var(--fs-md);white-space:pre-wrap;word-break:break-word;color:var(--text)}' +
      '.bdp .bdp-st{color:inherit}' +
      '.bdp .bdp-empty{padding:14px 2px;color:var(--muted);font-size:var(--fs-sm)}' +
      '.bdp .bdp-more{width:100%;margin:8px 0;padding:8px;border:1px solid var(--border);border-radius:10px;background:none;color:var(--text);font:inherit;cursor:pointer}';
    document.head.appendChild(s);
  }

  function build() {
    css();
    el = document.createElement('section');
    el.id = 'board-panel';
    el.className = 'rkp bdp';
    el.hidden = true;
    el.setAttribute('aria-label', '게시판');
    var K = (B() && B().KINDS) || { free: '자유', station: '우리 역 이야기', dev: '개발자에게 의견' };
    var opts = Object.keys(K).map(function (k) { return '<option value="' + k + '">' + K[k] + '</option>'; }).join('');
    el.innerHTML =
      '<div class="rkp-head"><p class="rkp-eyebrow">게시판 · 익명</p>' +
      '<button class="rkp-close" type="button" aria-label="게시판 닫기"><i data-ic="close"></i></button></div>' +
      '<h2 class="rkp-title">철도 이야기 나누기</h2>' +
      '<div class="bdp-off" hidden><p class="rkp-def">게시판을 준비하고 있어요. 그동안 의견은 <a class="bdp-fb" target="_blank" rel="noopener">오류 제보·기능 제안</a>으로 보내 주세요.</p></div>' +
      '<div class="bdp-on">' +
        '<form class="bdp-form" novalidate>' +
          '<div class="bdp-row"><label>종류<select class="bdp-kindsel">' + opts + '</select></label>' +
          '<label>닉네임 (선택)<input type="text" class="bdp-nickin" maxlength="20" placeholder="익명" autocomplete="nickname"></label></div>' +
          '<label>역 이름 (선택)<input type="text" class="bdp-stin" maxlength="30" placeholder="예: 광화문"></label>' +
          '<label>내용<textarea class="bdp-bodyin" maxlength="1000" placeholder="2~1,000자. 비방·광고 글은 신고로 숨겨집니다." required></textarea></label>' +
          '<div class="bdp-hp" aria-hidden="true"><label>홈페이지<input type="text" class="bdp-hpin" tabindex="-1" autocomplete="off"></label></div>' +
          '<div class="bdp-foot"><span class="bdp-cnt">0 / 1,000</span><button class="bdp-send" type="submit">올리기</button></div>' +
          '<div class="bdp-msg" role="status" aria-live="polite"></div>' +
        '</form>' +
        '<p class="rkp-def">개인 정보(전화번호·주소)는 쓰지 마세요 · 쓴 글은 직접 고치거나 지울 수 없어요(익명) · 신고 3번이면 숨겨져요 · 지워야 할 글은 <a class="bdp-del" target="_blank" rel="noopener">삭제 요청</a></p>' +
        '<div class="bdp-tabs" role="group" aria-label="종류로 거르기"><button type="button" data-k="" aria-pressed="true">전체</button>' +
          Object.keys(K).map(function (k) { return '<button type="button" data-k="' + k + '" aria-pressed="false">' + K[k] + '</button>'; }).join('') + '</div>' +
        '<ol class="bdp-list"></ol>' +   /* 목록 통째 낭독 방지(11-15) — 올림 결과는 .bdp-msg(status)가 읽음 */
        '<button type="button" class="bdp-more" hidden>더 보기</button>' +
      '</div>';
    document.getElementById('map-wrap').appendChild(el);
    if (global.Icons && Icons.hydrate) try { Icons.hydrate(el); } catch (e) { /* 아이콘 없어도 동작 */ }

    var C = (B() && B().cfg && B().cfg()) || {};
    var fb = /^https:\/\//.test(C.feedbackUrl || '') ? C.feedbackUrl : null;
    if (fb) { $('.bdp-fb').href = fb; $('.bdp-del').href = fb; } else { $('.bdp-fb').removeAttribute('href'); $('.bdp-del').removeAttribute('href'); }

    $('.rkp-close').addEventListener('click', close);
    el.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    $('.bdp-bodyin').addEventListener('input', function () { $('.bdp-cnt').textContent = this.value.length.toLocaleString() + ' / 1,000'; });
    $('.bdp-form').addEventListener('submit', submit);
    $('.bdp-tabs').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; kind = b.getAttribute('data-k'); syncTabs(); load(false); });
    $('.bdp-more').addEventListener('click', function () { load(true); });
    $('.bdp-list').addEventListener('click', report);
  }

  function syncTabs() { el.querySelectorAll('.bdp-tabs button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-k') === kind)); }); }

  function item(p) {
    var K = B().KINDS;
    var li = document.createElement('li'); li.className = 'bdp-post';
    var meta = document.createElement('div'); meta.className = 'bdp-meta';
    var k = document.createElement('span'); k.className = 'bdp-kind'; k.textContent = K[p.kind] || '자유';
    var n = document.createElement('span'); n.className = 'bdp-nick'; n.textContent = p.nick || '익명';
    meta.append(k, n);
    if (p.station) {
      var ps = B().parseStation(p.station);
      var s = document.createElement(ps.id ? 'a' : 'span'); s.className = 'bdp-st'; s.textContent = ps.name;
      if (ps.id) { s.href = './?st=' + encodeURIComponent(ps.id); }
      meta.append(s);
    }
    var t = document.createElement('time'); t.dateTime = p.created_at; t.textContent = B().ago(p.created_at);
    try { t.title = new Date(p.created_at).toLocaleString('ko-KR'); } catch (e) { /* 무시 */ }
    meta.append(t);
    var r = document.createElement('button'); r.className = 'bdp-rep'; r.type = 'button'; r.textContent = '신고'; r.setAttribute('data-id', p.id); r.setAttribute('aria-label', (p.nick || '익명') + ' 글 신고'); meta.append(r);   /* 낭독기: '신고'만으로는 누구 글인지 모름(역 이야기와 같게, 11-15) */
    var b = document.createElement('div'); b.className = 'bdp-body'; b.textContent = p.body;
    li.append(meta, b);
    return li;
  }
  function empty(msg) { var e = document.createElement('li'); e.className = 'bdp-empty'; e.textContent = msg; $('.bdp-list').append(e); }

  function load(more) {
    var list = $('.bdp-list');
    if (!more) { list.innerHTML = ''; last = null; }
    return B().list({ kind: kind, before: more ? last : null, limit: 30 }).then(function (rows) {
      if (!more && !rows.length) empty('아직 글이 없어요. 첫 글을 남겨 주세요!');
      rows.forEach(function (p) { list.append(item(p)); });
      if (rows.length) last = rows[rows.length - 1].created_at;
      $('.bdp-more').hidden = rows.length < 30;
    }).catch(function (e) { empty((e && e.message) || '글을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'); });
  }

  function submit(e) {
    e.preventDefault();
    var send = $('.bdp-send'), msg = $('.bdp-msg');
    send.disabled = true; msg.className = 'bdp-msg'; msg.textContent = '올리는 중…';
    B().post({ kind: $('.bdp-kindsel').value, nick: $('.bdp-nickin').value, station: $('.bdp-stin').value, body: $('.bdp-bodyin').value, honeypot: $('.bdp-hpin').value })
      .catch(function () { return { ok: false, why: '올리지 못했어요. 인터넷 연결을 확인해 주세요.' }; })
      .then(function (res) {
        send.disabled = false;
        if (!res.ok) { msg.className = 'bdp-msg err'; msg.textContent = res.why; return; }
        msg.className = 'bdp-msg ok'; msg.textContent = '올렸어요. 고마워요!';
        $('.bdp-bodyin').value = ''; $('.bdp-cnt').textContent = '0 / 1,000';
        track('게시판 글쓰기', { 곳: '지도 안' });
        kind = ''; syncTabs(); load(false);
      });
  }

  function report(e) {
    var b = e.target.closest('.bdp-rep'); if (!b) return;
    if (!global.confirm('이 글을 신고할까요? 신고가 3번 쌓이면 숨겨집니다.')) return;
    B().report(b.getAttribute('data-id')).catch(function () { return { ok: false }; }).then(function (r) {
      b.textContent = r.ok ? (r.already ? '이미 신고함' : '신고됨') : (r.why || '신고 실패');
      b.disabled = true;
    });
  }

  // o: { kind, station } — 역 상세 '이 역 이야기 쓰기' 등에서 미리 채운다
  function open(o) {
    o = o || {};
    if (!el) build();
    opener = document.activeElement;
    if (global.RocketPanel && RocketPanel.isOpen && RocketPanel.isOpen()) RocketPanel.close();   // 같은 자리를 쓰므로 하나만
    if (global.UI && UI.closeDrawer && document.body.classList.contains('drawer-open')) UI.closeDrawer();
    var on = !!(B() && B().ready && B().ready());
    $('.bdp-off').hidden = on; $('.bdp-on').hidden = !on;
    if (o.station) { $('.bdp-stin').value = String(o.station).slice(0, 30); $('.bdp-kindsel').value = 'station'; }
    if (o.kind && B() && B().KINDS[o.kind]) $('.bdp-kindsel').value = o.kind;
    el.hidden = false; isOpen = true;
    document.body.classList.add('rk-open', 'bd-open');
    track('게시판 패널');
    if (on) { kind = ''; syncTabs(); load(false); }
    var f = on ? $('.bdp-bodyin') : $('.rkp-close');
    try { f.focus({ preventScroll: true }); } catch (e) { /* 무시 */ }
  }
  function close() {
    if (!el || !isOpen) return;
    el.hidden = true; isOpen = false;
    document.body.classList.remove('bd-open');
    if (!(global.RocketPanel && RocketPanel.isOpen && RocketPanel.isOpen())) document.body.classList.remove('rk-open');
    if (opener && opener.focus && opener.offsetParent) try { opener.focus(); } catch (e) { /* 무시 */ }
  }

  // 왼쪽 레일·메뉴·첫 화면 '더 보기'의 board.html 링크를 이 패널로 (새 탭·가운데 클릭은 그대로 페이지로)
  function wire() {
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href="board.html"], a[href^="board.html#"]');
      if (!a || e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      open({});
    });
    try { if (new URLSearchParams(global.location.search).get('board') === '1') open({}); } catch (e) { /* 무시 */ }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();

  global.BoardPanel = { open: open, close: close, isOpen: function () { return isOpen; } };
})(typeof window !== 'undefined' ? window : this);
