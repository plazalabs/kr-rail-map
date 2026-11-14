/* e2e: 한 번 열어 본 뒤에는 인터넷이 끊겨도 지도가 뜬다 (서비스 워커, 11-15)
 *  - 온라인으로 한 번 열기 → 서비스 워커가 페이지를 맡음 → 네트워크 끊고 다시 열기 → 노선·역 데이터가 뜨고 역 검색이 된다
 *  - 미리 받기 목록(sw.js APP_SHELL)에 없는 파일이 생기거나 지운 파일이 남으면 설치가 통째로 실패해 여기서 잡힌다
 * 실행: node tests/e2e/run.js --only offline
 */
'use strict';
const { launch, sleep, BASE, recorder } = require('./lib/cdp');
const R = recorder('offline');
(async () => {
  for (const [w, h, mobile] of [[1440, 900, false], [390, 844, true]]) {
    const b = await launch({ port: 9795, w, h, mobile });
    await b.goto(BASE, 1000);
    for (let i = 0; i < 100; i++) { await sleep(250); if (await b.evaluate(`typeof dataReady !== 'undefined' && dataReady`).catch(() => false)) break; }
    let ctl = false;
    for (let i = 0; i < 40 && !ctl; i++) { await sleep(250); ctl = await b.evaluate(`!!navigator.serviceWorker.controller`).catch(() => false); }
    await sleep(1500);
    R.check(`${w}px 온라인 첫 방문 뒤 서비스 워커가 페이지를 맡음`, ctl, ctl);
    await b.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await b.goto(BASE, 1000);
    let ok = false;
    for (let i = 0; i < 80 && !ok; i++) { await sleep(250); ok = await b.evaluate(`typeof dataReady !== 'undefined' && dataReady && !!map.getLayer('rail-lines') && STATIONS.length > 500`).catch(() => false); }
    R.check(`${w}px 인터넷 끊고 다시 열어도 노선·역 데이터가 뜸`, ok, ok);
    const found = await b.evaluate(`(() => { const s = STATIONS.find(x => x.properties.name_ko === '광화문'); return !!s; })()`).catch(e => 'ERR ' + e.message);
    R.check(`${w}px 오프라인에서도 역(광화문) 찾기`, found === true, found);
    b.close(); await sleep(800);
  }
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
