/* e2e: 배포 뒤 다시 온 사람 — 옛 서비스 워커가 옛 화면을 줘도 '새 버전이 있어요 · 새로고침' 띠가 뜬다 (숙제 71)
 *  1. 이 시험만의 서버로 한 번 열기 → 서비스 워커가 페이지를 맡음(옛 판)
 *  2. 서버가 주는 sw.js 만 새 판(캐시 이름이 다름)으로 바꿔 다시 열기 = 배포 직후 다시 온 사람
 *  3. 띠가 뜬다 · 화면 안 · 단추 44×44 이상 · 누르면 새 판 화면(새 캐시)으로 바뀌고 띠는 없음
 *  4. 덤: 질문 붙은 주소(?x=…)로 열어도 캐시에 주소마다 문서가 쌓이지 않는다
 * 실행: node tests/e2e/run.js --only sw-update
 */
'use strict';
const fs = require('fs'), path = require('path');
const { launch, sleep, recorder } = require('./lib/cdp');
const { start, ROOT: REPO } = require('./lib/serve');
const R = recorder('sw-update');
const SW = fs.readFileSync(path.join(REPO, 'sw.js'), 'utf8');
const m = SW.match(/const APP_CACHE = '([^']+)'/);
const NEXT = m[1] + '-next';
let next = false;
const override = p => (next && p === '/sw.js') ? SW.replace(m[0], `const APP_CACHE = '${NEXT}'`) : null;

async function ready(b) {
  for (let i = 0; i < 120; i++) { await sleep(250); if (await b.evaluate(`typeof dataReady !== 'undefined' && dataReady`).catch(() => false)) break; }
}
(async () => {
  let port = 8211;
  for (const [w, h, mobile] of [[1440, 900, false], [390, 844, true]]) {
    next = false;
    const srv = await start(++port, { override });
    const BASE = `http://127.0.0.1:${port}/`;
    const b = await launch({ port: 9797, w, h, mobile });
    const tag = `${w}px`;
    await b.goto(BASE + 'index.html#normal', 1000);
    await ready(b);
    let ctl = false;
    for (let i = 0; i < 60 && !ctl; i++) { await sleep(250); ctl = await b.evaluate(`!!navigator.serviceWorker.controller`).catch(() => false); }
    R.check(`${tag} 첫 방문 뒤 서비스 워커가 맡음(옛 판)`, ctl, ctl);
    await sleep(1000);

    // 배포: 서버의 sw.js 가 새 판이 됨 → 다시 온 사람
    next = true;
    await b.evaluate(`window.__old = 1; 0`);
    await b.send('Page.reload', {}); await sleep(800);
    await ready(b);
    let toast = null;
    for (let i = 0; i < 80 && !toast; i++) {
      await sleep(250);
      toast = await b.evaluate(`(() => { const t = document.getElementById('update-toast'); if (!t) return null;
        const r = t.getBoundingClientRect(), btn = t.querySelector('button'), br = btn.getBoundingClientRect();
        const top = document.elementFromPoint(br.x + br.width / 2, br.y + br.height / 2);
        return { text: t.textContent, x: r.x, y: r.y, r: r.right, b: r.bottom, bw: br.width, bh: br.height, onTop: !!top && (top === btn || btn.contains(top)), vw: innerWidth, vh: innerHeight }; })()`).catch(() => null);
    }
    R.check(`${tag} 다시 온 사람에게 '새 버전이 있어요 · 새로고침' 띠`, !!toast && /새 버전/.test(toast.text) && /새로고침/.test(toast.text), toast);
    R.check(`${tag} 띠가 화면 안`, !!toast && toast.x >= 0 && toast.r <= toast.vw && toast.y >= 0 && toast.b <= toast.vh, toast);
    R.check(`${tag} 새로고침 단추 44×44 이상 · 가리지 않음`, !!toast && toast.bw >= 44 && toast.bh >= 44 && toast.onTop, toast);
    if (toast) {
      await b.evaluate(`document.querySelector('#update-toast button').click()`);
      await sleep(1200); await ready(b);
    }
    const after = await b.evaluate(`caches.keys().then(ks => ({ stale: typeof window.__old !== 'undefined', keys: ks, toast: !!document.getElementById('update-toast') }))`).catch(e => ({ err: e.message }));
    R.check(`${tag} 누르면 새 판(${NEXT})으로 다시 열리고 띠 없음`, !!after.keys && !after.stale && after.keys.includes(NEXT) && !after.keys.some(k => k === m[1]) && !after.toast, after);

    // 덤: 질문 붙은 주소마다 문서가 캐시에 쌓이지 않음
    for (const q of ['a', 'b']) { await b.goto(BASE + 'index.html?x=' + q + '#normal', 800); await ready(b); }
    await sleep(800);
    const qs = await b.evaluate(`caches.open('${NEXT}').then(c => c.keys()).then(ks => ks.map(r => r.url).filter(u => u.includes('?')))`).catch(e => 'ERR ' + e.message);
    R.check(`${tag} ?x= 주소마다 캐시에 문서가 쌓이지 않음`, Array.isArray(qs) && qs.length === 0, qs);
    b.close(); srv.close(); if (srv.closeAllConnections) srv.closeAllConnections(); await sleep(800);
  }
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
