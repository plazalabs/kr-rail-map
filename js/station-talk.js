/* StationTalk — 역 상세 안 '이 역 이야기' (커뮤니티, 2026-11-12)
 *
 * 게시판(js/board.js · supabase/board.sql)의 글 중 kind='station' 이고 station 이 '역이름·역ID' 인 것만 보여 주고 쓴다.
 *   - 역 ID 로 묶어서 이름이 같은 다른 역(서울·대전·부산 시청)과 섞이지 않는다
 *   - DB 를 바꾸지 않는다: station 칸(30자)에 '광운대·st-355172776' 처럼 넣는다 (KrBoard.stationKey)
 *   - 설정(js/board-config.js)이 비어 있으면 '준비 중' 한 줄과 게시판 링크만
 *   - 글은 반드시 textContent 로 넣는다 (HTML 로 해석하지 않음)
 * 역 상세(js/station-detail.js)가 sectionHtml() 로 자리를 만들고, 그린 뒤 mount() 를 부른다.
 */
(function (global) {
  'use strict';
  var NICK_KEY = 'krrail-board-nick';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var B = function () { return typeof KrBoard !== 'undefined' ? KrBoard : null; };

  function sectionHtml(sid, name) {
    var head = '<h3><i data-ic="message"></i> 이 역 이야기</h3>';
    if (!B() || !B().ready()) {
      return '<div class="sd-sec sd-talk" data-sid="' + esc(sid) + '">' + head +
        '<div class="sd-note">이 역에 대한 이야기를 나누는 곳이에요. 지금 준비 중이에요 · <a href="board.html">게시판</a></div></div>';
    }
    var nick = '';
    try { nick = localStorage.getItem(NICK_KEY) || ''; } catch (e) { nick = ''; }
    return '<div class="sd-sec sd-talk" data-sid="' + esc(sid) + '">' + head +
      '<ul class="sd-talk-list" aria-live="polite"><li class="sd-note">불러오는 중…</li></ul>' +
      '<form class="sd-talk-form" novalidate>' +
        '<input class="sd-talk-nick" maxlength="20" placeholder="닉네임 (안 쓰면 익명)" value="' + esc(nick) + '" aria-label="닉네임">' +
        '<textarea class="sd-talk-body" maxlength="1000" rows="2" placeholder="' + esc(name) + '역에 대해 한마디…" aria-label="' + esc(name) + '역 이야기 쓰기"></textarea>' +
        '<input class="sd-talk-hp" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px">' +
        '<div class="sd-talk-row"><span class="sd-talk-msg" role="status"></span><button type="submit" class="sd-talk-go">등록</button></div>' +
      '</form>' +
      '<div class="sd-note">욕설·광고·개인정보는 신고 3번이면 숨겨져요 · <a href="board.html">게시판 전체</a></div></div>';
  }

  function renderList(ul, rows) {
    ul.textContent = '';
    if (!rows.length) {
      var e = document.createElement('li'); e.className = 'sd-note'; e.textContent = '아직 이야기가 없어요. 첫 글을 남겨 보세요.';
      ul.appendChild(e); return;
    }
    rows.forEach(function (p) {
      var li = document.createElement('li'); li.className = 'sd-talk-item';
      var meta = document.createElement('div'); meta.className = 'sd-talk-meta';
      var nk = document.createElement('b'); nk.textContent = p.nick || '익명';
      var tm = document.createElement('span'); tm.textContent = ' · ' + B().ago(p.created_at);
      var rp = document.createElement('button'); rp.type = 'button'; rp.className = 'sd-talk-report'; rp.textContent = '신고'; rp.setAttribute('data-id', p.id);
      rp.setAttribute('aria-label', (p.nick || '익명') + ' 글 신고');
      meta.append(nk, tm, rp);
      var body = document.createElement('p'); body.className = 'sd-talk-text'; body.textContent = p.body;
      li.append(meta, body);
      ul.appendChild(li);
    });
  }

  function load(sec, sid) {
    var ul = sec.querySelector('.sd-talk-list');
    return B().list({ kind: 'station', stationId: sid, limit: 20 }).then(function (rows) {
      if (sec.getAttribute('data-sid') !== sid || !sec.isConnected) return;   // 그사이 다른 역을 열었다
      renderList(ul, rows || []);
    }).catch(function () {
      if (!sec.isConnected) return;
      ul.textContent = '';
      var e = document.createElement('li'); e.className = 'sd-note'; e.textContent = '이야기를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.';
      ul.appendChild(e);
    });
  }

  function mount(root, sid, name) {
    var sec = root && root.querySelector('.sd-talk[data-sid]');
    if (!sec || !B() || !B().ready()) return Promise.resolve(false);
    var form = sec.querySelector('.sd-talk-form');
    var msg = sec.querySelector('.sd-talk-msg');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('.sd-talk-go');
      var nick = form.querySelector('.sd-talk-nick').value;
      btn.disabled = true; msg.textContent = '';
      B().post({ kind: 'station', nick: nick, station: B().stationKey(name, sid), body: form.querySelector('.sd-talk-body').value,
        honeypot: form.querySelector('.sd-talk-hp').value }).then(function (r) {
        btn.disabled = false;
        if (!r.ok) { msg.textContent = r.why || '올리지 못했어요.'; return; }
        try { if (nick.trim()) localStorage.setItem(NICK_KEY, nick.trim().slice(0, 20)); } catch (e2) { /* 무시 */ }
        form.querySelector('.sd-talk-body').value = '';
        msg.textContent = '올렸어요';
        return load(sec, sid);
      }).catch(function () { btn.disabled = false; msg.textContent = '올리지 못했어요. 잠시 뒤 다시 해 주세요.'; });
    });
    sec.querySelector('.sd-talk-list').addEventListener('click', function (e) {
      var b = e.target.closest('.sd-talk-report'); if (!b || b.disabled) return;
      if (typeof confirm === 'function' && !confirm('이 글을 신고할까요? 3번 신고되면 숨겨져요.')) return;
      b.disabled = true;
      B().report(b.getAttribute('data-id')).then(function (r) { b.textContent = r.ok ? (r.already ? '이미 신고함' : '신고됨') : (r.why || '실패'); });
    });
    return load(sec, sid);
  }

  global.StationTalk = { sectionHtml: sectionHtml, mount: mount };
})(typeof window !== 'undefined' ? window : globalThis);
