/* e2e: 배경 지도 서버가 죽었을 때 (2026-11-12)
 *  - OpenFreeMap 스타일 주소를 막으면 → 8초 안팎에 비상 배경으로 바꾸고 철도 노선·역 점은 그려진다
 *  - 상태 줄에 안내가 뜬다
 *  - 길찾기가 된다 (노선 자료는 우리 서버에서 오므로)
 * 실행: node tests/e2e/run.js --only basemap-down
 */
'use strict';
const { launch, sleep, BASE, recorder } = require('./lib/cdp');
const R = recorder('basemap-down');

(async () => {
  const b = await launch({ port: 9798, w: 1280, h: 800 });
  await b.send('Network.setBypassServiceWorker', { bypass: true });
  await b.send('Network.setBlockedURLs', { urls: ['*tiles.openfreemap.org/styles/*'] });
  const t0 = Date.now();
  await b.goto(BASE + '#normal', 300);
  let st = null;
  for (let i = 0; i < 80; i++) {
    await sleep(250);
    st = await b.evaluate(`({ lines: !!(window.map && map.getSource && map.getSource('lines')), fb: typeof KR_usedFallbackStyle === 'function' && KR_usedFallbackStyle(),
      ready: typeof dataReady !== 'undefined' && dataReady })`).catch(() => null);
    if (st && st.lines) break;
  }
  const ms = Date.now() - t0;
  R.check('스타일 서버를 막아도 15초 안에 노선이 그려진다 (비상 배경)', !!st && st.lines && st.fb && ms < 15000, Object.assign({ ms }, st || {}));
  // 그려지기까지 기다린다 — 예전엔 1.5초 한 번만 봐서 헤드리스 크롬이 프레임을 늦게 돌리면 drawn 0 으로 들쭉날쭉했다
  // (2026-11-13: 7번 중 2번). 8초 안에 그려지면 통과, 끝내 안 그려지면 여전히 실패한다.
  let vis = null;
  for (let i = 0; i < 32; i++) {
    await sleep(250);
    vis = await b.evaluate(`({ drawn: map.queryRenderedFeatures({ layers: ['rail-lines'] }).length, status: document.getElementById('status').textContent })`).catch(e => ({ err: String(e) }));
    if (vis && vis.drawn > 20 && /배경 지도 서버/.test(vis.status)) break;
  }
  R.check('화면에 노선이 실제로 그려지고 상태 줄에 안내', vis.drawn > 20 && /배경 지도 서버/.test(vis.status), vis);
  const route = await b.evaluate(`(() => { const a = STATIONS.find(s => s.properties.id === 'st-355172776'), z = STATIONS.find(s => s.properties.name_ko === '시청' && s.properties.lines.includes('seoul-subway-line-2'));
    const r = RouteFinder.findRoute(a.properties.id, z.properties.id, { openOnly: true }); return r ? r.minutes : null; })()`).catch(() => null);
  R.check('길찾기는 그대로 된다 (광운대→시청)', route != null && route > 10 && route < 60, route);
  const exc = b.logs.filter(x => /EXC/.test(x));
  R.check('예외 0', exc.length === 0, exc.slice(0, 3));
  b.close();
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
