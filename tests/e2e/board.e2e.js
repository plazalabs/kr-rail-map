/* e2e: 게시판 (board.html, 2026-11-12)
 *  - 설정이 비어 있으면(지금 배포 상태) '준비 중' 안내와 오류 제보 링크만
 *  - 설정이 있으면(Supabase 응답을 CDP Fetch 로 흉내): 목록·글쓰기·도배 막기 안내·신고, 글은 HTML 로 해석되지 않음
 * 실행: node tests/e2e/run.js --only board
 */
'use strict';
const { launch, sleep, BASE, recorder } = require('./lib/cdp');
const R = recorder('board');
const PAGE = BASE.replace(/index\.html.*$/, '').replace(/#.*$/, '') + 'board.html';
const SB = 'https://testproj01.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e2e-anon-key-for-tests-only';

(async () => {
  // 1) 지금 배포 설정 (비어 있음)
  const a = await launch({ port: 9799, w: 1100, h: 800 });
  await a.send('Network.setBypassServiceWorker', { bypass: true });
  await a.goto(PAGE, 1200);
  const s0 = await a.evaluate(`({ nr: !document.getElementById('not-ready').hidden, board: !document.getElementById('board').hidden, fb: document.getElementById('fb-link').href, coffee: document.getElementById('coffee-link').hidden })`);
  R.check("설정이 비면 '준비 중' 안내 + 오류 제보 링크, 커피 버튼 숨김", s0.nr && !s0.board && /docs\.google\.com\/forms/.test(s0.fb) && s0.coffee, s0);
  a.close(); await sleep(500);

  // 2) 설정이 있을 때 — board-config.js 와 Supabase REST 를 흉내 낸다
  const b = await launch({ port: 9800, w: 390, h: 844, mobile: true });
  await b.send('Network.setBypassServiceWorker', { bypass: true });
  const posts = [
    { id: 2, created_at: new Date(Date.now() - 120000).toISOString(), kind: 'station', nick: '노원주민', station: '광운대', body: 'GTX-C 2031년이면 좋겠네요', reports: 0 },
    { id: 1, created_at: new Date(Date.now() - 7200000).toISOString(), kind: 'free', nick: '<b>해커</b>', station: null, body: '<img src=x onerror="window.XSS=1">글', reports: 0 },
  ];
  const seen = { post: null, report: null };
  await b.send('Fetch.enable', { patterns: [{ urlPattern: '*board-config.js*' }, { urlPattern: SB + '/*' }] });
  b.handlers.push(async m => {
    if (m.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = m.params;
    const ok = (status, body, type) => b.send('Fetch.fulfillRequest', { requestId, responseCode: status,
      responseHeaders: [{ name: 'Content-Type', value: type || 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Access-Control-Allow-Headers', value: '*' }, { name: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' }],
      body: Buffer.from(body).toString('base64') }).catch(() => {});
    if (/board-config\.js/.test(request.url)) return ok(200, `window.KR_BOARD_CONFIG = { supabaseUrl: '${SB}', anonKey: '${KEY}', coffeeUrl: 'https://toss.me/e2e', feedbackUrl: 'https://docs.google.com/forms/e2e' };`, 'application/javascript');
    if (request.method === 'OPTIONS') return ok(204, '');
    if (/board_posts\?/.test(request.url) && request.method === 'GET') return ok(200, JSON.stringify(posts));
    if (/board_posts$/.test(request.url) && request.method === 'POST') {
      seen.post = { body: request.postData, apikey: request.headers.apikey || request.headers.Apikey };
      const p = JSON.parse(request.postData);
      if (/도배/.test(p.body)) return ok(400, JSON.stringify({ message: '같은 내용을 방금 올렸어요' }));
      posts.unshift({ id: 3, created_at: new Date().toISOString(), kind: p.kind, nick: p.nick, station: p.station, body: p.body, reports: 0 });
      return ok(201, '');
    }
    if (/board_reports$/.test(request.url)) { seen.report = request.postData; return ok(201, ''); }
    return ok(404, '{}');
  });
  await b.goto(PAGE, 1500);
  const s1 = await b.evaluate(`({ board: !document.getElementById('board').hidden, n: document.querySelectorAll('#posts .post').length, xss: !!window.XSS,
    raw: document.querySelectorAll('#posts .post')[1] && document.querySelectorAll('#posts .post')[1].querySelector('.body').textContent,
    coffee: !document.getElementById('coffee-link').hidden && document.getElementById('coffee-link').href, hscroll: document.documentElement.scrollWidth > innerWidth + 1 })`);
  R.check('설정이 있으면 게시판·글 2개·커피 버튼, 휴대폰 가로 스크롤 없음', s1.board && s1.n === 2 && /toss\.me/.test(s1.coffee) && !s1.hscroll, s1);
  R.check('글의 HTML 은 해석되지 않고 글자 그대로 (XSS 막힘)', !s1.xss && /<img src=x/.test(s1.raw || ''), s1.raw);
  // 글쓰기
  await b.evaluate(`(() => { document.getElementById('kind').value = 'station'; document.getElementById('nick').value = '시험';
    document.getElementById('station').value = '창릉'; document.getElementById('body').value = '창릉역 2030년 기대합니다';
    document.getElementById('f').requestSubmit(); })()`);
  await sleep(1200);
  const s2 = await b.evaluate(`({ msg: document.getElementById('msg').textContent, n: document.querySelectorAll('#posts .post').length, first: document.querySelector('#posts .post .body').textContent })`);
  const sent = seen.post ? JSON.parse(seen.post.body) : {};
  R.check('글 올리기 → 고마워요 안내, 맨 위에 새 글, anon 키·익명 아이디로 보냄', /올렸어요/.test(s2.msg) && s2.n === 3 && /창릉역/.test(s2.first) && seen.post && seen.post.apikey === KEY && /^[a-z0-9]{24}$/.test(sent.client_id || '') && sent.station === '창릉', { s2, sent });
  // 같은 브라우저 연달아 → 화면에서 막음
  await b.evaluate(`(() => { document.getElementById('body').value = '하나 더 올려 봅니다'; document.getElementById('f').requestSubmit(); })()`); await sleep(600);
  const s3 = await b.evaluate(`document.getElementById('msg').textContent`);
  R.check('20초 안에 또 올리면 기다리라는 안내', /조금 뒤에/.test(s3), s3);
  // DB 가 도배로 거절하면 그 이유를 보여 줌
  await b.evaluate(`localStorage.removeItem('krrail-board-last'); document.getElementById('body').value = '도배 시험 글'; document.getElementById('f').requestSubmit(); true`); await sleep(1000);
  const s4 = await b.evaluate(`document.getElementById('msg').textContent`);
  R.check('DB 가 도배로 거절하면 그 이유', /같은 내용을 방금/.test(s4), s4);
  // 신고
  await b.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
  await b.evaluate(`window.confirm = () => true; document.querySelector('#posts .post .rep').click(); true`); await sleep(800);
  const s5 = await b.evaluate(`document.querySelector('#posts .post .rep').textContent`);
  R.check('신고 → 신고됨, 글 번호·익명 아이디 보냄', /신고됨/.test(s5) && seen.report && /"post_id":3/.test(seen.report), { s5, report: seen.report });
  const exc = b.logs.filter(x => /EXC/.test(x));
  R.check('예외 0', exc.length === 0, exc.slice(0, 3));
  b.close();
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
