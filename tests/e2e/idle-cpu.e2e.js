/* e2e: 가만히 있을 때 CPU를 안 쓴다 (R8 실측, 2026-11-15)
 *  - 오른쪽 창 손잡이(js/panel-fold.js)가 자기 hidden 을 매 프레임 다시 써 관찰자가 다시 부르는 고리 → 10초에 스타일 계산 600번·CPU 300ms
 *  - 다 뜬 뒤 5초 동안 스타일 다시 계산 30번 미만·스크립트 100ms 미만 (PC·휴대폰, 축지법 패널 연 뒤에도)
 * 실행: node tests/e2e/run.js --only idle-cpu
 */
'use strict';
const { launch, sleep, BASE, recorder } = require('./lib/cdp');
const R = recorder('idle-cpu');
async function ready(b) {
  for (let i = 0; i < 120; i++) { await sleep(400); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&map.loaded()`).catch(() => false)) break; }
  await sleep(4000);
}
async function idle(b) {
  const m = async () => Object.fromEntries((await b.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]));
  const a = await m(); await sleep(5000); const z = await m();
  return { style: z.RecalcStyleCount - a.RecalcStyleCount, scriptMs: Math.round((z.ScriptDuration - a.ScriptDuration) * 1000) };
}
(async () => {
  for (const [w, h, mobile] of [[1440, 900, false], [390, 844, true]]) {
    const b = await launch({ port: 9796, w, h, mobile });
    await b.send('Network.setBypassServiceWorker', { bypass: true });
    await b.send('Performance.enable', {});
    await b.goto(BASE, 800); await ready(b);
    const r1 = await idle(b);
    R.check(`${w}px 첫 화면 가만히 5초: 스타일 계산 30번 미만·스크립트 100ms 미만`, r1.style < 30 && r1.scriptMs < 100, r1);
    await b.evaluate(`RocketPanel.open({}); true`); await sleep(2500);
    const r2 = await idle(b);
    R.check(`${w}px 축지법 패널 연 뒤 가만히 5초: 같은 기준`, r2.style < 30 && r2.scriptMs < 100, r2);
    b.close(); await sleep(800);
  }
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
