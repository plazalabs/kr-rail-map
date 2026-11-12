/* e2e: 역 상세 안 '💬 이 역 이야기' (js/station-talk.js, 2026-11-12)
 *  - 게시판 설정이 비면(지금 배포) '준비 중' 한 줄 + 게시판 링크, 글쓰기 칸 없음
 *  - 설정이 있으면(Supabase 응답을 CDP Fetch 로 흉내):
 *      그 역 ID 로만 거른 목록(station=like.*·역ID), 글은 HTML 로 해석되지 않음(XSS 막힘),
 *      글쓰기 → kind=station · station='역이름·역ID' 로 올라가고 목록에 바로 보임, 신고 버튼
 *  - 다른 역을 열면 그 역 목록으로 바뀜
 * 실행: node tests/e2e/run.js --only station-talk
 */
'use strict';
const { launch, sleep, BASE, recorder } = require('./lib/cdp');
const R = recorder('station-talk');
const SB = 'https://testproj01.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e2e-anon-key-for-tests-only';
const KW = 'st-355172776';   // 광운대

async function ready(b) {
  for (let i = 0; i < 120; i++) { await sleep(300); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&!!map.getSource('lines')`).catch(() => false)) break; }
  await sleep(600);
}
const open = (b, id) => b.evaluate(`(() => { const f = STATIONS.find(s => s.properties.id === '${id}'); showStation(f); return true; })()`);
async function until(b, expr, n = 40) { for (let i = 0; i < n; i++) { if (await b.evaluate(expr).catch(() => false)) return true; await sleep(250); } return false; }

(async () => {
  // 1) 설정 없음 (지금 배포 상태)
  const a = await launch({ port: 9841, w: 1440, h: 900 });
  await a.send('Network.setBypassServiceWorker', { bypass: true });
  await a.goto(BASE + '#normal', 800); await ready(a);
  await open(a, KW);
  await until(a, `!!document.querySelector('#sd-panel .sd-talk')`);
  const s0 = await a.evaluate(`(() => { const t = document.querySelector('#sd-panel .sd-talk'); return { has: !!t, form: !!(t && t.querySelector('form')), text: t && t.textContent, link: !!(t && t.querySelector('a[href="board.html"]')) }; })()`);
  R.check("설정이 비면 '💬 이 역 이야기 · 준비 중' + 게시판 링크, 글쓰기 칸 없음", s0.has && !s0.form && /준비 중/.test(s0.text) && s0.link, s0);
  a.close(); await sleep(500);

  // 2) 설정 있음 — board-config.js 와 Supabase REST 흉내
  const b = await launch({ port: 9842, w: 390, h: 844, mobile: true });
  await b.send('Network.setBypassServiceWorker', { bypass: true });
  const posts = [
    { id: 11, created_at: new Date(Date.now() - 180000).toISOString(), kind: 'station', nick: '노원주민', station: '광운대·' + KW, body: 'GTX-C 정차 기대돼요', reports: 0 },
    { id: 10, created_at: new Date(Date.now() - 9000000).toISOString(), kind: 'station', nick: '<b>해커</b>', station: '광운대·' + KW, body: '<img src=x onerror="window.XSS=1">글', reports: 0 },
    { id: 9, created_at: new Date(Date.now() - 9000000).toISOString(), kind: 'station', nick: '다른역', station: '시청·st-5935738063', body: '시청 이야기', reports: 0 },
  ];
  const seen = { gets: [], post: null, report: null };
  await b.send('Fetch.enable', { patterns: [{ urlPattern: '*board-config.js*' }, { urlPattern: SB + '/*' }] });
  b.handlers.push(async m => {
    if (m.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = m.params;
    const ok = (status, body, type) => b.send('Fetch.fulfillRequest', { requestId, responseCode: status,
      responseHeaders: [{ name: 'Content-Type', value: type || 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Access-Control-Allow-Headers', value: '*' }, { name: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' }],
      body: Buffer.from(body).toString('base64') }).catch(() => {});
    if (/board-config\.js/.test(request.url)) return ok(200, `window.KR_BOARD_CONFIG = { supabaseUrl: '${SB}', anonKey: '${KEY}', coffeeUrl: '', feedbackUrl: '' };`, 'application/javascript');
    if (request.method === 'OPTIONS') return ok(204, '');
    if (/board_posts\?/.test(request.url) && request.method === 'GET') {
      const u = decodeURIComponent(request.url); seen.gets.push(u);
      const m2 = /station=like\.\*·(st-[0-9]+)/.exec(u);
      const rows = m2 ? posts.filter(p => p.station.endsWith('·' + m2[1])) : posts;
      return ok(200, JSON.stringify(rows));
    }
    if (/board_posts$/.test(request.url) && request.method === 'POST') {
      const p = JSON.parse(request.postData); seen.post = p;
      posts.unshift({ id: 12, created_at: new Date().toISOString(), kind: p.kind, nick: p.nick, station: p.station, body: p.body, reports: 0 });
      return ok(201, '');
    }
    if (/board_reports$/.test(request.url)) { seen.report = request.postData; return ok(201, ''); }
    return ok(404, '{}');
  });
  await b.goto(BASE + '#normal', 800); await ready(b);
  await open(b, KW);
  await until(b, `document.querySelectorAll('#sd-panel .sd-talk-item').length >= 2`);
  const s1 = await b.evaluate(`(() => { const items = [...document.querySelectorAll('#sd-panel .sd-talk-item')];
    return { n: items.length, texts: items.map(x => x.querySelector('.sd-talk-text').textContent), nicks: items.map(x => x.querySelector('b').textContent), xss: !!window.XSS, form: !!document.querySelector('#sd-panel .sd-talk-form') }; })()`);
  R.check('광운대 역 이야기 2개만 (시청 글은 안 섞임) + 글쓰기 칸', s1.n === 2 && !s1.texts.includes('시청 이야기') && s1.form, s1);
  R.check('목록 요청이 역 ID 로 거름 (station=like.*·st-355172776, kind=station)', seen.gets.some(u => u.includes('station=like.*·' + KW) && u.includes('kind=eq.station')), seen.gets.slice(-1));
  R.check('글·닉네임의 HTML 은 해석되지 않음 (XSS 막힘)', !s1.xss && s1.texts.some(t => t.startsWith('<img src=x')) && s1.nicks.includes('<b>해커</b>'), s1);

  // 글쓰기 — 실제 입력 → 등록
  await b.evaluate(`(() => { const f = document.querySelector('#sd-panel .sd-talk-form'); f.querySelector('.sd-talk-nick').value = '시험'; f.querySelector('.sd-talk-body').value = '광운대역 출구 공사 끝났어요'; f.querySelector('.sd-talk-go').click(); return true; })()`);
  await until(b, `[...document.querySelectorAll('#sd-panel .sd-talk-text')].some(x => x.textContent === '광운대역 출구 공사 끝났어요')`);
  const s2 = await b.evaluate(`({ n: document.querySelectorAll('#sd-panel .sd-talk-item').length, first: (document.querySelector('#sd-panel .sd-talk-text')||{}).textContent, msg: (document.querySelector('#sd-panel .sd-talk-msg')||{}).textContent, body: document.querySelector('#sd-panel .sd-talk-body').value, nick: localStorage.getItem('krrail-board-nick') })`);
  R.check("글쓰기 → kind=station · station='광운대·st-355172776' 로 올라감", seen.post && seen.post.kind === 'station' && seen.post.station === '광운대·' + KW && seen.post.nick === '시험', seen.post);
  R.check('올린 글이 목록 맨 위에 바로 보이고 입력칸 비움, 닉네임 기억', s2.n === 3 && s2.first === '광운대역 출구 공사 끝났어요' && /올렸어요/.test(s2.msg) && s2.body === '' && s2.nick === '시험', s2);

  // 신고
  await b.evaluate(`window.confirm = () => true; document.querySelector('#sd-panel .sd-talk-report').click(); true`);
  await until(b, `/신고됨/.test(document.querySelector('#sd-panel .sd-talk-report').textContent)`);
  R.check('신고 버튼 → board_reports 에 그 글 ID', !!seen.report && JSON.parse(seen.report).post_id === 12, seen.report);

  // 다른 역(시청)을 열면 그 역 목록
  await open(b, 'st-5935738063');
  await until(b, `[...document.querySelectorAll('#sd-panel .sd-talk-text')].some(x => x.textContent === '시청 이야기')`);
  const s3 = await b.evaluate(`({ sid: document.querySelector('#sd-panel .sd-talk').getAttribute('data-sid'), texts: [...document.querySelectorAll('#sd-panel .sd-talk-text')].map(x => x.textContent), ph: document.querySelector('#sd-panel .sd-talk-body').placeholder })`);
  R.check('시청을 열면 시청 이야기만, 입력칸 안내도 시청역', s3.sid === 'st-5935738063' && s3.texts.length === 1 && s3.texts[0] === '시청 이야기' && /시청역/.test(s3.ph), s3);

  const exc = b.logs.filter(x => /EXC/.test(x));
  R.check('예외 0', exc.length === 0, exc.slice(0, 3));
  b.close();
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
