/* e2e: 첫 화면 사이드바 카드 (js/home-cards.js, 2026-11-13)
 *  - '개통하면 가장 많이 오르는 역' 1~3위 = data/rank-top.json (rank.json 은 첫 화면에서 안 받음)
 *  - 부제 '집값 예측 아님', 1위 누르면 떡상 패널이 그 역을 연다
 *  - 게시판이 켜져 있으면 '지금 커뮤니티에서' 글 0~2개, 글은 글자로만(태그 없음)
 * 실행: node tests/e2e/run.js --only home-cards
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { launch, sleep, BASE, recorder } = require('./lib/cdp');
const R = recorder('home-cards');
const TOP = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'rank-top.json'), 'utf8'));
async function ready(b) {
  for (let i = 0; i < 120; i++) { await sleep(300); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&!!map.getSource('lines')`).catch(() => false)) break; }
  await sleep(800);
}
(async () => {
  const b = await launch({ port: 9741, w: 1440, h: 900 });
  await b.send('Network.enable');
  const urls = [];
  b.on && b.on('Network.requestWillBeSent', p => urls.push(p.request.url));
  await b.goto(BASE + '#normal', 1500); await ready(b);
  for (let i = 0; i < 30; i++) { if (await b.evaluate(`document.querySelectorAll('#home-cards .hc-top button').length === 3`)) break; await sleep(300); }
  const c = await b.evaluate(`(() => { const box = document.getElementById('home-cards'); return { names: [...box.querySelectorAll('.hc-nm')].map(x => x.textContent), ups: [...box.querySelectorAll('.hc-up')].map(x => x.textContent), sub: (box.querySelector('.hc-sub') || {}).textContent || '',
    rankJson: performance.getEntriesByType('resource').some(e => /data\\/rank\\.json/.test(e.name)), topJson: performance.getEntriesByType('resource').some(e => /rank-top\\.json/.test(e.name)) }; })()`);
  R.check('TOP 3 = rank-top.json 그대로 (이름·▲계단)', c.names.join() === TOP.top.map(t => t.n).join() && c.ups.join() === TOP.top.map(t => '▲' + t.ch).join(), c);
  R.check("부제에 '집값 예측 아님'", /집값 예측 아님/.test(c.sub), c.sub);
  R.check('첫 화면에서 큰 rank.json 은 안 받고 작은 rank-top.json 만', c.topJson && !c.rankJson, { topJson: c.topJson, rankJson: c.rankJson });
  await b.evaluate(`document.querySelector('#home-cards .hc-top button').click(); 0`);
  let rp = null;
  for (let i = 0; i < 30; i++) { rp = await b.evaluate(`typeof RocketPanel !== 'undefined' && RocketPanel.isOpen() ? RocketPanel.state().sel : null`); if (rp) break; await sleep(300); }
  R.check('1위 누르면 떡상 패널이 그 역을 연다', rp === TOP.top[0].id, rp);
  const feed = await b.evaluate(`(() => { const s = document.querySelector('#home-cards .hc-feed'); const ready = typeof KrBoard !== 'undefined' && KrBoard.ready();
    return { ready, n: s ? s.querySelectorAll('.hc-post').length : 0, tags: s ? s.querySelectorAll('.hc-body *').length : 0 }; })()`);
  R.check('커뮤니티 칸: 게시판 켜져 있으면 글 0~2개, 글 안에 태그 없음(글자로만)', feed.n <= 2 && feed.tags === 0, feed);
  // 지도 위 '켜진 분석' (68점 감사 12번): 떡상 지도 켜면 뜨고 끄면 사라짐
  await b.evaluate(`(() => { if (typeof RocketPanel !== 'undefined' && RocketPanel.isOpen()) RocketPanel.close(); const c = document.getElementById('layer-rocket'); if (c.checked) c.click(); })()`); await sleep(400);
  const off0 = await b.evaluate(`(() => { const e = document.getElementById('al-chip'); return !e || e.hidden; })()`);
  await b.evaluate(`document.getElementById('layer-rocket').click(); 0`); await sleep(600);
  const on1 = await b.evaluate(`(() => { const e = document.getElementById('al-chip'); return e && !e.hidden ? e.textContent : null; })()`);
  await b.evaluate(`document.getElementById('layer-rocket').click(); 0`); await sleep(600);
  const off1 = await b.evaluate(`(() => { const e = document.getElementById('al-chip'); return !e || e.hidden; })()`);
  R.check("지도 위 '켜진 분석': 떡상 지도 켜면 표시, 끄면 사라짐", off0 && /떡상 지도/.test(on1 || '') && off1, { off0, on1, off1 });
  const exc = b.logs.filter(l => /EXC/.test(l));
  R.check('예외 0', exc.length === 0, exc.slice(0, 3));
  b.close();
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
