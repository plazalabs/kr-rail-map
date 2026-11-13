/* e2e: 길찾기 경계 경우 (H10, 2026-11-14 · 68점 평가 20번)
 *  - 출발 = 도착 → '0분·0원' 결과 대신 안내
 *  - 지금은 철도로 못 가는 역(개통 전 노선에만 있는 역) → '갈 수 없습니다' + 왜 못 가는지 + 개통 예정 안내, 상태 줄이 '찾았어요'라 하지 않음
 *  - 보통 경로는 그대로 '찾았어요'
 * 실행: node tests/e2e/run.js --only route-edge
 */
'use strict';
const { launch, sleep, BASE, recorder } = require('./lib/cdp');
const R = recorder('route-edge');

async function ready(b) {
  for (let i = 0; i < 120; i++) { await sleep(250); if (await b.evaluate(`typeof dataReady !== 'undefined' && dataReady`).catch(() => false)) break; }
  await sleep(500);
}
async function routeBy(b, fromId, toId) {
  const url = BASE + '?from=' + encodeURIComponent(fromId) + '&to=' + encodeURIComponent(toId) + '&from_id=' + encodeURIComponent(fromId) + '&to_id=' + encodeURIComponent(toId) + '#normal';
  await b.goto(url, 500); await ready(b);
  let r = null;
  for (let i = 0; i < 30; i++) {
    await sleep(250);
    r = await b.evaluate(`({ html: document.getElementById('route-result').innerHTML, text: document.getElementById('route-result').innerText, status: document.getElementById('status').textContent })`).catch(() => null);
    if (r && r.text && r.text.trim().length > 5) break;
  }
  return r;
}

(async () => {
  const b = await launch({ port: 9813, w: 1280, h: 860 });
  await b.goto(BASE + '#normal', 500); await ready(b);
  const ids = await b.evaluate(`(() => {
    const by = n => STATIONS.find(s => s.properties.name_ko === n);
    // 개통 전 노선에만 있는 역 (지금은 철도로 못 감)
    const onlyFuture = STATIONS.find(s => (s.properties.lines || []).length && s.properties.lines.every(l => RouteFinder.lineIsUnopened(l)) && /gtx-d|dongbuk/.test(s.properties.lines.join()));
    return { gk: by('광운대').properties.id, sc: STATIONS.find(s => s.properties.name_ko === '시청' && s.properties.lines.includes('seoul-subway-line-2')).properties.id, fut: onlyFuture && onlyFuture.properties.id, futName: onlyFuture && onlyFuture.properties.name_ko };
  })()`);
  R.check('시험용 역 찾음 (개통 전 노선에만 있는 역 포함)', !!ids.fut, ids);

  const same = await routeBy(b, ids.gk, ids.gk);
  R.check("출발 = 도착 → '같아요' 안내 (0분 결과 없음)", !!same && /같아요/.test(same.text) && !/0분/.test(same.text), same && same.text.slice(0, 80));

  const nr = await routeBy(b, ids.gk, ids.fut);
  R.check("못 가는 역 → '갈 수 없습니다' + 왜(이 지도에 그린 철도 노선만으로는 …)", !!nr && /갈 수 없습니다/.test(nr.text) && /이어지지 않습니다/.test(nr.text), nr && nr.text.slice(0, 160));
  R.check("못 가는데 상태 줄이 '찾았어요'라고 하지 않음", !!nr && !/찾았어요/.test(nr.status) && /없어요/.test(nr.status), nr && nr.status);

  const ok = await routeBy(b, ids.gk, ids.sc);
  R.check("보통 경로는 결과 + 상태 줄 '찾았어요'", !!ok && /분/.test(ok.text) && /찾았어요/.test(ok.status) && !/rc-noroute/.test(ok.html), ok && ok.status);
  const exc = b.logs.filter(x => /EXC/.test(x));
  R.check('예외 0', exc.length === 0, exc.slice(0, 3));
  b.close();
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
