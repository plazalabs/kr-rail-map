/* e2e: 🚀 떡상 지도 레이어 (js/rocket-map.js, 2026-11-12)
 *  - 기본은 꺼짐 (rank.json 을 받지 않음)
 *  - 켜면 범례가 보이고, 수도권 역이 등급 색으로 칠해진다 — 광운대는 떡상
 *  - 배경(테마)을 바꿔도 레이어가 다시 붙는다
 *  - 끄면 레이어·범례가 사라진다
 * 실행: node tests/e2e/run.js --only rocket-map
 */
'use strict';
const path = require('path');
const { launch, sleep, BASE, recorder, outDir } = require('./lib/cdp');
const R = recorder('rocket-map');
// 광운대 기대값 — 화면과 같은 계산(js/rank.js)으로 rank.json 에서 직접 낸다 (숫자를 박아 두지 않는다)
const KW = (() => {
  const fs = require('fs'), p = require('path');
  const RT = require(p.join(__dirname, '..', '..', 'js', 'rank.js'));
  const doc = JSON.parse(fs.readFileSync(p.join(__dirname, '..', '..', 'data', 'rank.json'), 'utf8'));
  const r = RT.compute(doc, { weight: 'avg', region: 'capital' }).rows.find(x => x.name === '광운대');
  return { now: r.now.rank, aft: r.aft.rank, change: r.change };
})();

async function ready(b) {
  for (let i = 0; i < 120; i++) { await sleep(300); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&!!map.getSource('lines')`).catch(() => false)) break; }
  await sleep(800);
}

(async () => {
  const b = await launch({ port: 9797, w: 1440, h: 900 });
  await b.send('Network.setBypassServiceWorker', { bypass: true });
  await b.goto(BASE + '#normal', 800); await ready(b);
  const off = await b.evaluate(`({ layer: !!map.getLayer('rocket-tier'), legend: document.getElementById('rk-legend').hidden,
    fetched: performance.getEntriesByType('resource').some(e => /rank\\.json/.test(e.name)) })`);
  R.check('기본은 꺼짐 — 레이어·범례 없음, rank.json 안 받음', !off.layer && off.legend && !off.fetched, off);

  await b.evaluate(`(() => { const c = document.getElementById('layer-rocket'); c.click(); })()`);
  let on = null;
  for (let i = 0; i < 40; i++) { await sleep(250); on = await b.evaluate(`!!map.getLayer('rocket-tier')`); if (on) break; }
  await b.evaluate(`map.jumpTo({ center: [127.03, 37.58], zoom: 10.5 }); true`);
  // 점이 실제로 그려질 때까지 (헤드리스 소프트웨어 그리기는 느리다) 최대 10초
  for (let i = 0; i < 40; i++) { await sleep(250); if (await b.evaluate(`map.queryRenderedFeatures({ layers: ['rocket-tier'] }).length > 50`).catch(() => false)) break; }
  const st = await b.evaluate(`(() => { const f = StationRocket.features() || []; const n = {}; f.forEach(x => { n[x.properties.t] = (n[x.properties.t] || 0) + 1; });
    const kw = f.find(x => x.properties.id === 'st-355172776');
    const vis = map.queryRenderedFeatures({ layers: ['rocket-tier'] }).length;
    return { on: !!map.getLayer('rocket-tier'), legend: !document.getElementById('rk-legend').hidden, n, kw: kw && kw.properties, vis }; })()`);
  R.check('켜면 레이어·범례가 보이고 화면에 역 점이 그려진다', st.on && st.legend && st.vis > 50, st);
  R.check(`광운대는 🚀 떡상 (▲${KW.change}, 수도권 순위 — rank.json 과 같음)`, st.kw && st.kw.t === 'rocket' && st.kw.c === KW.change && st.kw.cap === 1, st.kw);
  R.check('등급 5가지가 모두 있다', ['rocket', 'up', 'flat', 'down', 'new'].every(k => st.n[k] > 0), st.n);
  try { await b.shot(path.join(outDir('rocket-map'), 'on.png')); } catch (e) { /* 스크린샷 실패는 판정과 무관 */ }

  // 배경 바꾸기 → 레이어 복원
  await b.evaluate(`location.hash = '#satellite'`); await sleep(2500);
  let back = false;
  for (let i = 0; i < 30 && !back; i++) { await sleep(300); back = await b.evaluate(`!!map.getLayer('rocket-tier')`).catch(() => false); }
  R.check('배경(위성)으로 바꿔도 떡상 레이어가 다시 붙는다', back);
  await b.evaluate(`location.hash = '#normal'`); await sleep(2000);

  await b.evaluate(`document.getElementById('layer-rocket').click()`); await sleep(400);
  const gone = await b.evaluate(`({ layer: !!map.getLayer('rocket-tier'), legend: document.getElementById('rk-legend').hidden })`);
  R.check('끄면 레이어·범례가 사라진다', !gone.layer && gone.legend, gone);
  const exc = b.logs.filter(x => /EXC/.test(x));
  R.check('예외 0', exc.length === 0, exc.slice(0, 3));
  b.close();
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
