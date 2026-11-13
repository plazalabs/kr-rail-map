/* e2e: 공통 '출퇴근 배차 넣기' (js/wait-setting.js · D9, 2026-11-13)
 *  - 기본 꺼짐: 역 타일 범례 '열차 대기 뺌'
 *  - 역 타일에서 켜면 → 범례 '출퇴근 배차 넣음', 떡상 패널 '배차 포함' 눌림, 통근권 체크 켜짐 (한 값 공유)
 *  - 새로고침해도 남음(이 브라우저) → 끄면 다시 기본
 * 실행: node tests/e2e/run.js --only wait-setting
 */
'use strict';
const { launch, sleep, BASE, recorder } = require('./lib/cdp');
const R = recorder('wait-setting');
async function ready(b) {
  for (let i = 0; i < 120; i++) { await sleep(300); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&typeof KR_WAIT!=='undefined'&&typeof MarketMap!=='undefined'`).catch(() => false)) break; }
  await sleep(800);
}
(async () => {
  const b = await launch({ port: 9781, w: 1440, h: 900 });
  await b.goto(BASE + '#normal', 1500); await ready(b);
  await b.evaluate(`localStorage.removeItem('krrail-wait'); 0`);
  await b.goto(BASE + '?market=1#normal', 1500); await ready(b);
  for (let i = 0; i < 40; i++) { if (await b.evaluate(`document.querySelectorAll('#mm-panel .mm-tile').length > 30`)) break; await sleep(300); }
  const l0 = await b.evaluate(`({ peak: KR_WAIT.isPeak(), legend: document.querySelector('#mm-panel .mm-legend').textContent })`);
  R.check("기본 꺼짐 — 범례 '열차 대기 뺌'", !l0.peak && /열차 대기 뺌/.test(l0.legend), l0);
  const before = await b.evaluate(`(() => { const m = MarketMap.model(); let s = 0; m.groups.forEach(G => G.tiles.forEach(t => { s += t.row.aft.min || 0; })); return s; })()`);
  await b.evaluate(`(() => { const c = document.querySelector('#mm-panel .mm-wait'); c.checked = true; c.dispatchEvent(new Event('change')); })()`); await sleep(600);
  const l1 = await b.evaluate(`(() => { const m = MarketMap.model(); let s = 0; m.groups.forEach(G => G.tiles.forEach(t => { s += t.row.aft.min || 0; })); return { peak: KR_WAIT.isPeak(), legend: document.querySelector('#mm-panel .mm-legend').textContent, sum: s }; })()`);
  R.check("역 타일에서 켬 → 범례 '출퇴근 배차 넣음', 개통 후 분이 늘어남(기다림 더함)", l1.peak && /출퇴근 배차 넣음/.test(l1.legend) && l1.sum > before, { before, after: l1.sum });
  await b.evaluate(`MarketMap.close(); RocketPanel.open({}); 0`); await sleep(1500);
  const rk = await b.evaluate(`(() => { const w = document.querySelector('.rkp-wait'); return w ? w.getAttribute('aria-pressed') : null; })()`);
  R.check("떡상 패널 '배차 포함'이 같이 눌림", rk === 'true', rk);
  await b.evaluate(`RocketPanel.close(); document.getElementById('commute-btn').click(); 0`); await sleep(800);
  const cm = await b.evaluate(`(() => { const c = document.getElementById('cm-wait'); return c ? c.checked : null; })()`);
  R.check('통근권 체크도 켜짐', cm === true, cm);
  await b.goto(BASE + '#normal', 1500); await ready(b);
  const kept = await b.evaluate(`KR_WAIT.isPeak()`);
  R.check('새로고침해도 남음 (이 브라우저)', kept === true);
  await b.evaluate(`KR_WAIT.set('none'); 0`); await sleep(200);
  const off = await b.evaluate(`({ peak: KR_WAIT.isPeak(), ls: localStorage.getItem('krrail-wait') })`);
  R.check('끄면 기본으로', !off.peak && off.ls === 'none', off);
  const exc = b.logs.filter(l => /EXC/.test(l));
  R.check('예외 0', exc.length === 0, exc.slice(0, 3));
  b.close();
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
