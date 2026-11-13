/* e2e: 공유 링크에 비교 조건 (H7, 2026-11-14 · 68점 평가 19-12)
 *  - ?wait=1 로 열면 배차 포함으로 보이고(이번 방문만), 저장값은 그대로
 *  - 타일 지도 링크 복사 → &wait=1 포함 (배차 포함일 때)
 *  - 지도 '링크 복사' → 길찾기 + 개통 예정 포함이면 &unopened=1, 배차 포함이면 &wait=1
 *  - ?unopened=1 로 열면 '개통 예정 노선 포함'이 켜짐
 * 실행: node tests/e2e/run.js --only share-conditions
 */
'use strict';
const { launch, sleep, BASE, recorder } = require('./lib/cdp');
const R = recorder('share-conditions');

async function ready(b) {
  for (let i = 0; i < 120; i++) { await sleep(250); if (await b.evaluate(`typeof dataReady !== 'undefined' && dataReady`).catch(() => false)) break; }
  await sleep(500);
}
const CLIP = `window.__clip = null; try { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: t => { window.__clip = t; return Promise.resolve(); } } }); } catch (e) {}`;

(async () => {
  const b = await launch({ port: 9814, w: 1440, h: 900 });
  await b.goto(BASE + '?market=1&wait=1#normal', 500); await ready(b);
  for (let i = 0; i < 60; i++) { if (await b.evaluate(`document.querySelectorAll('#mm-panel .mm-tile').length > 30`).catch(() => false)) break; await sleep(250); }
  const w = await b.evaluate(`({ peak: KR_WAIT.isPeak(), saved: (() => { try { return localStorage.getItem('krrail-wait'); } catch (e) { return 'x'; } })(), box: document.querySelector('#mm-panel .mm-wait').checked })`);
  R.check('?wait=1 로 열면 배차 포함(타일 지도 체크도 켜짐), 저장값은 안 바뀜', w.peak && w.box && w.saved !== 'peak', w);
  await b.evaluate(CLIP);
  await b.evaluate(`document.querySelector('#mm-panel .mm-link').click(); 0`); await sleep(400);
  const mm = await b.evaluate(`window.__clip`);
  R.check('타일 지도 링크에 &wait=1', /[?&]wait=1/.test(mm || ''), mm);
  await b.evaluate(`MarketMap.close && MarketMap.close(); 0`); await sleep(300);

  // 지도 링크: 길찾기 + 개통 예정 포함
  await b.goto(BASE + '?from=st-355172776&to=st-355172776&from_id=st-355172776&to_id=st-5935738063&unopened=1#normal', 500); await ready(b);
  const u = await b.evaluate(`document.getElementById('route-unopened').checked`);
  R.check('?unopened=1 로 열면 개통 예정 노선 포함이 켜짐', u === true, u);
  await b.evaluate(CLIP);
  await b.evaluate(`KR_WAIT.set('peak'); document.getElementById('share-btn').click(); 0`); await sleep(600);
  const sh = await b.evaluate(`window.__clip`);
  R.check('지도 링크에 길찾기(from_id·to_id) + &unopened=1 + &wait=1', /from_id=/.test(sh || '') && /to_id=/.test(sh || '') && /[?&]unopened=1/.test(sh || '') && /[?&]wait=1/.test(sh || ''), sh);
  await b.evaluate(`KR_WAIT.set('none'); 0`);
  const exc = b.logs.filter(x => /EXC/.test(x));
  R.check('예외 0', exc.length === 0, exc.slice(0, 3));
  b.close();
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
