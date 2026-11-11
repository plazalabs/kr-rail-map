/* e2e: 길찾기 결과가 한눈에 (2026-11-11 회장님 요청)
 *  - 결과 칸이 따로 스크롤되지 않는다 (예전: 300px 로 묶여 광운대→여의도 439px 중 300px 만 보임)
 *  - 데스크톱(1440×900, 1366×768)에서 길찾기 창 전체가 화면 안에 들어온다 — 마우스 휠로 내릴 필요 없음
 *  - 경로 종류 탭 4개가 한 줄
 *  - 휴대폰(390×844)은 바닥 시트 하나만 스크롤 (결과 칸 안쪽 스크롤 없음)
 * 실행: node tests/e2e/run.js --only route-fit
 */
'use strict';
const { launch, sleep, BASE, recorder } = require('./lib/cdp');
const R = recorder('route-fit');

async function ready(b) {
  for (let i = 0; i < 120; i++) { await sleep(400); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&map.loaded()`).catch(() => false)) break; }
  await sleep(600);
}
// 동명역이 있으므로 노선으로 특정한다
const CASES = [
  ['광운대→여의도 (개통 예정 포함)', ['광운대', 'seoul-metropolitan-subway-line-1'], ['여의도', 'seoul-subway-line-5'], true],
  ['서울→부산 (KTX)', ['서울', 'gyeongbu-line'], ['부산', 'busan-metro-line-1'], false],
  ['인천→잠실', ['인천', 'seoul-metropolitan-subway-line-1'], ['잠실', 'seoul-subway-line-2'], false],
];
async function run(b, [from, to, un]) {
  await b.evaluate(`(() => {
    const pick = (n, l) => (STATIONS.find(s => s.properties.name_ko === n && (s.properties.lines || []).includes(l)) || STATIONS.find(s => s.properties.name_ko === n));
    document.getElementById('route-panel').hidden = false;
    const f = document.getElementById('route-from'), t = document.getElementById('route-to');
    const a = pick(${JSON.stringify(from[0])}, ${JSON.stringify(from[1])}), z = pick(${JSON.stringify(to[0])}, ${JSON.stringify(to[1])});
    f.value = a.properties.name_ko; f.dataset.sid = a.properties.id; t.value = z.properties.name_ko; t.dataset.sid = z.properties.id;
    const u = document.getElementById('route-unopened'); if (u.checked !== ${un}) u.click();
    document.getElementById('route-go').click(); })()`);
  for (let i = 0; i < 30; i++) { await sleep(200); if (await b.evaluate(`document.querySelectorAll('#route-result .rc-tab').length > 0`)) break; }
  await sleep(500);
  return b.evaluate(`(() => { const p = document.getElementById('route-panel'), rr = document.getElementById('route-result');
    const pr = p.getBoundingClientRect(); const tabs = [...rr.querySelectorAll('.rc-tabs .rc-tab')].map(t => Math.round(t.getBoundingClientRect().top));
    return { resultInnerScroll: rr.scrollHeight - rr.clientHeight, panelScroll: p.scrollHeight - p.clientHeight,
      top: Math.round(pr.top), bottom: Math.round(pr.bottom), vh: innerHeight, tabRows: new Set(tabs).size, tabs: tabs.length }; })()`);
}

(async () => {
  for (const [w, h] of [[1440, 900], [1366, 768], [1366, 720]]) {   // 1366×720 ≈ 안 높이 625px (GitHub 러너와 같음)
    const b = await launch({ port: 9781, w, h });
    await b.send('Network.setBypassServiceWorker', { bypass: true });
    await b.goto(BASE + '#normal', 800); await ready(b);
    for (const c of CASES) {
      const r = await run(b, c.slice(1));
      R.check(`${w}×${h} ${c[0]}: 결과 칸 안쪽 스크롤 없음`, r.resultInnerScroll <= 1, r);
      R.check(`${w}×${h} ${c[0]}: 창 전체가 화면 안 (내릴 필요 없음)`, r.panelScroll <= 1 && r.bottom <= r.vh, r);
      R.check(`${w}×${h} ${c[0]}: 경로 종류 탭이 한 줄`, r.tabs >= 3 && r.tabRows === 1, r);
    }
    const exc = b.logs.filter(l => /EXC/.test(l));
    R.check(`${w}×${h} 예외 0`, exc.length === 0, exc.slice(0, 3));
    b.close(); await sleep(800);
  }
  // 휴대폰: 시트 하나만 스크롤
  const m = await launch({ port: 9782, w: 390, h: 844, mobile: true });
  await m.send('Network.setBypassServiceWorker', { bypass: true });
  await m.goto(BASE + '#normal', 800); await ready(m);
  const r = await run(m, CASES[0].slice(1));
  R.check('390×844 광운대→여의도: 결과 칸 안쪽 스크롤 없음 (시트 하나만 스크롤)', r.resultInnerScroll <= 1, r);
  R.check('390×844: 탭이 한 줄', r.tabRows === 1, r);
  m.close();
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
