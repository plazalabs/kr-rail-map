/* e2e: 나만의 노선 링크 공유 (js/draw.js Share, 2026-11-13)
 *  - ?ml=…&mn=… 로 열면 받은 노선이 지도(mylines 소스)와 사이드바 목록에 '(받은 노선)' 으로, 지도가 노선에 맞춰짐
 *  - 이름에 HTML 을 넣어도 글자로만 (스크립트·태그 실행 안 됨)
 *  - [저장] → localStorage 에 들어감, 새로고침해도 남음
 *  - 저장한 노선의 링크 단추 → 같은 주소(왕복)
 * 실행: node tests/e2e/run.js --only share-line
 */
'use strict';
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const { launch, sleep, BASE, recorder } = require('./lib/cdp');
const R = recorder('share-line');
const ctx = vm.createContext({ console, Math, Map, Set, Array, Object, JSON, Infinity, URLSearchParams, encodeURIComponent, decodeURIComponent, window: {}, document: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'draw.js'), 'utf8').replace('const DrawTools', 'globalThis.DrawTools'), ctx);
const S = ctx.DrawTools.Share;

async function ready(b) {
  for (let i = 0; i < 120; i++) { await sleep(300); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&!!map.getSource('lines')`).catch(() => false)) break; }
  await sleep(1500);
}

(async () => {
  const coords = [[126.9244, 37.5576], [126.9364, 37.5552], [126.9521, 37.5568], [126.9706, 37.5547], [126.9772, 37.5658]];
  const evil = '<img src=x onerror="window.__pwned=1">합정 순환';
  const q = S.shareQuery({ name: evil, color: '#009688', dashKey: '점선', coords });
  const name40 = evil.slice(0, 40);   // 이름은 40자까지
  const b = await launch({ port: 9711, w: 1440, h: 900 });
  await b.goto(BASE + q + '#normal', 1500); await ready(b);
  const got = await b.evaluate(`(() => { const src = map.getSource('mylines'); const fc = src && src._data; const rows = [...document.querySelectorAll('#myline-list .line-item')];
    const shared = rows.find(r => /받은 노선/.test(r.textContent));
    const c = map.getCenter();
    return { feats: fc && fc.features ? fc.features.length : null, color: fc && fc.features && fc.features[0] ? fc.features[0].properties.color : null,
      rowText: shared ? shared.querySelector('.myline-name').textContent : null, hasImg: !!document.querySelector('#myline-list img'), pwned: !!window.__pwned,
      saveBtn: shared ? !!shared.querySelector('.mini-share') && shared.querySelector('.mini-share').textContent === '저장' : false,
      center: [c.lng, c.lat], zoom: map.getZoom() }; })()`);
  R.check('받은 노선이 지도에 그려짐 (색 그대로)', got.feats === 1 && got.color === '#009688', got);
  R.check("사이드바에 '(받은 노선)' + [저장] 단추", !!got.rowText && got.saveBtn, got.rowText);
  R.check('이름의 HTML 은 글자로만 (태그·스크립트 실행 안 됨)', got.rowText && got.rowText.includes('<img') && !got.hasImg && !got.pwned, got);
  R.check('지도가 받은 노선에 맞춰짐 (중심이 노선 근처)', Math.abs(got.center[0] - 126.95) < 0.03 && Math.abs(got.center[1] - 37.56) < 0.02 && got.zoom > 11, got.center);
  // 저장 전엔 localStorage 에 없음 → 저장 → 있음
  const before = await b.evaluate(`(JSON.parse(localStorage.getItem('kr-rail-map-mylines-v1') || '{}').myLines || []).length`);
  await b.evaluate(`[...document.querySelectorAll('#myline-list .mini-share')].find(x => x.textContent === '저장').click(); 0`); await sleep(300);
  const after = await b.evaluate(`(JSON.parse(localStorage.getItem('kr-rail-map-mylines-v1') || '{}').myLines || []).map(l => l.name)`);
  R.check('[저장] 전엔 저장 안 됨, 누르면 저장됨', before === 0 && after.length === 1 && after[0] === name40, { before, after });
  // 링크 단추 → 같은 주소
  const link = await b.evaluate(`(() => { window.__copied = null; if (navigator.clipboard) navigator.clipboard.writeText = t => { window.__copied = t; return Promise.resolve(); };
    const btn = document.querySelector('#myline-list .mini-share'); btn.click(); return true; })()`);
  await sleep(300);
  const copied = await b.evaluate(`window.__copied`);
  const back = copied ? S.parseShare(copied.slice(copied.indexOf('?'))) : null;
  R.check('링크 단추 → 같은 노선 주소 (왕복)', !!back && back.name === name40 && back.coords.length === 5 && back.dashKey === '점선', copied && copied.length);
  // 새로고침(주소에서 ml 빼고) → 저장한 노선이 남아 있음
  await b.goto(BASE + '#normal', 1500); await ready(b);
  const persisted = await b.evaluate(`[...document.querySelectorAll('#myline-list .myline-name')].map(x => x.textContent)`);
  R.check('새로고침해도 저장한 노선이 남음 (받은 노선 표시 없이)', persisted.length === 1 && persisted[0] === name40, persisted);
  await b.evaluate(`localStorage.removeItem('kr-rail-map-mylines-v1'); 0`);
  const exc = b.logs.filter(l => /EXC/.test(l));
  R.check('예외 0', exc.length === 0, exc.slice(0, 3));
  b.close();
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
