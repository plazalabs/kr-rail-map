/* e2e: 개략 노선도 배치 품질 (2026-11-11)
 *  - 역 동그라미가 6px 안으로 포개진 쌍 0 (예전 228~243쌍)
 *  - 동그라미끼리 닿는 쌍(반지름 합 + 2px 안) 20 이하 (예전 765)
 *  - 선분의 90% 이상이 0·45·90° (±3°) — 노선도다운 모양
 *  - 계산 3초 안, 예외 0
 * 실행: node tests/e2e/run.js --only diagram-layout
 */
'use strict';
const { launch, sleep, BASE, recorder } = require('./lib/cdp');
const R = recorder('diagram-layout');

(async () => {
  const b = await launch({ port: 9731, w: 1440, h: 1000 });
  await b.send('Network.setBypassServiceWorker', { bypass: true });
  await b.goto(BASE + '#normal', 800);
  for (let i = 0; i < 120; i++) { await sleep(400); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady`).catch(() => false)) break; }
  const t0 = Date.now();
  await b.evaluate(`DiagramMode.enter(); true`);
  let ms = null;
  for (let i = 0; i < 100; i++) { await sleep(100); if (await b.evaluate(`document.querySelectorAll('#diagram-overlay .dg-dot').length > 0`)) { ms = Date.now() - t0; break; } }
  R.check('노선도가 3초 안에 그려진다', ms !== null && ms < 3000, ms);
  const r = await b.evaluate(`(() => {
    const d = [...document.querySelectorAll('#diagram-overlay .dg-station')].map(g => { const c = g.querySelector('.dg-dot'); return { n: g.dataset.name, x: +c.getAttribute('cx'), y: +c.getAttribute('cy'), r: +c.getAttribute('r') }; });
    let p6 = 0, touch = 0; const ex = [];
    for (let i = 0; i < d.length; i++) for (let j = i + 1; j < d.length; j++) {
      const dist = Math.hypot(d[i].x - d[j].x, d[i].y - d[j].y);
      if (dist < 6) { p6++; if (ex.length < 5) ex.push(d[i].n + '/' + d[j].n + ' ' + dist.toFixed(1)); }
      if (dist < d[i].r + d[j].r + 2) touch++;
    }
    const ps = [...document.querySelectorAll('#diagram-overlay svg path')].filter(p => p.getAttribute('stroke-width') === '7');
    let ok = 0, n = 0;
    ps.forEach(p => { const pts = p.getAttribute('d').slice(1).split('L').map(t => t.split(' ').map(Number));
      for (let i = 1; i < pts.length; i++) { const a = Math.atan2(pts[i][1] - pts[i-1][1], pts[i][0] - pts[i-1][0]) * 180 / Math.PI; const m = ((a % 45) + 45) % 45; n++; if (Math.min(m, 45 - m) <= 3) ok++; } });
    return { nodes: d.length, p6, touch, ex, snapped: n ? ok / n : 0, segs: n };
  })()`);
  R.check('역이 6px 안으로 포개진 쌍 0', r.nodes > 500 && r.p6 === 0, { nodes: r.nodes, p6: r.p6, ex: r.ex });
  R.check('동그라미끼리 닿는 쌍 20 이하', r.touch <= 20, r.touch);
  R.check('선분 90% 이상이 0·45·90°', r.snapped >= 0.9, { snapped: Math.round(r.snapped * 1000) / 10 + '%', segs: r.segs });
  const exc = b.logs.filter(l => /EXC/.test(l));
  R.check('예외 0', exc.length === 0, exc.slice(0, 3));
  b.close();
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
