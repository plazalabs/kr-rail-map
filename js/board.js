/* KrBoard — 게시판 (board.html) 의 Supabase 통신·검사 (2026-11-12)
 *
 * 라이브러리 없이 Supabase REST(PostgREST) 를 fetch 로 부른다. 설정은 js/board-config.js.
 * 설정이 비어 있으면 ready() 가 false — 화면은 '준비 중' 을 보여 준다.
 * 보안은 DB 쪽(supabase/board.sql 의 RLS·제약·트리거)이 책임진다. 여기 검사는 사용자에게 빨리 알려 주려는 것.
 * 글은 화면에 넣을 때 반드시 textContent 로 (HTML 로 넣지 않는다).
 */
'use strict';

const KrBoard = (() => {
  const KINDS = { free: '자유', station: '우리 역 이야기', dev: '개발자에게 의견' };
  const LIMIT = { nick: 20, station: 30, bodyMin: 2, bodyMax: 1000 };
  const COOLDOWN_MS = 20000;   // 같은 브라우저에서 연달아 올리기 (DB 도 1분 3개로 막는다)

  function cfg() { return (typeof window !== 'undefined' && window.KR_BOARD_CONFIG) || {}; }
  function ready(c) {
    c = c || cfg();
    return /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(c.supabaseUrl || '') && /^[A-Za-z0-9._-]{30,}$/.test(c.anonKey || '');
  }
  function base(c) { return (c.supabaseUrl || '').replace(/\/$/, '') + '/rest/v1/'; }
  function headers(c, extra) {
    return Object.assign({ apikey: c.anonKey, Authorization: 'Bearer ' + c.anonKey, 'Content-Type': 'application/json' }, extra || {});
  }

  // 브라우저마다 고정된 익명 아이디 (도배·중복 신고 막기용, 개인 정보 아님)
  function clientId(store) {
    store = store || (typeof localStorage !== 'undefined' ? localStorage : null);
    let id = null;
    try { id = store && store.getItem('krrail-board-cid'); } catch (e) { id = null; }
    if (!id || !/^[a-z0-9]{8,64}$/.test(id)) {
      id = Array.from({ length: 24 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
      try { store && store.setItem('krrail-board-cid', id); } catch (e) { /* 저장 못 해도 이번 한 번은 쓴다 */ }
    }
    return id;
  }

  // 글 검사 — { ok, why, post }
  function validate(input) {
    const kind = KINDS[input.kind] ? input.kind : 'free';
    const nick = String(input.nick || '').trim().slice(0, LIMIT.nick) || '익명';
    const station = String(input.station || '').trim().slice(0, LIMIT.station) || null;
    const body = String(input.body || '').replace(/\r\n/g, '\n').trim();
    if (input.honeypot) return { ok: false, why: '잘못된 요청이에요.' };   // 사람 눈에 안 보이는 칸에 뭔가 들어 있으면 자동 등록기
    if (body.length < LIMIT.bodyMin) return { ok: false, why: '내용을 2글자 이상 써 주세요.' };
    if (body.length > LIMIT.bodyMax) return { ok: false, why: '1,000자까지 쓸 수 있어요 (지금 ' + body.length.toLocaleString() + '자).' };
    if ((body.match(/https?:\/\//g) || []).length > 2) return { ok: false, why: '링크는 2개까지만 넣을 수 있어요.' };
    return { ok: true, post: { kind, nick, station, body } };
  }

  async function list(opts) {
    const c = cfg();
    const q = new URLSearchParams({ select: 'id,created_at,kind,nick,station,body,reports', order: 'created_at.desc', limit: String((opts && opts.limit) || 50) });
    if (opts && opts.kind && KINDS[opts.kind]) q.set('kind', 'eq.' + opts.kind);
    if (opts && opts.station) q.set('station', 'eq.' + opts.station);
    if (opts && opts.stationId && /^st-[0-9]+$/.test(opts.stationId)) q.set('station', 'like.*·' + opts.stationId);
    if (opts && opts.before) q.set('created_at', 'lt.' + opts.before);
    const r = await fetch(base(c) + 'board_posts?' + q.toString(), { headers: headers(c) });
    if (!r.ok) throw new Error('목록을 불러오지 못했어요 (' + r.status + ')');
    return r.json();
  }

  async function post(input, now) {
    const v = validate(input);
    if (!v.ok) return v;
    now = now || Date.now();
    let last = 0;
    try { last = +localStorage.getItem('krrail-board-last') || 0; } catch (e) { last = 0; }
    if (now - last < COOLDOWN_MS) return { ok: false, why: '조금 뒤에 다시 올려 주세요 (' + Math.ceil((COOLDOWN_MS - (now - last)) / 1000) + '초).' };
    const c = cfg();
    const r = await fetch(base(c) + 'board_posts', {
      method: 'POST', headers: headers(c, { Prefer: 'return=minimal' }),
      body: JSON.stringify(Object.assign({}, v.post, { client_id: clientId() })),
    });
    if (!r.ok) {
      let msg = '';
      try { msg = (await r.json()).message || ''; } catch (e) { msg = ''; }
      // 우리 트리거(supabase/board.sql·board_guard_v2.sql)가 보내는 안내는 한국어다 — 그대로 보여 준다
      return { ok: false, why: /[가-힣]/.test(msg) ? msg : '올리지 못했어요 (' + r.status + '). 잠시 뒤 다시 해 주세요.' };
    }
    try { localStorage.setItem('krrail-board-last', String(now)); } catch (e) { /* 무시 */ }
    return { ok: true };
  }

  async function report(postId) {
    const c = cfg();
    const r = await fetch(base(c) + 'board_reports', {
      method: 'POST', headers: headers(c, { Prefer: 'return=minimal' }),
      body: JSON.stringify({ post_id: Number(postId), client_id: clientId() }),
    });
    if (r.status === 409) return { ok: true, already: true };   // 이미 신고한 글
    if (!r.ok) {
      let msg = '';
      try { msg = (await r.json()).message || ''; } catch (e) { msg = ''; }
      return { ok: false, why: /[가-힣]/.test(msg) ? msg : '' };   // 자기 글·한 시간 10건·전체 상한 (board_guard_v2.sql)
    }
    return { ok: true };
  }

  // 역 이야기 — station 칸에 '역이름·역ID' (30자 안). 역 ID 로 묶어 동명역이 섞이지 않게 (js/station-talk.js)
  function stationKey(name, id) {
    id = String(id || '');
    const room = LIMIT.station - id.length - 1;
    return String(name || '').trim().slice(0, Math.max(0, room)) + '·' + id;
  }
  // '광운대·st-355172776' → { name: '광운대', id: 'st-355172776' } · 옛 글('광운대') → { name: '광운대', id: null }
  function parseStation(s) {
    const m = /^(.*)·(st-[0-9]+)$/.exec(String(s || ''));
    return m ? { name: m[1], id: m[2] } : { name: String(s || ''), id: null };
  }

  // '3분 전', '어제', '11월 9일'
  function ago(iso, now) {
    const t = Date.parse(iso); now = now || Date.now();
    const s = Math.max(0, Math.round((now - t) / 1000));
    if (s < 60) return '방금';
    if (s < 3600) return Math.floor(s / 60) + '분 전';
    if (s < 86400) return Math.floor(s / 3600) + '시간 전';
    if (s < 172800) return '어제';
    const d = new Date(t);
    return (d.getMonth() + 1) + '월 ' + d.getDate() + '일';
  }

  return { KINDS, LIMIT, ready, validate, list, post, report, clientId, ago, cfg, stationKey, parseStation };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = KrBoard;
