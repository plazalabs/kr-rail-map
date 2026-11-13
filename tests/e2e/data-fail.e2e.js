/* e2e: 자료 일부 실패 알림 (H4, 2026-11-14 · 68점 평가 16번)
 *  - 투자 모드에서 시세·동명역 지역 자료를 막으면 → 화면 위 알림에 그 이름 + '다시 시도'
 *  - 막지 않은 노선·역·길찾기는 그대로 된다 (전부 실패한 것처럼 보이지 않게)
 *  - ✕ 로 닫으면 사라진다
 *  - 아무것도 막지 않으면 알림이 없다
 * 실행: node tests/e2e/run.js --only data-fail
 */
'use strict';
const { launch, sleep, BASE, recorder } = require('./lib/cdp');
const R = recorder('data-fail');

async function ready(b) {
  for (let i = 0; i < 120; i++) { await sleep(250); if (await b.evaluate(`typeof dataReady !== 'undefined' && dataReady`).catch(() => false)) break; }
}

(async () => {
  let b = await launch({ port: 9811, w: 1280, h: 800, invest: true });
  await b.send('Network.setBypassServiceWorker', { bypass: true });
  await b.send('Network.setBlockedURLs', { urls: ['*data/station-price.json*', '*data/station-region.json*'] });
  await b.goto(BASE + '#invest', 500); await ready(b);
  // 시세는 쉬는 동안 미리 받기로 받는다 — 역 하나를 열어 바로 받게 한다
  await b.evaluate(`(() => { const s = STATIONS.find(x => x.properties.name_ko === '잠실'); if (typeof StationDetail !== 'undefined') StationDetail.show(s); })()`).catch(() => null);
  let a = null;
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    a = await b.evaluate(`(() => { const x = document.getElementById('data-alert'); return x ? { text: x.textContent, retry: !!x.querySelector('.da-retry'), close: !!x.querySelector('.da-close'), role: x.getAttribute('role'), fails: KR_dataFails().map(f => f.name) } : null; })()`).catch(() => null);
    if (a && /주변 시세/.test(a.text) && /지역 표시/.test(a.text)) break;
  }
  R.check("막은 자료 이름(주변 시세·같은 이름 역의 지역 표시)이 알림에 뜬다 + '다시 시도'·닫기·role=alert", !!a && /주변 시세/.test(a.text) && /지역 표시/.test(a.text) && a.retry && a.close && a.role === 'alert', a);
  R.check('막지 않은 자료는 실패로 안 올라감 (노선·역·출구 등 없음)', !!a && !a.fails.some(n => /노선·역|출구|도심 접근성|가격 흐름/.test(n)), a && a.fails);
  const ok = await b.evaluate(`(() => { const a = STATIONS.find(s => s.properties.name_ko === '광운대'), z = STATIONS.find(s => s.properties.name_ko === '시청' && s.properties.lines.includes('seoul-subway-line-2'));
    const r = RouteFinder.findRoute(a.properties.id, z.properties.id, { openOnly: true }); return { lines: LINES.length, route: r ? r.minutes : null }; })()`);
  R.check('나머지는 그대로 — 노선 80개 이상·길찾기 됨', ok.lines > 80 && ok.route > 10, ok);
  await b.evaluate(`document.querySelector('#data-alert .da-close').click(); 0`); await sleep(300);
  const gone = await b.evaluate(`!document.getElementById('data-alert')`);
  R.check('✕ 로 닫으면 사라짐', gone, gone);
  const exc = b.logs.filter(x => /EXC/.test(x));
  R.check('예외 0', exc.length === 0, exc.slice(0, 3));
  b.close();

  // 아무것도 막지 않으면 알림 없음
  b = await launch({ port: 9812, w: 1280, h: 800, invest: true });
  await b.goto(BASE + '#invest', 500); await ready(b);
  await b.evaluate(`(() => { const s = STATIONS.find(x => x.properties.name_ko === '잠실'); if (typeof StationDetail !== 'undefined') StationDetail.show(s); })()`).catch(() => null);
  await sleep(4000);
  const none = await b.evaluate(`({ box: !!document.getElementById('data-alert'), fails: KR_dataFails().map(f => f.name) })`);
  R.check('다 받으면 알림 없음', !none.box && none.fails.length === 0, none);
  b.close();
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
