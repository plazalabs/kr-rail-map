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
  // D8 (2026-11-14, 68점 평가 13번): 노선 고르기 → 고른 노선만 진하게·그 노선 역명 모두·그 노선에 맞춤 / 화면 맞춤은 가운데
  await b.evaluate(`document.getElementById('dg-fit').click(); 0`); await sleep(400);
  const fitC = await b.evaluate(`(() => { const s = document.querySelector('#diagram-overlay .dg-scroll').getBoundingClientRect(), c = document.querySelector('#diagram-overlay .dg-canvas svg').getBoundingClientRect();
    return { left: Math.round(c.left - s.left), right: Math.round(s.right - c.right), top: Math.round(c.top - s.top), bottom: Math.round(s.bottom - c.bottom) }; })()`);
  R.check('화면 맞춤: 그림이 가운데 (좌우 여백 차이 ≤ 30px · 위아래 차이 ≤ 30px)', Math.abs(fitC.left - fitC.right) <= 30 && Math.abs(fitC.top - fitC.bottom) <= 30, fitC);
  const opts = await b.evaluate(`[...document.querySelectorAll('#dg-pick option')].length`);
  await b.evaluate(`(() => { const s = document.getElementById('dg-pick'); const o = [...s.options].find(x => x.textContent === '2호선' || /2호선/.test(x.textContent)); s.value = o.value; s.dispatchEvent(new Event('change')); })()`); await sleep(600);
  const fo = await b.evaluate(`(() => { const lid = DiagramMode.focused(); const ps = [...document.querySelectorAll('#diagram-overlay path.dg-line')];
    const on = ps.filter(p => p.getAttribute('data-line') === lid), off = ps.filter(p => p.getAttribute('data-line') !== lid);
    const st = [...document.querySelectorAll('#diagram-overlay .dg-station')].filter(g => (g.dataset.lines || '').split(',').includes(lid));
    const names = new Set([...document.querySelectorAll('#diagram-overlay svg text')].map(t => t.textContent));
    const labeled = st.filter(g => names.has(g.dataset.name)).length;
    const sc = document.querySelector('#diagram-overlay .dg-scroll').getBoundingClientRect();
    const vis = st.filter(g => { const r = g.getBoundingClientRect(); return r.left >= sc.left - 5 && r.right <= sc.right + 5 && r.top >= sc.top - 5 && r.bottom <= sc.bottom + 5; }).length;
    return { lid, on: on.length, offDim: off.every(p => p.style.opacity === '0.12'), st: st.length, labeled, vis }; })()`);
  R.check('노선 고르기 목록(전체 + 노선들)', opts > 20, opts);
  R.check('2호선 고르면: 그 선만 진하고 나머지 흐림 · 역명 80% 이상 · 역이 다 화면 안', fo.on > 0 && fo.offDim && fo.labeled >= fo.st * 0.8 && fo.vis === fo.st, fo);
  await b.evaluate(`(() => { const s = document.getElementById('dg-pick'); s.value = ''; s.dispatchEvent(new Event('change')); })()`); await sleep(300);
  const back = await b.evaluate(`[...document.querySelectorAll('#diagram-overlay path.dg-line')].every(p => p.style.opacity === '') && DiagramMode.focused() === null`);
  R.check("'전체 노선'으로 돌리면 흐림 풀림", back, back);
  R.check('예외 0', exc.length === 0, exc.slice(0, 3));
  b.close();
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
