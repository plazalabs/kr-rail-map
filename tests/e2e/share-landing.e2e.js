/* e2e: 공유 성공 통계 (2026-11-15)
 *  - 공유 카드로 들어온 사람(?ref=card-… / 11-14 판 ?from=card-…): '공유로 도착' 이벤트 1번, 주소에서 이름표 지움,
 *    길찾기 출발역 칸에 'card-…' 가 들어가지 않음(버그였음), 첫 방문 안내 카드는 뜸(버그였음 — 링크로 온 사람으로 봤음)
 *  - 카드 공유 결과 share_result(저장함) 가 누름 share_card 뒤에 따로 셈
 *  - 진짜 길찾기 링크 ?from=서울&to=… 는 그대로 길찾기
 * Umami 는 로컬에서 안 뜨므로 window.umami 흉내로 이벤트를 모은다.
 * 실행: node tests/e2e/run.js --only share-landing
 */
'use strict';
const { launch, sleep, BASE, recorder } = require('./lib/cdp');
const R = recorder('share-landing');
const STUB = `window.__ev = []; window.umami = { track: function (n, d) { window.__ev.push([n, d || null]); } };`;
async function ready(b) {
  for (let i = 0; i < 120; i++) { await sleep(400); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&map.loaded()`).catch(() => false)) break; }
  await sleep(1500);
}
const root = BASE.replace(/#.*$/, '').replace(/\?.*$/, '');
(async () => {
  for (const q of ['?ref=card-top10', '?from=card-top10']) {
    const b = await launch({ port: 9793, w: 1440, h: 900, guide: true });
    await b.send('Network.setBypassServiceWorker', { bypass: true });
    await b.send('Page.addScriptToEvaluateOnNewDocument', { source: STUB });
    await b.goto(root + q + '#normal', 800); await ready(b);
    const s = await b.evaluate(`({ ev: __ev.filter(e => e[0] === '공유로 도착'), search: location.search, hash: location.hash,
      from: document.getElementById('route-from').value, rp: !document.getElementById('route-panel').hidden, guide: !!document.getElementById('guide-card') })`);
    R.check(`${q}: '공유로 도착' 1번(종류 card-top10·첫방문 예)`, s.ev.length === 1 && s.ev[0][1].종류 === 'card-top10' && s.ev[0][1].첫방문 === '예', s.ev);
    R.check(`${q}: 주소에서 이름표 지움(해시는 남김)`, s.search === '' && s.hash === '#normal', s);
    R.check(`${q}: 출발역 칸 비어 있고 길찾기 창 안 열림`, s.from === '' && !s.rp, s);
    R.check(`${q}: 처음 온 사람 안내 카드가 뜬다`, s.guide, s);
    if (q === '?ref=card-top10') {
      // 카드 저장(PC 는 내려받기) → share_card 다음 share_result 저장함
      const r = await b.evaluate(`(async () => { const c = document.createElement('canvas'); c.width = 10; c.height = 10;
        const m = await StationShareImage.saveCanvas(c, 't.png', 't', 'card-top10');
        return { m, ev: __ev.filter(e => /^share_/.test(e[0])) }; })()`);
      R.check('카드 저장: share_card → share_result(저장함 또는 공유 실패→저장)', r.ev.length === 2 && r.ev[0][0] === 'share_card' && r.ev[1][0] === 'share_result' && /저장/.test(r.ev[1][1].결과), r);   // 시험 크롬은 공유 창 권한이 없어 '공유 실패→저장'
    }
    const exc = b.logs.filter(l => /EXC/.test(l));
    R.check(`${q}: 예외 0`, exc.length === 0, exc.slice(0, 3));
    b.close(); await sleep(800);
  }
  // 진짜 길찾기 링크는 그대로
  const b = await launch({ port: 9794, w: 1440, h: 900 });
  await b.send('Network.setBypassServiceWorker', { bypass: true });
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: STUB });
  await b.goto(root + '?from=' + encodeURIComponent('서울역') + '&to=' + encodeURIComponent('강남') + '#normal', 800); await ready(b);
  const s = await b.evaluate(`({ from: document.getElementById('route-from').value, search: location.search, arr: __ev.filter(e => e[0] === '공유로 도착').length })`);
  R.check('길찾기 링크 ?from=서울역&to=강남: 출발역 칸 유지·주소 그대로·도착 이벤트 없음', /서울/.test(s.from) && /from=/.test(s.search) && s.arr === 0, s);
  b.close();
  // 순위표 페이지도 셈 (track.js 를 새로 붙임)
  const r2 = await launch({ port: 9795, w: 1440, h: 900 });
  await r2.send('Network.setBypassServiceWorker', { bypass: true });
  await r2.send('Page.addScriptToEvaluateOnNewDocument', { source: STUB });
  await r2.goto(root.replace(/[^/]*$/, '') + 'rank.html?ref=card-rank', 3000);
  const rr = await r2.evaluate(`({ ev: (window.__ev||[]).filter(e => e[0] === '공유로 도착').map(e => e[1].종류), search: location.search, kt: typeof KRTrack, um: typeof umami, all: window.__ev, logs: 0 })`);
  R.check('rank.html?ref=card-rank: 도착 1번·이름표 지움', rr.ev.length === 1 && rr.ev[0] === 'card-rank' && rr.search === '', Object.assign(rr, { logs: r2.logs.slice(0, 6) }));
  r2.close();
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
