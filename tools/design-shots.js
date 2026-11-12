/* 검증 보고용 스크린샷 — PC 1440×1000 / 휴대폰 390×844 × (처음 화면·떡상 패널·길찾기·더보기) × 밝은·어두운
 * 크롬 기기 흉내(headless) — 실제 휴대폰이 아니다.
 * 실행: node tools/design-shots.js [나갈 폴더]   (기본 qa/design-shots, 저장소에 안 올라감 — .gitignore qa/)
 * 주의: e2e 와 동시에 돌리지 말 것(크롬 연결이 섞인다).
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { launch, sleep } = require('../tests/e2e/lib/cdp');
const { start } = require('../tests/e2e/lib/serve');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'qa', 'design-shots'));
fs.mkdirSync(OUT, { recursive: true });
const PORT = 8131;
const BASE = `http://127.0.0.1:${PORT}/index.html`;

async function ready(b) {
  for (let i = 0; i < 120; i++) { await sleep(400); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&map.loaded()`).catch(() => false)) break; }
  await sleep(1500);
}

async function one(name, opts, dark) {
  const b = await launch(opts);
  await b.send('Network.setBypassServiceWorker', { bypass: true });
  if (dark) await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await b.goto(BASE + '#normal', 800); await ready(b);
  const tag = name + (dark ? '-dark' : '-light');
  const files = [];
  const snap = async s => { const f = path.join(OUT, `${tag}-${s}.png`); await b.shot(f); files.push(path.basename(f)); };
  await snap('1-first');
  await b.evaluate(`document.getElementById('rocket-btn').click(); 0`); await sleep(2500);
  await snap('2-rocket');
  await b.evaluate(`(document.querySelector('#rocket-panel .rkp-close')||{click(){}}).click(); 0`); await sleep(500);
  await b.evaluate(`document.getElementById('route-btn').click(); 0`); await sleep(800);
  await snap('3-route');
  await b.evaluate(`(document.getElementById('route-close')||{click(){}}).click(); 0`); await sleep(400);
  if (opts.mobile) { await b.evaluate(`window.TabBar && TabBar.setMore(true); 0`); await sleep(600); await snap('4-more'); }
  await b.close();
  return files;
}

(async () => {
  const srv = await start(PORT);
  const all = [];
  let port = 9871;
  for (const dark of [false, true]) {
    all.push(...await one('pc', { port: port++, w: 1440, h: 1000 }, dark));
    all.push(...await one('mobile', { port: port++, w: 390, h: 844, mobile: true }, dark));
  }
  srv.close();
  console.log(OUT); console.log(all.join('\n'));
})().catch(e => { console.error(e); process.exit(1); });
