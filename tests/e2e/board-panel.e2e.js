/* e2e: 지도 안 게시판 패널 (회장님 피드백 2026-11-14 — "글 쓰려는데 다른 페이지로 넘어가면 안 된다, 한 공간에서")
 *  - 왼쪽 레일 '게시판'·메뉴 '게시판·의견'을 누르면 페이지가 바뀌지 않고 지도 위 패널이 열린다
 *  - 패널 안에서 목록·글쓰기·신고, 글의 HTML 은 해석되지 않음 · 떡상 패널과 하나만 열림 · Esc 닫기
 *  - 휴대폰: 레일 대신 아래 탭 '게시판'도 같은 패널, 가로 스크롤 없음
 * Supabase 응답은 board.e2e.js 와 같은 방식(CDP Fetch)으로 흉내 낸다.
 * 실행: node tests/e2e/run.js --only board-panel
 */
'use strict';
const { launch, sleep, BASE, recorder } = require('./lib/cdp');
const R = recorder('board-panel');
const SB = 'https://testproj01.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e2e-anon-key-for-tests-only';

async function setup(b, posts, seen) {
  await b.send('Network.setBypassServiceWorker', { bypass: true });
  await b.send('Fetch.enable', { patterns: [{ urlPattern: '*board-config.js*' }, { urlPattern: SB + '/*' }] });
  b.handlers.push(async m => {
    if (m.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = m.params;
    const ok = (status, body, type) => b.send('Fetch.fulfillRequest', { requestId, responseCode: status,
      responseHeaders: [{ name: 'Content-Type', value: type || 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Access-Control-Allow-Headers', value: '*' }, { name: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' }],
      body: Buffer.from(body).toString('base64') }).catch(() => {});
    if (/board-config\.js/.test(request.url)) return ok(200, `window.KR_BOARD_CONFIG = { supabaseUrl: '${SB}', anonKey: '${KEY}', coffeeUrl: '', feedbackUrl: 'https://docs.google.com/forms/e2e' };`, 'application/javascript');
    if (request.method === 'OPTIONS') return ok(204, '');
    if (/board_posts\?/.test(request.url) && request.method === 'GET') return ok(200, JSON.stringify(posts));
    if (/board_posts$/.test(request.url) && request.method === 'POST') {
      const p = JSON.parse(request.postData); seen.post = p;
      posts.unshift({ id: 3, created_at: new Date().toISOString(), kind: p.kind, nick: p.nick, station: p.station, body: p.body, reports: 0 });
      return ok(201, '');
    }
    if (/board_reports$/.test(request.url)) { seen.report = request.postData; return ok(201, ''); }
    return ok(404, '{}');
  });
}
async function ready(b) { for (let k = 0; k < 200; k++) { await sleep(100); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady`).catch(() => false)) break; } await sleep(800); }
const mk = () => [
  { id: 2, created_at: new Date(Date.now() - 120000).toISOString(), kind: 'station', nick: '종로주민', station: '광화문', body: '광화문 이야기', reports: 0 },
  { id: 1, created_at: new Date(Date.now() - 7200000).toISOString(), kind: 'free', nick: '<b>해커</b>', station: null, body: '<img src=x onerror="window.XSS=1">글', reports: 0 },
];

(async () => {
  // 1) PC — 왼쪽 레일 '게시판'
  const posts = mk(), seen = {};
  const b = await launch({ port: 9801, w: 1366, h: 768 });
  await setup(b, posts, seen);
  await b.goto(BASE, 300); await ready(b);
  const url0 = await b.evaluate('location.href');
  await b.evaluate(`document.querySelector('#tabbar [data-tab="board"]').click(); true`); await sleep(1200);
  const s1 = await b.evaluate(`(() => { const p = document.getElementById('board-panel'); const r = p && p.getBoundingClientRect();
    return { url: location.href, open: !!p && !p.hidden, w: r && Math.round(r.width), n: p ? p.querySelectorAll('.bdp-post').length : 0, xss: !!window.XSS,
      raw: p && p.querySelectorAll('.bdp-post')[1] && p.querySelectorAll('.bdp-post')[1].querySelector('.bdp-body').textContent,
      focus: document.activeElement && document.activeElement.className }; })()`);
  R.check('PC 레일 게시판 → 페이지 그대로, 지도 위 패널에 글 2개', s1.url === url0 && s1.open && s1.n === 2, s1);
  R.check('글의 HTML 은 글자 그대로 (XSS 막힘)', !s1.xss && /<img src=x/.test(s1.raw || ''), s1.raw);
  R.check('열면 바로 내용 칸에 글쓰기 커서', /bdp-bodyin/.test(s1.focus || ''), s1.focus);
  // 글쓰기
  await b.evaluate(`(() => { const p = document.getElementById('board-panel'); p.querySelector('.bdp-kindsel').value = 'station'; p.querySelector('.bdp-nickin').value = '시험';
    p.querySelector('.bdp-stin').value = '종로3가'; p.querySelector('.bdp-bodyin').value = '종로3가 이야기 남깁니다'; p.querySelector('.bdp-form').requestSubmit(); })()`);
  await sleep(1500);
  const s2 = await b.evaluate(`(() => { const p = document.getElementById('board-panel'); return { url: location.href, msg: p.querySelector('.bdp-msg').textContent, n: p.querySelectorAll('.bdp-post').length, first: p.querySelector('.bdp-post .bdp-body').textContent, left: p.querySelector('.bdp-bodyin').value }; })()`);
  R.check('패널 안에서 글 올리기 → 고마워요·맨 위 새 글·페이지 그대로', s2.url === url0 && /올렸어요/.test(s2.msg) && s2.n === 3 && /종로3가/.test(s2.first) && s2.left === '' && seen.post && seen.post.kind === 'station', { s2, sent: seen.post });
  // 신고
  await b.evaluate(`window.confirm = () => true; document.querySelector('#board-panel .bdp-rep').click(); true`); await sleep(900);
  const s3 = await b.evaluate(`document.querySelector('#board-panel .bdp-rep').textContent`);
  R.check('신고 → 신고됨', /신고됨/.test(s3) && /"post_id":3/.test(seen.report || ''), { s3, rep: seen.report });
  // 떡상 패널을 열면 게시판은 닫힘(같은 자리) → Esc 로 떡상도 닫고, 메뉴 '게시판·의견' 링크도 패널
  await b.evaluate(`RocketPanel.open({}); true`); await sleep(2500);
  const s4 = await b.evaluate(`({ bd: !document.getElementById('board-panel').hidden, rk: RocketPanel.isOpen() })`);
  await b.evaluate(`RocketPanel.close(); document.querySelector('a.tb-menulink[href="board.html"]').click(); true`); await sleep(1000);
  const s5 = await b.evaluate(`({ url: location.href, bd: BoardPanel.isOpen(), rkOpen: RocketPanel.isOpen() })`);
  R.check('떡상 열면 게시판 닫힘(하나만) · 메뉴 링크도 패널로', !s4.bd && s4.rk && s5.url === url0 && s5.bd && !s5.rkOpen, { s4, s5 });
  await b.evaluate(`document.querySelector('#board-panel .bdp-bodyin').focus(); document.querySelector('#board-panel .bdp-bodyin').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`); await sleep(400);
  const s6 = await b.evaluate(`({ bd: BoardPanel.isOpen(), cls: document.body.classList.contains('rk-open') })`);
  R.check('Esc → 닫힘, 오른쪽 자리 비움 풀림', !s6.bd && !s6.cls, s6);
  const exc = b.logs.filter(x => /EXC/.test(x));
  R.check('PC 예외 0', exc.length === 0, exc.slice(0, 3));
  b.close(); await sleep(500);

  // 2) 휴대폰 — 아래 탭 '게시판'
  const m = await launch({ port: 9802, w: 390, h: 844, mobile: true });
  await setup(m, mk(), {});
  await m.goto(BASE, 300); await ready(m);
  const u0 = await m.evaluate('location.href');
  await m.evaluate(`document.querySelector('#tabbar [data-tab="board"]').click(); true`); await sleep(1200);
  const t1 = await m.evaluate(`(() => { const p = document.getElementById('board-panel'); const r = p && p.getBoundingClientRect();
    return { url: location.href, open: !!p && !p.hidden, n: p ? p.querySelectorAll('.bdp-post').length : 0, inView: r && r.left >= -1 && r.right <= innerWidth + 1 && r.height > 200,
      hscroll: document.documentElement.scrollWidth > innerWidth + 1 }; })()`);
  R.check('휴대폰 아래 탭 게시판 → 같은 패널, 화면 안, 가로 스크롤 없음', t1.url === u0 && t1.open && t1.n === 2 && t1.inView && !t1.hscroll, t1);
  await m.shot(require('path').join(process.env.E2E_OUT || require('path').join(require('os').tmpdir(), 'kr-rail-map-e2e'), 'board-panel-mobile.png'));
  const exc2 = m.logs.filter(x => /EXC/.test(x));
  R.check('휴대폰 예외 0', exc2.length === 0, exc2.slice(0, 3));
  m.close();
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
