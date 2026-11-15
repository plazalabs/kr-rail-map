/* e2e: 타일 지도 공유 링크가 화면 조건을 전부 되살린다 + 열린 역 상세가 고른 타일을 따라간다 (평가① P3·P5, 2026-11-15)
 *  - 투자 모드에서 색=평당가·크기=거래 건수/입주 예정 세대 로 만든 링크를, 투자 모드가 꺼진(새) 브라우저에서 열어도 같은 색·크기·연도·묶기
 *  - 배차 끔(wait=0) 도 그대로
 *  - 받는 사람의 저장 모드는 안 바꾼다 (그 방문만 투자 모드)
 *  - 역 상세(A)가 열린 채 타일에서 B 를 고르면 상세도 B 로 (닫혀 있으면 열지 않음)
 * 실행: node tests/e2e/run.js --only market-share
 */
'use strict';
const { launch, sleep, BASE, recorder } = require('./lib/cdp');
const R = recorder('market-share');
async function ready(b) {
  for (let i = 0; i < 120; i++) { await sleep(400); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&map.loaded()`).catch(() => false)) break; }
  await sleep(600);
}
const waitModel = b => (async () => { for (let i = 0; i < 40; i++) { if (await b.evaluate(`!!(window.MarketMap && MarketMap.model())`)) return; await sleep(250); } })();

(async () => {
  // 1) 보내는 사람: 투자 모드
  const a = await launch({ port: 9871, w: 1366, h: 900, invest: true });
  await a.send('Network.setBypassServiceWorker', { bypass: true });
  await a.goto(BASE + '#normal', 800); await ready(a);
  const links = {};
  for (const size of ['deals', 'supply']) {
    await a.evaluate(`(() => { if (window.KR_WAIT && KR_WAIT.set) KR_WAIT.set(false); MarketMap.close && MarketMap.close(); MarketMap.open({ color: 'price', size: '${size}', y: '2031', group: 'sgg' }); return true; })()`);
    await sleep(1500); await waitModel(a);
    links[size] = { url: await a.evaluate(`MarketMap.link()`), st: await a.evaluate(`MarketMap.state()`) };
  }
  R.check('링크에 크기(z=)·투자 모드(mode=invest)·배차(wait=0) 가 들어간다',
    /[?&]z=deals/.test(links.deals.url) && /[?&]z=supply/.test(links.supply.url) && /mode=invest/.test(links.deals.url) && /wait=0/.test(links.deals.url), links);

  // 2) 역 상세가 열린 채 다른 타일을 고르면 상세도 따라 바뀐다
  const sync = await a.evaluate(`(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    let tiles = [...document.querySelectorAll('.mm-tile[data-id]')];
    if (tiles.length < 2) return { n: tiles.length };
    const A = tiles[0].dataset.id;
    window.KR_openStationById(A);
    for (let i = 0; i < 20 && StationDetail.openId() !== A; i++) await wait(200);
    const before = StationDetail.openId();
    await wait(400);
    // 다시 그려졌을 수 있으니 새로 찾고, A 가 아닌 타일을 고른다
    tiles = [...document.querySelectorAll('.mm-tile[data-id]')];
    const tb = tiles.find(t => t.dataset.id !== A);
    const B = tb.dataset.id;
    tb.click();
    for (let i = 0; i < 20 && StationDetail.openId() !== B; i++) await wait(200);
    return { A, B, before, after: StationDetail.openId(), card: MarketMap.state().sel, mmOpen: MarketMap.isOpen() };
  })()`);
  R.check('역 상세(A) 열린 채 타일 B 를 고르면 상세도 B (카드와 같은 역)', sync.before === sync.A && sync.after === sync.B && sync.card === sync.B, sync);
  const closed = await a.evaluate(`(async () => {
    StationDetail.hide(); await new Promise(r => setTimeout(r, 400));
    const cur = MarketMap.state().sel; const t = [...document.querySelectorAll('.mm-tile[data-id]')].find(x => x.dataset.id !== cur); t.click();
    await new Promise(r => setTimeout(r, 700));
    return { open: StationDetail.openId() };
  })()`);
  R.check('상세가 닫혀 있으면 타일을 골라도 상세를 열지 않는다 (카드만 — K6)', closed.open === null, closed);
  a.close();

  // 3) 받는 사람: 투자 모드 꺼진 새 브라우저
  for (const size of ['deals', 'supply']) {
    const b = await launch({ port: 9872, w: 1366, h: 900 });
    await b.send('Network.setBypassServiceWorker', { bypass: true });
    const u = { search: links[size].url };   // MarketMap.link() 는 '?market=1&…' 쿼리만 준다
    // 받는 사람 저장값을 보낸 쪽과 반대로 — 배차 넣음(peak) 으로 저장해 둔 브라우저 (평가①: '저장값이 반대인 새 브라우저')
    await b.goto(BASE + '#normal', 300);
    await b.evaluate(`localStorage.setItem('krrail-wait', 'peak'); localStorage.setItem('krrail-mode', 'rail'); true`);
    await b.goto(BASE + u.search + '#normal', 800); await ready(b); await sleep(1500); await waitModel(b);
    const got = await b.evaluate(`({ st: MarketMap.isOpen() && MarketMap.state(), inv: KR_MODE.isInvest(), saved: localStorage.getItem('krrail-mode'), wait: window.KR_WAIT ? KR_WAIT.isPeak() : null })`);
    const want = links[size].st;
    R.check(`받는 쪽(투자 모드 꺼짐) 크기=${size}: 색·크기·연도·묶기 같음`, got.st && got.st.color === want.color && got.st.size === want.size && got.st.y === want.y && got.st.group === want.group, { got, want });
    R.check(`받는 쪽 크기=${size}: 그 방문만 투자 모드, 저장 설정은 안 바뀜 · 배차 끔 유지`, got.inv === true && got.saved === 'rail' && got.wait === false, got);
    b.close();
  }
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
