/* e2e: 키보드로 역 고르기와 패널 포커스 (IMPL9 건 2)
 *  - 키보드만으로: / → '강남' → ↓ → Enter → 역 상세가 열리고 포커스가 패널 안으로
 *  - Esc 로 닫으면 포커스가 검색창으로 돌아감
 *  - 툴바 메뉴(분석 > 철도망 통계)로 연 패널을 Esc 로 닫으면 포커스가 '분석' 버튼으로
 *  - 역 상세 ✕ 를 Tab 으로 찾아 Enter 로 닫아도 같은 자리로
 *  - 길찾기·그리기 패널: 키보드로 열면 패널 안으로, 닫으면 연 버튼(메뉴 안이면 메뉴 버튼)으로
 * 실행: node tests/e2e/run.js --only focus-return
 */
'use strict';
const { launch, sleep, BASE, recorder, clickStation } = require('./lib/cdp');
const R = recorder('focus-return');

async function ready(b) {
  for (let i = 0; i < 120; i++) { await sleep(400); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&map.loaded()`).catch(() => false)) break; }
  await sleep(600);
}
const active = b => b.evaluate(`(() => { const a = document.activeElement; if (!a || a === document.body) return 'body';
  const p = a.closest('#sd-panel, #rs-panel, #lc-panel, #cv-panel, #iv-panel, #rt-panel');
  return (a.id || a.className || a.tagName) + (p ? ' @' + p.id : ''); })()`);
const isOpen = (b, id) => b.evaluate(`(() => { const e = document.getElementById('${id}'); if (!e) return false;
  if ('${id}' === 'sd-panel') return e.classList.contains('sd-open'); return e.style.display !== 'none' && !e.hidden; })()`);
// 버튼의 Enter 기본 동작(클릭)은 글자 값(캐리지 리턴)이 있는 키 이벤트여야 일어난다 (실제 키보드와 같게)
async function enter(b) {
  await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: String.fromCharCode(13) });
  await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
}
async function waitOpen(b, id, want = true, ms = 5000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await isOpen(b, id)) === want) return true; await sleep(150); } return false; }

(async () => {
  const b = await launch({ port: 9701, w: 1440, h: 1000 });
  await b.send('Network.setBypassServiceWorker', { bypass: true });
  await b.send('Network.setCacheDisabled', { cacheDisabled: true });
  await b.goto(BASE + '#normal', 800); await ready(b);

  // 1. 키보드만으로 역 고르기
  await b.key('/', 'Slash', 191); await sleep(150);
  await b.type('강남'); await sleep(500);
  await b.key('ArrowDown', 'ArrowDown', 40); await sleep(100);
  const cur = await b.evaluate(`(document.querySelector('#search-results .hit.active .hit-name') || {}).textContent || null`);
  await enter(b);
  const opened = await waitOpen(b, 'sd-panel');
  await sleep(400);
  const a1 = await active(b);
  R.check('키보드: / → 강남 → ↓ → Enter → 역 상세 열림', cur === '강남' && opened, { cur, opened });
  R.check('역 상세가 열리면 포커스가 패널 안으로', /@sd-panel/.test(a1), a1);
  await b.key('Escape', 'Escape', 27);
  const closed = await waitOpen(b, 'sd-panel', false);
  await sleep(200);
  const a2 = await active(b);
  R.check('Esc 로 닫으면 포커스가 검색창으로', closed && a2 === 'search', { closed, a2 });

  // 2. Tab 으로 ✕ 까지 가서 Enter
  await enter(b);   // 검색창에 '강남' 이 남아 있다 — 다시 연다
  await waitOpen(b, 'sd-panel'); await sleep(400);
  let reached = false;
  for (let i = 0; i < 6 && !reached; i++) { reached = (await b.evaluate(`document.activeElement && document.activeElement.id`)) === 'sd-close'; if (!reached) { await b.key('Tab', 'Tab', 9); await sleep(80); } }
  if (reached) await enter(b);
  const closed2 = await waitOpen(b, 'sd-panel', false); await sleep(200);
  const a3 = await active(b);
  R.check('Tab 으로 ✕ 에 닿아 Enter → 닫히고 포커스가 검색창으로', reached && closed2 && a3 === 'search', { reached, closed2, a3 });
  // 68점 감사 4번 (2026-11-13): 닫힌 역 상세는 화면 밖에만 있는 게 아니라 보조기술·Tab 에서도 빠져야 한다
  const inertSt = await b.evaluate(`(() => { const p = document.getElementById('sd-panel'); return { inert: p.inert, ariaHidden: p.getAttribute('aria-hidden') }; })()`);
  let leaked = null;
  for (let i = 0; i < 40 && !leaked; i++) {
    await b.key('Tab', 'Tab', 9); await sleep(30);
    leaked = await b.evaluate(`(() => { const a = document.activeElement; return a && a.closest('#sd-panel') ? (a.id || a.tagName) : null; })()`);
  }
  R.check('닫힌 역 상세: inert·aria-hidden 이고 Tab 40번 눌러도 안으로 안 들어감', inertSt.inert === true && inertSt.ariaHidden === 'true' && !leaked, { inertSt, leaked });
  await b.key('Escape', 'Escape', 27); await sleep(100);
  await b.evaluate(`document.activeElement && document.activeElement.blur(); 0`);

  // 3. 툴바 '분석 > 철도망 통계' (키보드: Tab 으로 버튼, Enter)
  const dd = await b.evaluate(`(() => { const e = [...document.querySelectorAll('#toolbar .tb-dropbtn')].find(x => x.textContent.trim().startsWith('분석')); e.focus(); return document.activeElement === e; })()`);
  await enter(b); await sleep(250);
  const sb = await b.evaluate(`(() => { const e = document.getElementById('stats-btn'); e.focus(); return document.activeElement === e; })()`);
  await enter(b);
  const rsOpen = await waitOpen(b, 'rs-panel'); await sleep(300);
  const a4 = await active(b);
  R.check('분석 > 철도망 통계 (키보드) → 패널 열림·포커스가 패널 안으로', dd && sb && rsOpen && /@rs-panel/.test(a4), { dd, sb, rsOpen, a4 });
  await b.key('Escape', 'Escape', 27);
  const rsClosed = await waitOpen(b, 'rs-panel', false); await sleep(200);
  const a5 = await active(b);
  R.check("Esc 로 닫으면 포커스가 '분석' 버튼으로 (메뉴 항목은 닫혀 안 보이므로)", rsClosed && /tb-dropbtn/.test(a5), { rsClosed, a5 });

  // 5. 길찾기 패널 (키보드): '길찾기' 버튼 Enter → 포커스가 '출발' 칸으로, Esc → '길찾기' 버튼으로
  const rb = await b.evaluate(`(() => { const e = document.querySelector('#tabbar [data-tab="route"]'); e.focus(); return document.activeElement === e; })()`);   // J7: 길찾기 = 왼쪽 레일
  await enter(b); await sleep(300);
  const rOpen = await b.evaluate(`!document.getElementById('route-panel').hidden`);
  const a6 = await b.evaluate(`document.activeElement && document.activeElement.id`);
  R.check("길찾기 (키보드) → 패널 열림·포커스가 '출발' 칸으로", rb && rOpen && a6 === 'route-from', { rb, rOpen, a6 });
  await b.key('Escape', 'Escape', 27); await sleep(300);
  const rClosed = await b.evaluate(`document.getElementById('route-panel').hidden`);
  const a7 = await b.evaluate(`document.activeElement && document.activeElement.getAttribute('data-tab')`);
  R.check("Esc 로 닫으면 포커스가 레일 '길찾기' 버튼으로", rClosed && a7 === 'route', { rClosed, a7 });
  // 6. 그리기 패널 (키보드): '도구 > 나만의 노선 그리기' → 포커스가 패널로, ✕(Enter) → '도구' 버튼으로
  const tb = await b.evaluate(`(() => { const e = [...document.querySelectorAll('#toolbar .tb-dropbtn')].find(x => x.textContent.trim().startsWith('도구')); e.focus(); return document.activeElement === e; })()`);
  await enter(b); await sleep(250);
  const db = await b.evaluate(`(() => { const e = document.getElementById('draw-btn'); e.focus(); return document.activeElement === e; })()`);
  await enter(b); await sleep(300);
  const dOpen = await b.evaluate(`!document.getElementById('draw-panel').hidden`);
  const a8 = await b.evaluate(`(() => { const a = document.activeElement; return a && (a.id || a.className); })()`);
  R.check('그리기 (키보드) → 패널 열림·포커스가 패널로', tb && db && dOpen && a8 === 'draw-panel', { tb, db, dOpen, a8 });
  await b.evaluate(`document.querySelector('#draw-panel .rp-close').focus()`);
  await enter(b); await sleep(300);
  const dClosed = await b.evaluate(`document.getElementById('draw-panel').hidden`);
  const a9 = await active(b);
  R.check("✕ 로 닫으면 포커스가 '도구' 버튼으로 (메뉴 항목은 닫혀 안 보이므로)", dClosed && /tb-dropbtn/.test(a9), { dClosed, a9 });
  const drawEnded = await b.evaluate(`map.getCanvas().style.cursor !== 'crosshair' && !document.getElementById('draw-btn').classList.contains('active')`);
  R.check('✕ 로 닫으면 그리기도 끝남 (지도 클릭이 점을 더 찍지 않음)', drawEnded, drawEnded);

  // 4. 마우스 동작은 그대로: 지도에서 역 클릭 → 상세 열림, ✕ 클릭 → 닫힘
  const seoulId = await b.evaluate(`(() => { const s = STATIONS.find(f => f.properties.name_ko === '서울'); map.jumpTo({ center: s.geometry.coordinates, zoom: 15 }); return s.properties.id; })()`);
  const cs = await clickStation(b, seoulId);   // 클릭으로 잡힐 때까지 기다린 뒤 클릭 (2026-11-09 FLAKY 원인)
  const mo = await waitOpen(b, 'sd-panel'); await sleep(600);   // 패널이 미끄러져 들어오는 동안 기다림
  const cx = await b.evaluate(`(() => { const r = document.getElementById('sd-close').getBoundingClientRect(); return [r.x + r.width/2, r.y + r.height/2]; })()`);
  await b.click(cx[0], cx[1]);
  const mc = await waitOpen(b, 'sd-panel', false);
  R.check('마우스: 지도에서 역 클릭 → 상세, ✕ 클릭 → 닫힘 (기존 동작)', cs.ok && mo && mc, { cs, mo, mc });
  const exc = b.logs.filter(l => /EXC/.test(l));
  R.check('예외 0', exc.length === 0, exc.slice(0, 3));
  b.close();
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
