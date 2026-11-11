/* e2e: 전세가율 (js/jeonse.js, 2026-11-11)
 *  - 투자 모드에서 역 상세에 '전세가율' 절: 일산(경의중앙선) 80% · 짝 수 · 80% 이상 짝 수 · 같은 단지·같은 면적 설명
 *  - 잠실은 일산보다 낮다
 *  - 철도 모드(투자 모드 끔)에서는 절이 없다
 * 실행: node tests/e2e/run.js --only jeonse
 */
'use strict';
const { launch, sleep, BASE, recorder } = require('./lib/cdp');
const R = recorder('jeonse');

async function ready(b) {
  for (let i = 0; i < 120; i++) { await sleep(400); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&map.loaded()`).catch(() => false)) break; }
  await sleep(600);
}
async function open(b, name, line) {
  await b.evaluate(`showStation(STATIONS.find(s => s.properties.name_ko === ${JSON.stringify(name)} && s.properties.lines.includes(${JSON.stringify(line)})), null); true`);
  for (let i = 0; i < 40; i++) { await sleep(250); if (await b.evaluate(`!!document.querySelector('#sd-panel .sd-jeonse-sec .jn-pct')`)) break; }
  return b.evaluate(`(() => { const e = document.querySelector('#sd-panel .sd-jeonse-sec'); return e ? e.innerText : null; })()`);
}

(async () => {
  const b = await launch({ port: 9801, w: 1440, h: 900, invest: true });
  await b.send('Network.setBypassServiceWorker', { bypass: true });
  await b.goto(BASE + '#normal', 800); await ready(b);
  const il = await open(b, '일산', 'gyeongui-jungang-line');
  const ilPct = il && +((il.match(/(\d+)%/) || [])[1]);
  R.check('투자 모드: 일산 역 상세에 전세가율 절 (%, 짝 수, 같은 단지·같은 면적)', !!il && ilPct >= 50 && /\d+쌍/.test(il) && /같은 단지/.test(il) && /신규 전세/.test(il), il && il.slice(0, 160));
  R.check('80% 이상 짝 수를 함께 보여 준다', !!il && /80% 이상/.test(il), il && il.slice(0, 200));
  const js = await open(b, '잠실', 'seoul-subway-line-2');
  const jsPct = js && +((js.match(/(\d+)%/) || [])[1]);
  R.check('잠실 전세가율 < 일산', jsPct > 0 && jsPct < ilPct, { jsPct, ilPct });
  b.close(); await sleep(800);
  const r = await launch({ port: 9802, w: 1440, h: 900 });
  await r.send('Network.setBypassServiceWorker', { bypass: true });
  await r.goto(BASE + '#normal', 800); await ready(r);
  await r.evaluate(`showStation(STATIONS.find(s => s.properties.name_ko === '일산'), null); true`); await sleep(1500);
  const none = await r.evaluate(`!document.querySelector('#sd-panel .sd-jeonse-sec')`);
  R.check('철도 모드에서는 전세가율 절이 없다', none);
  const exc = r.logs.filter(l => /EXC/.test(l));
  R.check('예외 0', exc.length === 0, exc.slice(0, 3));
  r.close();
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
