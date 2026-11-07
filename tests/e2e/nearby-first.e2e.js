/* e2e: 길찾기 자동완성 — 동명역은 지금 보는 지도 중심에 가까운 역부터 (IMPL9 건 4)
 *  - 지도 중심을 서울·부산·대전에 두고 '시청' 을 치면 그 도시의 시청이 맨 위
 *  - 동명 그룹 밖의 순서(서로 다른 이름의 순서)는 지도 위치와 무관하게 그대로
 *  - 고른 항목의 역 ID 가 입력칸에 들어감 (IMPL3 방식 유지)
 * 실행: node tests/e2e/run.js --only nearby-first
 */
'use strict';
const { launch, sleep, BASE, recorder } = require('./lib/cdp');
const R = recorder('nearby-first');

async function ready(b) {
  for (let i = 0; i < 120; i++) { await sleep(400); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&map.loaded()`).catch(() => false)) break; }
  await sleep(500);
}
async function typeInto(b, id, text) {
  const c = await b.evaluate(`(() => { const e = document.getElementById('${id}'); const r = e.getBoundingClientRect(); return [r.x + 20, r.y + r.height/2]; })()`);
  await b.click(c[0], c[1]); await sleep(60);
  await b.evaluate(`document.getElementById('${id}').value = ''; 0`);
  await b.type(text); await sleep(400);
}
const items = b => b.evaluate(`[...document.getElementById('route-from').parentElement.querySelectorAll('.ac-list:not([hidden]) .ac-item')]
  .map(e => { const r = e.getBoundingClientRect(); return { name: e.childNodes[0].textContent.trim(), lines: (e.querySelector('.ac-lines') || {}).textContent || '', x: r.x + 30, y: r.y + r.height/2 }; })`);

(async () => {
  const b = await launch({ port: 9681, w: 1440, h: 1000 });
  await b.send('Network.setBypassServiceWorker', { bypass: true });
  await b.send('Network.setCacheDisabled', { cacheDisabled: true });
  await b.goto(BASE + '#normal', 800); await ready(b);
  await b.evaluate(`document.getElementById('route-panel').hidden = false; 0`);
  const CITIES = [['서울', [126.978, 37.566], /수도권 전철 1호선|서울 지하철 2호선/], ['부산', [129.075, 35.18], /부산 도시철도 1호선/], ['대전', [127.385, 36.35], /대전 도시철도 1호선/]];
  const orders = {};
  for (const [city, c, re] of CITIES) {
    await b.evaluate(`map.jumpTo({ center: [${c}], zoom: 12 }); 0`); await sleep(400);
    await typeInto(b, 'route-from', '시청');
    const it = await items(b);
    const si = it.filter(x => x.name === '시청');
    R.check(`지도 중심 ${city} → '시청' 첫 항목이 ${city} 시청`, si.length === 3 && re.test(si[0].lines) && it[0].name === '시청', si.map(x => x.lines));
    // 다른 이름들의 순서 (동명 그룹을 하나로 접어서)
    await typeInto(b, 'route-from', '서');
    orders[city] = (await items(b)).map(x => x.name).filter((n, i, a) => a.indexOf(n) === i).join(',');
    if (city === '부산') {
      // 부산 시청을 실제로 골라 역 ID 확인
      await typeInto(b, 'route-from', '시청');
      const first = (await items(b))[0];
      await b.click(first.x, first.y); await sleep(200);
      const sid = await b.evaluate(`document.getElementById('route-from').dataset.sid || null`);
      const busan = await b.evaluate(`STATIONS.find(s => s.properties.name_ko === '시청' && s.properties.lines.includes('busan-metro-line-1')).properties.id`);
      R.check('부산 중심에서 맨 위 시청을 클릭 → 부산 시청 ID', sid === busan, { sid, busan });
    }
  }
  R.check("동명 그룹 밖 순서는 지도 위치와 무관 ('서' 입력, 서울·부산·대전)", orders['서울'] === orders['부산'] && orders['부산'] === orders['대전'], orders);
  const exc = b.logs.filter(l => /EXC/.test(l));
  R.check('예외 0', exc.length === 0, exc.slice(0, 3));
  b.close();
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
