/* e2e: 길찾기 칩·모드 전환 (K10, 6차 ①A7·A8·②5, 2026-11-14)
 *  - 줌 12 미만: 역 칩은 출발·도착·환승만, 12 이상: 전부
 *  - 떡상·시세로 바꾸면 경로 선·칩이 지워짐 (예전엔 남아서 떡상 순위·시세 색과 겹침)
 *  - 배경(위성·흑백·일반)을 바꿔도 경로 선이 다시 그려짐 (예전엔 선은 사라지고 칩만 남음)
 * 실행: node tests/e2e/run.js --only route-mode
 */
'use strict';
const { launch, sleep, BASE, recorder } = require('./lib/cdp');
const R = recorder('route-mode');
const st = b => b.evaluate(`({ route: !!map.getLayer('route-casing'), chips: document.querySelectorAll('.rt-label').length, panel: !document.getElementById('route-panel').hidden })`);
const go = async b => {
  await b.evaluate(`(() => { const S = n => STATIONS.find(s => s.properties.name_ko === n && s.properties.lines.includes('seoul-subway-line-2')) || STATIONS.find(s => s.properties.name_ko === n);
    document.getElementById('route-panel').hidden = false;
    setRouteStation(document.getElementById('route-from'), S('강남')); setRouteStation(document.getElementById('route-to'), S('서울'));
    document.getElementById('route-go').click(); })()`);
  for (let i = 0; i < 30; i++) { await sleep(250); if ((await st(b)).route) break; }
  await sleep(400);
};

(async () => {
  const b = await launch({ port: 9771, w: 1200, h: 800 });
  await b.send('Network.setBypassServiceWorker', { bypass: true });
  await b.goto(BASE + '#normal', 800);
  for (let i = 0; i < 120; i++) { await sleep(300); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&!!map.getSource('lines')&&typeof RouteCompare!=='undefined'`).catch(() => false)) break; }

  await go(b);
  const s0 = await st(b);
  R.check('경로 그려짐', s0.route && s0.chips >= 5, s0);
  await b.evaluate(`map.jumpTo({ center: map.getCenter(), zoom: 11 }); 0`); await sleep(500);
  const far = await b.evaluate(`[...document.querySelectorAll('.rt-label')].filter(x => getComputedStyle(x).display !== 'none').map(x => x.lastChild.textContent)`);
  R.check('줌 11: 출발·도착·환승만 (강남·서울 포함, 전체보다 적음)', far.includes('강남') && far.includes('서울') && far.length >= 2 && far.length < s0.chips, far);
  await b.evaluate(`map.jumpTo({ center: map.getCenter(), zoom: 13 }); 0`); await sleep(500);
  const near = await b.evaluate(`[...document.querySelectorAll('.rt-label')].filter(x => getComputedStyle(x).display !== 'none').length`);
  R.check('줌 13: 칩 전부', near === s0.chips, { near, all: s0.chips });

  for (const t of ['rocket', 'price']) {
    await go(b);
    await b.evaluate(`document.querySelector('#tabbar [data-tab="${t}"]').click(); 0`); await sleep(1500);
    const s = await st(b);
    R.check(`${t === 'rocket' ? '떡상' : '시세'}으로 바꾸면 경로·칩 지움`, !s.route && s.chips === 0, s);
    if (t === 'price') { await b.evaluate(`document.querySelector('#tabbar [data-tab="price"]').click(); 0`); await sleep(600); }
    else await b.evaluate(`document.querySelector('#tabbar [data-tab="rocket"]').click(); 0`); await sleep(600);
  }

  await go(b);
  for (const m of ['satellite', 'gray', 'normal']) {
    await b.evaluate(`location.hash = '#${m}'; 0`);
    let s; for (let i = 0; i < 30; i++) { await sleep(300); s = await st(b); if (s.route) break; }
    R.check(`배경 ${m}: 경로 선 다시 그려짐·칩과 함께`, s.route && s.chips === s0.chips, s);
  }
  const exc = b.logs.filter(x => /EXC/.test(x));
  R.check('예외 0', exc.length === 0, exc.slice(0, 3));
  b.close();
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
