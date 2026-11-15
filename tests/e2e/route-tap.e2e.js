/* e2e: 휴대폰 '경로 찾기' 첫 탭 (P10, 7차 7-2, 2026-11-15)
 *  - 입력칸에 커서(=화면 키보드)가 있는 채 손가락을 대면 그 순간(pointerdown) 바로 찾는다
 *    → 손을 떼기 전에 단추가 자리를 옮겨도(키보드·후보 목록이 내려가는 흉내) 경로가 나온다
 *  - 뒤따라오는 진짜 click 은 버려 두 번 찾지 않는다 (찾기 1회)
 *  - 입력칸에 커서가 없으면 평소처럼 click 한 번으로 1회
 *  - PC 마우스는 바뀌지 않음 (pointerdown 으로 실행 안 함)
 * 실행: node tests/e2e/run.js --only route-tap
 */
'use strict';
const { launch, sleep, BASE, recorder } = require('./lib/cdp');
const R = recorder('route-tap');

async function ready(b) {
  for (let i = 0; i < 120; i++) { await sleep(300); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&typeof resolveRoutePair==='function'`).catch(() => false)) break; }
  await sleep(500);
}
const setup = b => b.evaluate(`(() => {
  const S = n => STATIONS.find(s => s.properties.name_ko === n && s.properties.lines.includes('seoul-subway-line-2')) || STATIONS.find(s => s.properties.name_ko === n);
  document.getElementById('route-panel').hidden = false; if (typeof setRoutePeek === 'function') setRoutePeek(false);
  document.getElementById('route-result').innerHTML = '';
  setRouteStation(document.getElementById('route-from'), S('강남')); setRouteStation(document.getElementById('route-to'), S('시청'));
  window.L = []; if (!window.__wrapped) { window.__wrapped = true; ['pointerdown','click'].forEach(t => document.addEventListener(t, e => L.push(t + ':' + (e.target.id || e.target.tagName + '.' + e.target.className + '@' + Math.round(e.clientY) + '/' + Math.round(e.target.getBoundingClientRect().y)) + ':' + e.isTrusted), true)); const o = window.resolveRoutePair; window.resolveRoutePair = function () { window.__cnt++; return o.apply(this, arguments); }; }
  window.__cnt = 0; window.__uo = (document.getElementById('route-unopened') || {}).checked; return true; })()`);
// 후보를 고른 직후처럼: 커서(키보드)는 입력칸에 남고 후보 목록은 닫힌 상태
const focusTo = async (b, touch = true) => {
  await b.evaluate(`(() => { const t = document.getElementById('route-to'); t.value = ''; delete t.dataset.sid; t.focus(); })()`);
  await b.type('시청'); await sleep(400);
  const it = await b.evaluate(`(() => { const e = document.querySelector('#route-to-list:not([hidden]) .ac-item'); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x + 40, r.y + r.height / 2]; })()`);
  if (it && touch) {
    await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: it[0], y: it[1] }] }); await sleep(60);
    await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else if (it) { await b.click(it[0], it[1]); }
  await sleep(400);
  await b.evaluate(`(() => { const a = document.activeElement; if (!a || a.id !== 'route-to') document.getElementById('route-to').focus(); window.L = []; window.__cnt = 0; })()`);
  await sleep(300);
};
const center = async b => {   // 단추가 손가락 밑에 실제로 있을 때까지 (시트 움직임·후보 목록이 끝날 때까지) 기다린다
  let c = null;
  for (let k = 0; k < 20; k++) {
    c = await b.evaluate(`(() => { const g = document.getElementById('route-go'); const r = g.getBoundingClientRect(); const x = r.x + r.width / 2, y = r.y + r.height / 2; return [x, y, document.elementFromPoint(x, y) === g, visualViewport.offsetTop, visualViewport.scale, scrollY]; })()`);
    if (c[2]) break; await sleep(150);
  }
  return c;
};
const result = b => b.evaluate(`({ cnt: window.__cnt, uoSame: (document.getElementById('route-unopened') || {}).checked === window.__uo, html: document.getElementById('route-result').textContent.trim().slice(0, 40), L: L.join(' ') })`);

(async () => {
  const b = await launch({ port: 9861, w: 390, h: 844, mobile: true });
  await b.send('Network.setBypassServiceWorker', { bypass: true });
  await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await b.goto(BASE + '#normal', 800); await ready(b);

  // ① 입력칸에 커서가 있는 채 탭 — 손가락을 대자마자 찾고, 손 떼기 전에 단추가 120px 내려가도 결과가 있다
  await setup(b);
  await focusTo(b);
  let cc = await center(b); let [x, y] = cc;
  await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await sleep(150);
  const mid = await result(b); mid.c = [x, y, cc];
  await b.evaluate(`document.getElementById('route-go').style.transform = 'translateY(120px)'; 0`);
  await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(900);
  const r1 = await result(b);
  await b.evaluate(`document.getElementById('route-go').style.transform = ''; 0`);
  R.check('키보드 떠 있을 때: 손가락 대는 순간 찾음 (단추가 비켜나도 결과)', mid.cnt === 1 && r1.cnt === 1 && r1.html.length > 0 && r1.uoSame, { mid, r1 });

  // ② 같은 상황, 단추가 그대로면 click 이 뒤따라와도 찾기는 1회
  await setup(b);
  await focusTo(b);
  [x, y] = await center(b);
  await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await sleep(80);
  await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(900);
  const r2 = await result(b);
  R.check("뒤따르는 click 은 버림 → 찾기 1회, 밀린 화면의 '미개통 포함' 스위치도 안 바뀜", r2.cnt === 1 && r2.html.length > 0 && r2.uoSame, r2);

  // ③ 입력칸 커서 없음 — 평소 click 한 번 → 1회
  await setup(b);
  await b.evaluate(`document.activeElement && document.activeElement.blur(); 0`);
  [x, y] = await center(b);
  await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await sleep(80);
  await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(900);
  const r3 = await result(b);
  R.check('커서 없을 때: 평소 click 한 번 → 1회', r3.cnt === 1 && r3.html.length > 0, r3);

  // ④ 두 번 연달아 탭(1초 간격) → 2회 (버림은 바로 뒤 click 하나만)
  let sum = 0;
  for (let k = 0; k < 2; k++) {
    await setup(b);
    await focusTo(b);
    [x, y] = await center(b);
    await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await sleep(80);
    await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(1000);
    sum += (await result(b)).cnt;
  }
  R.check('두 번 탭(각각 새로 입력) → 합계 2회', sum === 2, sum);

  const exc = b.logs.filter(l => /EXC/.test(l));
  R.check('예외 0', exc.length === 0, exc.slice(0, 3));
  b.close();

  // ⑤ PC 마우스: 입력칸 커서가 있어도 click 한 번 → 1회 (pointerdown 실행 안 함)
  const d = await launch({ port: 9862, w: 1440, h: 1000 });
  await d.send('Network.setBypassServiceWorker', { bypass: true });
  await d.goto(BASE + '#normal', 800); await ready(d);
  await setup(d);
  await focusTo(d, false);
  [x, y] = await center(d);
  await d.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await sleep(100);
  const m0 = await result(d);
  await d.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); await sleep(900);
  const m1 = await result(d);
  R.check('PC 마우스: 누르는 순간엔 안 찾고, 떼면 1회', m0.cnt === 0 && m1.cnt === 1, { m0, m1 });
  d.close();
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
