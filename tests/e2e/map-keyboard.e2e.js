/* e2e: 지도 위 역 키보드 탐색 (접근성, 2026-11-11)
 *  - 지도 캔버스에 포커스 → N 으로 화면 가운데에서 가까운 역부터 하나씩 고르기, P 로 되돌아가기
 *  - 고른 역에 둥근 테두리, 상태 줄(aria-live)에 역 이름
 *  - Enter → 그 역의 상세 패널이 열림, Esc 로 닫으면 포커스가 지도로 돌아옴
 *  - 한글 자판(e.key = 'ㅜ')이어도 e.code 로 동작
 *  - 화살표 키는 지도 이동 그대로
 * 실행: node tests/e2e/run.js --only map-keyboard
 */
'use strict';
const { launch, sleep, BASE, recorder } = require('./lib/cdp');
const R = recorder('map-keyboard');

async function ready(b) {
  for (let i = 0; i < 120; i++) { await sleep(400); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&map.loaded()`).catch(() => false)) break; }
  await sleep(600);
}
async function press(b, key, code, keyCode, text) {
  await b.send('Input.dispatchKeyEvent', Object.assign({ type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode }, text ? { text } : {}));
  await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode });
  await sleep(200);
}
const status = b => b.evaluate(`document.getElementById('status').textContent`);
const ring = b => b.evaluate(`(() => { const e = document.querySelector('.kb-station-ring'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);

(async () => {
  const b = await launch({ port: 9711, w: 1440, h: 1000 });
  await b.send('Network.setBypassServiceWorker', { bypass: true });
  await b.goto(BASE + '#normal', 800); await ready(b);
  // 서울역 근처, 역이 적당히 보이는 줌
  const exp = await b.evaluate(`(() => { const s = STATIONS.find(f => f.properties.name_ko === '서울'); map.jumpTo({ center: s.geometry.coordinates, zoom: 14 }); return s.properties.id; })()`);
  await sleep(800);
  const label = await b.evaluate(`map.getCanvas().getAttribute('aria-label') || ''`);
  R.check('지도 캔버스가 키 안내를 읽어 준다', /N\/P/.test(label) && /Enter/.test(label), label);
  const focused = await b.evaluate(`(() => { const c = map.getCanvas(); c.focus(); return document.activeElement === c; })()`);
  R.check('지도 캔버스에 키보드 포커스가 간다', focused, focused);

  await press(b, 'n', 'KeyN', 78, 'n');
  const s1 = await status(b), r1 = await ring(b);
  const first = await b.evaluate(`KbNav.current() && KbNav.current().properties.id`);
  R.check('N → 화면 가운데에서 가장 가까운 역(서울)을 고름', first === exp && /서울역/.test(s1) && !!r1, { first, s1, r1 });
  // 고른 역 테두리가 실제 역 위치에 있다 (±3px)
  const px = await b.evaluate(`(() => { const p = map.project(KbNav.current().geometry.coordinates); const o = map.getContainer().getBoundingClientRect(); return { x: Math.round(o.x + p.x), y: Math.round(o.y + p.y) }; })()`);
  R.check('테두리가 고른 역 위치에 그려진다', r1 && Math.abs(r1.x - px.x) <= 3 && Math.abs(r1.y - px.y) <= 3, { r1, px });

  // 한글 자판: key 'ㅜ', code 'KeyN'
  await press(b, 'ㅜ', 'KeyN', 78, 'ㅜ');
  const second = await b.evaluate(`KbNav.current() && KbNav.current().properties.id`);
  const s2 = await status(b);
  R.check('한글 자판에서도 N(ㅜ) 으로 다음 역', !!second && second !== first && /2\//.test(s2), { second, s2 });
  await press(b, 'p', 'KeyP', 80, 'p');
  const back = await b.evaluate(`KbNav.current() && KbNav.current().properties.id`);
  R.check('P → 이전 역으로 돌아감', back === first, { back, first });

  // 화살표는 지도 이동 그대로
  const c0 = await b.evaluate(`map.getCenter().lng`);
  await press(b, 'ArrowRight', 'ArrowRight', 39); await sleep(600);
  const c1 = await b.evaluate(`map.getCenter().lng`);
  R.check('화살표 → 지도 이동 (기존 동작)', c1 > c0, { c0, c1 });

  // Enter → 상세, Esc → 닫히고 포커스가 지도로
  await press(b, 'Enter', 'Enter', 13, '\r'); await sleep(700);
  const sd = await b.evaluate(`(() => { const p = document.getElementById('sd-panel'); return !!p && p.classList.contains('sd-open') && p.textContent.includes('서울'); })()`);
  R.check('Enter → 고른 역의 상세 패널이 열림', sd, sd);
  await press(b, 'Escape', 'Escape', 27); await sleep(500);
  const back2 = await b.evaluate(`document.activeElement === map.getCanvas()`);
  R.check('Esc 로 상세를 닫으면 포커스가 지도로', back2, back2);
  await press(b, 'Escape', 'Escape', 27);
  const cleared = await b.evaluate(`!KbNav.current() && !document.querySelector('.kb-station-ring')`);
  R.check('지도에서 Esc → 역 고르기 끝 (테두리 사라짐)', cleared, cleared);

  // 화면에 역이 없을 때
  await b.evaluate(`map.jumpTo({ center: [131.5, 35.0], zoom: 12 }); true`); await sleep(500);
  await b.evaluate(`map.getCanvas().focus()`);
  await press(b, 'n', 'KeyN', 78, 'n');
  const none = await status(b);
  R.check('화면에 역이 없으면 안내', /역이 없습니다/.test(none), none);

  const exc = b.logs.filter(l => /EXC/.test(l));
  R.check('예외 0', exc.length === 0, exc.slice(0, 3));
  b.close();
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
