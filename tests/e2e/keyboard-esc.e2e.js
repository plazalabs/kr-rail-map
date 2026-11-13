/* e2e: 일반 키 어디서나 (K1, 회장님 지시 2026-11-13 19:40)
 *  지도 페이지
 *   - 포커스가 지도에 있어도 Esc 로 떡상 패널 · 역 타일 지도 · 질문 4개 · 역 상세가 닫힌다
 *   - 떡상 패널 위에 역 상세가 떠 있으면 Esc 한 번 = 역 상세만, 두 번 = 떡상 패널
 *   - 닫을 것이 없으면 Esc = 입력칸에서 빠져나와 지도(캔버스)로 포커스
 *   - Ctrl+K = 검색창, ./?find=1 로 오면 검색창 포커스 + 주소에서 find 지움
 *  게시판 (board.html)
 *   - Esc → 지도 페이지로
 *   - 글 쓰는 중 Esc: 먼저 입력칸에서만 빠짐(페이지 그대로) → 다시 Esc 면 '나갈까요?' 묻고, 아니오면 남음 · 예면 지도
 *   - 내용 칸에서 Ctrl+Enter = 보내기
 *  자료(data.html)·떡상 랭킹(rank.html)에서도 Esc → 지도
 * 실행: node tests/e2e/run.js --only keyboard-esc
 */
'use strict';
const { launch, sleep, BASE, recorder } = require('./lib/cdp');
const R = recorder('keyboard-esc');
const ROOT = BASE.replace(/index\.html.*$/, '').replace(/#.*$/, '');

async function ready(b) {
  for (let i = 0; i < 120; i++) { await sleep(400); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&map.loaded()`).catch(() => false)) break; }
  await sleep(600);
}
const esc = async (b) => { await b.key('Escape', 'Escape', 27); await sleep(500); };
async function ctrl(b, key, code, kc) {
  await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: kc, modifiers: 2 });
  await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: kc, modifiers: 2 });
  await sleep(400);
}
const focusMap = `(() => { const c = map.getCanvas(); c.focus(); return document.activeElement === c; })()`;
const onMap = `document.activeElement === map.getCanvas()`;

(async () => {
  const b = await launch({ port: 9871, w: 1440, h: 900 });
  await b.send('Network.setBypassServiceWorker', { bypass: true });
  await b.goto(BASE + '#normal', 800); await ready(b);
  const exc = [];

  // 떡상 패널
  await b.evaluate(`RocketPanel.open({}); 0`); await sleep(1500);
  await b.evaluate(focusMap);
  const rk0 = await b.evaluate(`RocketPanel.isOpen()`);
  await esc(b);
  R.check('지도에 포커스가 있어도 Esc → 떡상 패널 닫힘', rk0 && !(await b.evaluate(`RocketPanel.isOpen()`)), { rk0 });

  // 역 타일 지도
  await b.evaluate(`MarketMap.open({}); 0`); await sleep(2000);
  await b.evaluate(focusMap);
  const mm0 = await b.evaluate(`MarketMap.isOpen()`);
  await esc(b);
  R.check('Esc → 역 타일 지도(RAIL MARKET MAP) 닫힘', mm0 && !(await b.evaluate(`MarketMap.isOpen()`)), { mm0 });

  // 질문 4개
  await b.evaluate(`StationQuiz.open(); 0`); await sleep(1000);
  await b.evaluate(focusMap);
  const qz0 = await b.evaluate(`StationQuiz.isOpen()`);
  await esc(b);
  R.check('Esc → 나에게 맞는 역 찾기(질문 4개) 닫힘', qz0 && !(await b.evaluate(`StationQuiz.isOpen()`)), { qz0 });

  // 떡상 패널 위 역 상세: 한 번 = 역 상세만, 두 번 = 떡상 패널
  await b.evaluate(`RocketPanel.open({}); 0`); await sleep(1500);
  await b.evaluate(`showStation(STATIONS.find(s => s.properties.name_ko === '잠실' && s.properties.lines.includes('seoul-subway-line-2')), null); 0`); await sleep(1200);
  await b.evaluate(focusMap);
  const st0 = await b.evaluate(`({ sd: !!document.querySelector('#sd-panel.sd-open'), rk: RocketPanel.isOpen() })`);
  await esc(b);
  const st1 = await b.evaluate(`({ sd: !!document.querySelector('#sd-panel.sd-open'), rk: RocketPanel.isOpen() })`);
  await esc(b);
  const st2 = await b.evaluate(`({ sd: !!document.querySelector('#sd-panel.sd-open'), rk: RocketPanel.isOpen() })`);
  R.check('겹쳐 있으면 맨 위부터 하나씩: Esc 1번 = 역 상세, 2번 = 떡상 패널', st0.sd && st0.rk && !st1.sd && st1.rk && !st2.sd && !st2.rk, { st0, st1, st2 });

  // 닫을 것 없음: 검색창에서 Esc → 지도로 포커스
  await b.evaluate(`(() => { const s = document.getElementById('search'); s.value = ''; s.focus(); })()`); await sleep(300);
  await esc(b); await esc(b);   // 첫 Esc 는 검색 목록(최근 역)을 닫을 수 있다
  R.check('닫을 것이 없으면 Esc → 입력칸에서 빠져나와 지도로 포커스', await b.evaluate(onMap), await b.evaluate(`document.activeElement && (document.activeElement.id || document.activeElement.tagName)`));

  // Ctrl+K
  await ctrl(b, 'k', 'KeyK', 75);
  R.check('Ctrl+K → 검색창', await b.evaluate(`document.activeElement === document.getElementById('search')`));
  exc.push(...b.logs.filter(l => /EXC/.test(l)));

  // ?find=1
  await b.goto(ROOT + 'index.html?find=1#normal', 800); await ready(b);
  const f1 = await b.evaluate(`({ focus: document.activeElement === document.getElementById('search'), url: location.search })`);
  R.check('게시판 등에서 온 ?find=1 → 검색창 포커스 · 주소에서 find 지움', f1.focus && !/find=/.test(f1.url), f1);
  exc.push(...b.logs.filter(l => /EXC/.test(l)));
  b.close(); await sleep(800);

  // 게시판
  const g = await launch({ port: 9872, w: 1440, h: 900 });
  await g.send('Network.setBypassServiceWorker', { bypass: true });
  await g.goto(ROOT + 'board.html', 2500);
  await g.evaluate(`document.activeElement && document.activeElement.blur(); 0`);
  await esc(g); await sleep(1500);
  R.check('게시판에서 Esc → 지도 페이지로', await g.evaluate(`!/board\\.html/.test(location.pathname)`), await g.evaluate(`location.pathname`));

  await g.goto(ROOT + 'board.html', 2500);
  await g.evaluate(`(() => { window.__asked = 0; window.confirm = () => { window.__asked++; return false; }; const t = document.getElementById('body'); t.focus(); t.value = '쓰던 글'; })()`);
  await esc(g); await sleep(600);
  const d1 = await g.evaluate(`({ board: /board\\.html/.test(location.pathname), blurred: document.activeElement !== document.getElementById('body'), text: document.getElementById('body').value, asked: window.__asked })`);
  R.check('글 쓰는 중 Esc 1번 = 입력칸에서만 빠짐 (페이지·글 그대로, 묻지 않음)', d1.board && d1.blurred && d1.text === '쓰던 글' && d1.asked === 0, d1);
  await esc(g); await sleep(600);
  const d2 = await g.evaluate(`({ board: /board\\.html/.test(location.pathname), asked: window.__asked, text: document.getElementById('body').value })`);
  R.check("다시 Esc → '나갈까요?' 묻고, 아니오면 게시판에 남음(글 그대로)", d2.board && d2.asked === 1 && d2.text === '쓰던 글', d2);
  await g.evaluate(`window.confirm = () => true; 0`);
  await esc(g); await sleep(1500);
  R.check('예를 고르면 지도 페이지로', await g.evaluate(`!/board\\.html/.test(location.pathname)`));

  // Ctrl+Enter 보내기 (실제로 보내지 않게 submit 을 가로챈다)
  await g.goto(ROOT + 'board.html', 2500);
  await g.evaluate(`(() => { window.__sub = 0; document.addEventListener('submit', e => { window.__sub++; e.preventDefault(); e.stopImmediatePropagation(); }, true); const t = document.getElementById('body'); t.focus(); t.value = 'Ctrl Enter 시험'; })()`);
  await ctrl(g, 'Enter', 'Enter', 13);
  R.check('내용 칸에서 Ctrl+Enter = 보내기', await g.evaluate(`window.__sub === 1`), await g.evaluate(`window.__sub`));
  exc.push(...g.logs.filter(l => /EXC/.test(l)));
  g.close(); await sleep(800);

  // 자료·떡상 랭킹 페이지
  const d = await launch({ port: 9873, w: 1440, h: 900 });
  await d.send('Network.setBypassServiceWorker', { bypass: true });
  for (const pg of ['data.html', 'rank.html']) {
    await d.goto(ROOT + pg, 2500);
    await d.evaluate(`document.activeElement && document.activeElement.blur(); 0`);
    await esc(d); await sleep(1500);
    R.check(`${pg} 에서 Esc → 지도 페이지로`, await d.evaluate(`!/(data|rank)\\.html/.test(location.pathname)`), await d.evaluate(`location.pathname`));
  }
  exc.push(...d.logs.filter(l => /EXC/.test(l)));
  d.close();

  R.check('예외 0', exc.length === 0, exc.slice(0, 3));
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
