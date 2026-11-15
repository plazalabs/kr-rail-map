/* e2e: 오른쪽 작업 창은 한 번에 하나 (평가① P2, 2026-11-15)
 *  - 길찾기 결과를 띄운 뒤 통근권을 켜면 길찾기 창·경로 선이 정리되고 통근권 창만 보인다 (전엔 320×566px 겹침)
 *  - 통근권 → 길찾기 / 떡상 → 통근권 / 통근권 → 떡상 / 게시판 → 통근권 도 겹치지 않는다
 *  - 오른쪽 창 접기 손잡이가 통근권 창에도 붙는다 (PC)
 *  - 휴대폰(390×844)에서도 같은 순서로 겹침 0
 * 실행: node tests/e2e/run.js --only right-panels
 */
'use strict';
const { launch, sleep, BASE, recorder } = require('./lib/cdp');
const R = recorder('right-panels');

async function ready(b) {
  for (let i = 0; i < 120; i++) { await sleep(400); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&map.loaded()`).catch(() => false)) break; }
  await sleep(600);
}
// 보이는 오른쪽 창들과 서로 겹친 넓이
const STATE = `(() => {
  const sel = ['#route-panel', '#draw-panel', '#cm-panel', '#rocket-panel', '#board-panel'];
  const vis = sel.map(s => document.querySelector(s)).filter(e => e && !e.hidden && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0);
  const rs = vis.map(e => ({ id: e.id, r: e.getBoundingClientRect() }));
  let overlap = 0, pair = null;
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
    const a = rs[i].r, c = rs[j].r;
    const w = Math.min(a.right, c.right) - Math.max(a.left, c.left), h = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
    if (w > 0 && h > 0 && w * h > overlap) { overlap = Math.round(w * h); pair = rs[i].id + '+' + rs[j].id; }
  }
  return { open: rs.map(x => x.id), overlap, pair,
    routeLine: !!(map.getLayer && map.getLayer('route-highlight-line')),
    cm: typeof CommuteMap !== 'undefined' && CommuteMap.isActive(),
    fold: (() => { const t = document.getElementById('rpanel-toggle'); return !!t && !t.hidden; })() };
})()`;

async function findRoute(b) {
  await b.evaluate(`(() => { document.getElementById('route-panel').hidden = false;
    const f = document.getElementById('route-from'), t = document.getElementById('route-to');
    f.value = '광화문'; delete f.dataset.sid; t.value = '강남'; delete t.dataset.sid;
    document.getElementById('route-go').click(); })()`);
  await sleep(1500);
}
const openCommute = b => b.evaluate(`CommuteMap.show(); true`).then(() => sleep(1200));
const openRocket = b => b.evaluate(`(() => { const e = document.getElementById('rocket-btn') || document.querySelector('[data-rocket-open]'); if (e) e.click(); else if (window.RocketPanel && RocketPanel.open) RocketPanel.open(); return true; })()`).then(() => sleep(1500));
const openBoard = b => b.evaluate(`(() => { if (window.BoardPanel) BoardPanel.open(); return true; })()`).then(() => sleep(1200));

async function run(label, opts) {
  const b = await launch(opts);
  await b.send('Network.setBypassServiceWorker', { bypass: true });
  await b.goto(BASE + '#normal', 800); await ready(b);

  await findRoute(b);
  const s0 = await b.evaluate(STATE);
  R.check(`${label} 길찾기 결과가 떠 있다 (시작 조건)`, s0.open.includes('route-panel') && s0.routeLine, s0);
  await openCommute(b);
  const s1 = await b.evaluate(STATE);
  R.check(`${label} 길찾기 → 통근권: 통근권 창만, 겹침 0, 경로 선 지움`, s1.overlap === 0 && s1.open.join() === 'cm-panel' && !s1.routeLine, s1);
  if (!opts.mobile) R.check(`${label} 통근권 창에도 오른쪽 접기 손잡이`, s1.fold, s1);

  await b.evaluate(`document.getElementById('route-panel').hidden = false; true`); await sleep(500);
  const s2 = await b.evaluate(STATE);
  R.check(`${label} 통근권 → 길찾기: 통근권 닫힘, 겹침 0`, s2.overlap === 0 && !s2.cm && s2.open.join() === 'route-panel', s2);

  await openRocket(b);
  await openCommute(b);
  const s3 = await b.evaluate(STATE);
  R.check(`${label} 떡상 → 통근권: 겹침 0, 통근권만`, s3.overlap === 0 && s3.open.join() === 'cm-panel', s3);
  await openRocket(b);
  const s4 = await b.evaluate(STATE);
  R.check(`${label} 통근권 → 떡상: 겹침 0, 통근권 닫힘`, s4.overlap === 0 && !s4.cm, s4);

  await openBoard(b);
  await openCommute(b);
  const s5 = await b.evaluate(STATE);
  R.check(`${label} 게시판 → 통근권: 겹침 0`, s5.overlap === 0 && s5.open.join() === 'cm-panel', s5);

  const exc = b.logs.filter(x => /EXC/.test(x));
  R.check(`${label} 예외 0`, exc.length === 0, exc.slice(0, 3));
  b.close();
}

(async () => {
  await run('PC 1366×768', { port: 9861, w: 1366, h: 768 });
  await run('휴대폰 390×844', { port: 9862, w: 390, h: 844, mobile: true });
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
