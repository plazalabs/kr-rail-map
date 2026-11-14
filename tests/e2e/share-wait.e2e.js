/* e2e: 공유 링크 조건 (K14, 6차 ②8, 2026-11-14)
 *  - 배차 뺌 상태의 공유 링크에도 wait=0 (예전엔 빠져서 받은 사람의 저장값 '배차 넣음'으로 보임)
 *  - 옛 링크 y=2033 (GTX-D 2035 로 정정되며 없어진 연도) → 떡상·타일 지도 모두 2035 로
 * 실행: node tests/e2e/run.js --only share-wait
 */
'use strict';
const { launch, sleep, BASE, recorder } = require('./lib/cdp');
const R = recorder('share-wait');
const base = BASE.split('?')[0];
async function ready(b) {
  for (let i = 0; i < 120; i++) { await sleep(300); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&!!map.getSource('lines')`).catch(() => false)) break; }
  await sleep(800);
}

(async () => {
  const b = await launch({ port: 9772, w: 1200, h: 800 });
  await b.send('Network.setBypassServiceWorker', { bypass: true });
  // 받은 사람은 '배차 넣음'을 저장해 둔 상태
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('krrail-wait', 'peak'); } catch (e) {}` });

  // 1) 보낸 사람이 '뺌' → 세 곳 링크 모두 wait=0
  await b.goto(base + '?wait=0#normal', 800); await ready(b);
  const w0 = await b.evaluate(`KR_WAIT.isPeak()`);
  R.check('?wait=0 링크 → 저장값(넣음)이 있어도 이번엔 뺌', w0 === false, w0);
  await b.evaluate(`(() => { window.__copied = []; const o = navigator.clipboard; Object.defineProperty(navigator, 'clipboard', { value: { writeText: t => { window.__copied.push(t); return Promise.resolve(); } }, configurable: true }); })()`);
  await b.evaluate(`document.getElementById('share-btn').click(); 0`); await sleep(800);
  await b.evaluate(`RocketPanel.open({ st: STATIONS.find(s => s.properties.name_ko === '별내').properties.id }); 0`); await sleep(2500);
  await b.evaluate(`(() => { const x = document.querySelector('#rocket-panel [data-act="link"], #rocket-panel .rkp-link'); if (x) x.click(); })()`); await sleep(800);
  const links = await b.evaluate(`window.__copied.slice()`);
  const mq = await b.evaluate(`(() => { try { MarketMap.open({}); } catch (e) {} return new Promise(r => setTimeout(() => { const a = document.querySelector('#mm-panel [data-act="link"], #mm-panel .mm-link'); if (a) a.click(); setTimeout(() => r(window.__copied.slice()), 800); }, 2500)); })()`);
  const all = [...new Set([...links, ...mq])];
  R.check('공유 링크마다 wait=0 (지도·떡상·타일)', all.length >= 3 && all.some(u => /rocket=1/.test(u)) && all.every(u => /[?&]wait=0\b/.test(u)), all);

  // 2) 옛 링크 y=2033 → 2035
  await b.goto(base + '?rocket=1&y=2033#normal', 800); await ready(b); await sleep(2500);
  const ry = await b.evaluate(`RocketPanel.state().y`);
  R.check('떡상 옛 링크 y=2033 → 2035', String(ry) === '2035', ry);
  await b.goto(base + '?market=1&y=2033#normal', 800); await ready(b); await sleep(3000);
  const my = await b.evaluate(`MarketMap.state().y`);
  R.check('타일 지도 옛 링크 y=2033 → 2035', String(my) === '2035', my);

  const exc = b.logs.filter(x => /EXC/.test(x));
  R.check('예외 0', exc.length === 0, exc.slice(0, 3));
  b.close();
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
