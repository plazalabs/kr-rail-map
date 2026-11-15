/* e2e: 낮은 PC 화면의 역 타일 (정반합 8차 A12·A13, 2026-11-15)
 *  - 1280×649: '타일 / 분석' 탭이 보이고('지도' 탭은 숨김), 타일을 고르면 분석 탭으로 — 판과 카드를 위아래로 나누지 않는다
 *  - 1440×900: 탭 없이 전처럼 판 + 카드
 *  - 통근권 창이 열린 채 타일을 열면 통근권 창이 닫힌다 (지도 316px 만 남던 것)
 * 실행: node tests/e2e/run.js --only market-short
 */
'use strict';
const { launch, sleep, BASE, recorder } = require('./lib/cdp');
const R = recorder('market-short');
async function ready(b) {
  for (let i = 0; i < 120; i++) { await sleep(300); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&typeof MarketMap!=='undefined'`).catch(() => false)) break; }
  await sleep(800);
}
const tilesUp = async b => { for (let i = 0; i < 40; i++) { if (await b.evaluate(`document.querySelectorAll('#mm-panel .mm-tile').length > 30`)) return true; await sleep(300); } return false; };
const vis = sel => `(() => { const e = document.querySelector('${sel}'); if (!e) return false; const r = e.getBoundingClientRect(); return getComputedStyle(e).display !== 'none' && r.width > 0 && r.height > 0; })()`;
(async () => {
  // 1) 낮은 PC 화면
  let b = await launch({ port: 9791, w: 1280, h: 649 });
  await b.goto(BASE + '#normal', 1500); await ready(b);
  // A13: 통근권 먼저 열고 → 타일 열기
  await b.evaluate(`document.getElementById('commute-btn').click(); 0`); await sleep(900);
  const cm0 = await b.evaluate(`!!(window.CommuteMap && CommuteMap.isActive && CommuteMap.isActive())`);
  await b.evaluate(`MarketMap.open({}); 0`); await tilesUp(b);
  const cm1 = await b.evaluate(`!!(window.CommuteMap && CommuteMap.isActive && CommuteMap.isActive())`);
  R.check('통근권 창이 열린 채 타일을 열면 통근권 창이 닫힘 (A13)', cm0 === true && cm1 === false, { cm0, cm1 });
  const t0 = await b.evaluate(`({ tabs: ${vis('#mm-panel .mm-tabs')}, mapTab: ${vis('#mm-panel .mm-tabs button[data-tab="map"]')}, tab: document.getElementById('mm-panel').dataset.tab })`);
  R.check("1280×649: '타일/분석' 탭이 보이고 '지도' 탭은 숨김, 처음은 타일", t0.tabs && !t0.mapTab && t0.tab === 'tiles', t0);
  const boardH = await b.evaluate(`Math.round(document.querySelector('#mm-panel .mm-board').getBoundingClientRect().height)`);
  await b.evaluate(`document.querySelector('#mm-panel .mm-tile').click(); 0`); await sleep(700);
  const t1 = await b.evaluate(`({ tab: document.getElementById('mm-panel').dataset.tab, card: ${vis('#mm-panel .mm-card')}, board: ${vis('#mm-panel .mm-board')} })`);
  R.check('타일을 고르면 분석 탭 — 카드만 보이고 판은 숨김', t1.tab === 'card' && t1.card && !t1.board, t1);
  await b.evaluate(`document.querySelector('#mm-panel .mm-tabs button[data-tab="tiles"]').click(); 0`); await sleep(700);
  const t2 = await b.evaluate(`({ tab: document.getElementById('mm-panel').dataset.tab, board: ${vis('#mm-panel .mm-board')}, card: ${vis('#mm-panel .mm-card')}, h: Math.round(document.querySelector('#mm-panel .mm-board').getBoundingClientRect().height) })`);
  R.check("'타일' 탭으로 돌아오면 판이 다시 보이고 카드는 숨김, 판 높이 그대로 이상", t2.tab === 'tiles' && t2.board && !t2.card && t2.h >= boardH - 2, { boardH, t2 });
  let exc = b.logs.filter(l => /EXC/.test(l));
  R.check('예외 0 (낮은 화면)', exc.length === 0, exc.slice(0, 3));
  b.close();
  // 2) 보통 PC 화면 — 탭 없음 그대로
  b = await launch({ port: 9792, w: 1440, h: 900 });
  await b.goto(BASE + '?market=1#normal', 1500); await ready(b); await tilesUp(b);
  const n0 = await b.evaluate(`({ tabs: ${vis('#mm-panel .mm-tabs')} })`);
  await b.evaluate(`document.querySelector('#mm-panel .mm-tile').click(); 0`); await sleep(700);
  const n1 = await b.evaluate(`({ board: ${vis('#mm-panel .mm-board')}, card: ${vis('#mm-panel .mm-card')} })`);
  R.check('1440×900: 탭 없이 판과 카드가 함께 (전과 같음)', !n0.tabs && n1.board && n1.card, { n0, n1 });
  exc = b.logs.filter(l => /EXC/.test(l));
  R.check('예외 0 (보통 화면)', exc.length === 0, exc.slice(0, 3));
  b.close();
  // 3) A17: 투자 모드 평당가 색 — 범례에 '역 N곳 = 법정동 M곳 값'과 기준 달 (타일 수를 독립 표본으로 읽지 않게)
  b = await launch({ port: 9794, w: 1440, h: 900, invest: true });
  await b.goto(BASE + '?market=1&mode=invest#normal', 1500); await ready(b); await tilesUp(b);
  await b.evaluate(`(() => { const s = document.querySelector('#mm-panel select[data-k="color"]'); s.value = 'price'; s.dispatchEvent(new Event('change')); })()`);
  let lg = '';
  for (let i = 0; i < 40; i++) { lg = await b.evaluate(`(document.querySelector('#mm-panel .mm-legend') || {}).textContent || ''`); if (/법정동 \d+곳 값/.test(lg)) break; await sleep(300); }
  R.check("평당가 범례: '역 N곳 = 법정동 M곳 값(같은 동 역은 같은 숫자)' · 기준 달 (A17)", /역 \d+곳 = 법정동 \d+곳 값/.test(lg) && /\d{4}-\d{2}까지 거래/.test(lg), lg.slice(-160));
  b.close();
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
