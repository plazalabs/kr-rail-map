/* e2e: 한 번 열어 본 뒤에는 인터넷이 끊겨도 지도가 뜬다 (서비스 워커, 11-15)
 *  - 이 시험만의 서버를 띄워 온라인으로 한 번 열기 → 서비스 워커가 페이지를 맡음 → **서버를 실제로 끄고** 다시 열기
 *    (CDP 의 페이지 오프라인 흉내는 서비스 워커의 fetch 에는 안 걸린다 — 11-15 확인. 그래서 서버를 끈다)
 *  - 노선·역 데이터가 뜨고 역 검색이 된다 · 질문 붙은 주소(?from=…)도 뜬다 · 안 열어 본 노선 페이지는 깨진 화면 대신 안내
 *  - 미리 받기 목록(sw.js APP_SHELL)에 없는 파일이 생기면 설치가 통째로 실패해 여기서 잡힌다 (일부러 깨서 확인함)
 * 실행: node tests/e2e/run.js --only offline
 */
'use strict';
const { launch, sleep, recorder } = require('./lib/cdp');
const { start } = require('./lib/serve');
const R = recorder('offline');
(async () => {
  let port = 8191;
  for (const [w, h, mobile] of [[1440, 900, false], [390, 844, true]]) {
    const srv = await start(++port);   // 크롬 프로필마다 새 출처(포트) — 서비스 워커가 서로 섞이지 않게
    const ROOT = `http://127.0.0.1:${port}/`;
    const b = await launch({ port: 9795, w, h, mobile });
    await b.goto(ROOT + 'index.html#normal', 1000);
    for (let i = 0; i < 100; i++) { await sleep(250); if (await b.evaluate(`typeof dataReady !== 'undefined' && dataReady`).catch(() => false)) break; }
    let ctl = false;
    for (let i = 0; i < 40 && !ctl; i++) { await sleep(250); ctl = await b.evaluate(`!!navigator.serviceWorker.controller`).catch(() => false); }
    await sleep(1500);
    R.check(`${w}px 온라인 첫 방문 뒤 서비스 워커가 페이지를 맡음`, ctl, ctl);
    srv.close(); if (srv.closeAllConnections) srv.closeAllConnections(); await sleep(300);
    const down = await b.evaluate(`fetch('${ROOT}no-such-file-' + Date.now()).then(() => 'reached', () => 'down')`).catch(() => 'down');
    R.check(`${w}px 서버를 정말 껐음(새 주소 요청이 안 닿음)`, down === 'down', down);
    await b.goto(ROOT + 'index.html#normal', 1000);
    let ok = false;
    for (let i = 0; i < 80 && !ok; i++) { await sleep(250); ok = await b.evaluate(`typeof dataReady !== 'undefined' && dataReady && !!map.getLayer('rail-lines') && STATIONS.length > 500`).catch(() => false); }
    R.check(`${w}px 인터넷 끊고 다시 열어도 노선·역 데이터가 뜸`, ok, ok);
    const found = await b.evaluate(`!!STATIONS.find(x => x.properties.name_ko === '광화문')`).catch(e => 'ERR ' + e.message);
    R.check(`${w}px 오프라인에서도 역(광화문) 찾기`, found === true, found);
    await b.goto(ROOT + 'index.html?from=' + encodeURIComponent('광화문') + '&to=' + encodeURIComponent('종로3가') + '#normal', 1000);
    let q = false;
    for (let i = 0; i < 60 && !q; i++) { await sleep(250); q = await b.evaluate(`typeof dataReady !== 'undefined' && dataReady && !!map.getLayer('rail-lines')`).catch(() => false); }
    R.check(`${w}px 오프라인에서 질문 붙은 주소(?from=…&to=…)도 지도가 뜸`, q, q);
    await b.goto(ROOT + 'line/gtx-c.html', 2500);
    const ln = await b.evaluate(`document.title + ' / ' + ((document.querySelector('h1') || {}).textContent || '')`).catch(e => 'ERR ' + e.message);
    R.check(`${w}px 안 열어 본 노선 페이지는 깨진 화면 대신 '인터넷 연결' 안내`, /인터넷 연결/.test(ln), ln);
    b.close(); await sleep(800);
  }
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
