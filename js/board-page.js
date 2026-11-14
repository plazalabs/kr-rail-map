/* board.html 에 인라인으로 있던 스크립트 — CSP(script-src 'self') 때문에 파일로 뺐다 (6차 K15 ①B3, 2026-11-14) */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const C = KrBoard.cfg();
  if (/^https:\/\//.test(C.feedbackUrl || '')) $('fb-link').href = C.feedbackUrl; else $('fb-link').hidden = true;
  // 삭제 요청 (H6) — 같은 의견 양식. 양식이 없으면 '오류 제보' 링크와 같이 숨기지 않고 글로만 남긴다
  if (/^https:\/\//.test(C.feedbackUrl || '')) $('del-link').href = C.feedbackUrl; else $('del-link').removeAttribute('href');
  if (/^https:\/\//.test(C.coffeeUrl || '')) { $('coffee-link').href = C.coffeeUrl; $('coffee-link').hidden = false; }
  if (!KrBoard.ready()) { $('not-ready').hidden = false; return; }
  $('board').hidden = false;

  const qs = new URLSearchParams(location.search);
  let kind = KrBoard.KINDS[qs.get('kind')] ? qs.get('kind') : '';
  if (qs.get('station')) { $('station').value = qs.get('station').slice(0, 30); $('kind').value = 'station'; }
  let last = null;

  // 글 한 개 — 사용자 글은 textContent 로만 넣는다
  function item(p) {
    const li = document.createElement('li'); li.className = 'post';
    const meta = document.createElement('div'); meta.className = 'meta';
    const k = document.createElement('span'); k.className = 'kind'; k.textContent = KrBoard.KINDS[p.kind] || '자유';
    const n = document.createElement('span'); n.className = 'nick'; n.textContent = p.nick || '익명';
    meta.append(k, n);
    if (p.station) {
      // 역 이야기(역 상세에서 쓴 글)는 '역이름·역ID' — 이름만 보여 주고 누르면 지도에서 그 역
      const ps = KrBoard.parseStation(p.station);
      const s = document.createElement(ps.id ? 'a' : 'span'); s.className = 'st'; s.textContent = ps.name; s.insertAdjacentHTML('afterbegin', Icons.svg('train') + ' ');
      if (ps.id) s.href = './?st=' + encodeURIComponent(ps.id);
      meta.append(s);
    }
    const t = document.createElement('time'); t.dateTime = p.created_at; t.textContent = KrBoard.ago(p.created_at); t.title = new Date(p.created_at).toLocaleString('ko-KR'); meta.append(t);
    const r = document.createElement('button'); r.className = 'rep'; r.type = 'button'; r.textContent = '신고'; r.dataset.id = p.id; meta.append(r);
    const b = document.createElement('div'); b.className = 'body'; b.textContent = p.body;
    li.append(meta, b);
    return li;
  }
  async function load(more) {
    if (!more) { $('posts').innerHTML = ''; last = null; }
    try {
      const rows = await KrBoard.list({ kind, before: more ? last : null, limit: 30 });
      if (!more && !rows.length) { const e = document.createElement('li'); e.className = 'empty'; e.textContent = '아직 글이 없어요. 첫 글을 남겨 주세요!'; $('posts').append(e); }
      rows.forEach(p => $('posts').append(item(p)));
      if (rows.length) last = rows[rows.length - 1].created_at;
      $('more').hidden = rows.length < 30;
    } catch (e) {
      const li = document.createElement('li'); li.className = 'empty'; li.textContent = e.message; $('posts').append(li);
    }
  }
  function syncTabs() { document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.k === kind))); }

  $('body').addEventListener('input', () => { $('cnt').textContent = $('body').value.length.toLocaleString() + ' / 1,000'; });
  $('f').addEventListener('submit', async e => {
    e.preventDefault();
    $('send').disabled = true; $('msg').className = 'msg'; $('msg').textContent = '올리는 중…';
    const res = await KrBoard.post({ kind: $('kind').value, nick: $('nick').value, station: $('station').value, body: $('body').value, honeypot: $('hp').value })
      .catch(() => ({ ok: false, why: '올리지 못했어요. 인터넷 연결을 확인해 주세요.' }));
    $('send').disabled = false;
    if (!res.ok) { $('msg').className = 'msg err'; $('msg').textContent = res.why; return; }
    $('msg').className = 'msg ok'; $('msg').textContent = '올렸어요. 고마워요!';
    $('body').value = ''; $('cnt').textContent = '0 / 1,000';
    kind = ''; syncTabs(); load(false);
  });
  document.querySelector('.tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; kind = b.dataset.k; syncTabs(); load(false); });
  $('more').addEventListener('click', () => load(true));
  $('posts').addEventListener('click', async e => {
    const b = e.target.closest('.rep'); if (!b) return;
    if (!confirm('이 글을 신고할까요? 신고가 3번 쌓이면 숨겨집니다.')) return;
    const r = await KrBoard.report(b.dataset.id).catch(() => ({ ok: false }));
    b.textContent = r.ok ? (r.already ? '이미 신고함' : '신고됨') : (r.why || '신고 실패');
    b.disabled = true;
  });
  syncTabs(); load(false);
})();
