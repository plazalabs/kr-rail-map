/* e2e: 휴대폰 길찾기 결과 '요약 한 줄' (2026-11-13, 회장님: 결과가 나와도 창이 지도를 가림)
 *  390×844 — 강남 → 서울 경로 찾기
 *  - 창이 접혀 높이가 화면의 25% 이하, 요약 줄에 '분'·'환승'
 *  - 경로(선)가 창에 가리지 않는 지도 영역 안에 있음 (경로 bbox 아래쪽 < 창 위쪽)
 *  - [자세히 ▲] → 펼쳐져 탭·결과 보임, 머리에 [지도 보기 ▼] → 다시 접힘
 *  PC 1440 — 접히지 않음(예전 그대로)
 * 실행: node tests/e2e/run.js --only route-peek
 */
'use strict';
const { launch, sleep, BASE, recorder } = require('./lib/cdp');
const R = recorder('route-peek');
async function ready(b) {
  for (let i = 0; i < 120; i++) { await sleep(300); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&!!map.getSource('lines')&&typeof RouteCompare!=='undefined'`).catch(() => false)) break; }
  await sleep(800);
}
const go = b => b.evaluate(`(() => { const S = n => STATIONS.find(s => s.properties.name_ko === n && s.properties.lines.includes('seoul-subway-line-2')) || STATIONS.find(s => s.properties.name_ko === n);
  document.getElementById('route-panel').hidden = false;
  setRouteStation(document.getElementById('route-from'), S('강남')); setRouteStation(document.getElementById('route-to'), S('서울'));
  document.getElementById('route-go').click(); })()`);

(async () => {
  let b = await launch({ port: 9761, w: 390, h: 844, mobile: true });
  await b.goto(BASE + '#normal', 1500); await ready(b);
  await go(b); await sleep(1800);
  const m1 = await b.evaluate(`(() => { const rp = document.getElementById('route-panel'), r = rp.getBoundingClientRect();
    const sum = (rp.querySelector('.rp-peek-sum') || {}).textContent || '';
    const src = map.getSource('route-highlight') || map.getSource('route-line') || null;
    let top = null, bottom = null;
    const feats = map.queryRenderedFeatures().filter(f => /route/.test(f.layer.id) && f.geometry && f.geometry.type !== 'Point');
    feats.forEach(f => { const cs = f.geometry.type === 'LineString' ? f.geometry.coordinates : [].concat(...f.geometry.coordinates);
      cs.forEach(c => { const p = map.project(c); const y = p.y + map.getCanvas().getBoundingClientRect().y; if (top == null || y < top) top = y; if (bottom == null || y > bottom) bottom = y; }); });
    return { peek: rp.classList.contains('rp-peek'), h: Math.round(r.height), panelTop: Math.round(r.top), vh: innerHeight, sum, routeTop: top && Math.round(top), routeBottom: bottom && Math.round(bottom), n: feats.length }; })()`);
  R.check('휴대폰: 결과가 나오면 창이 접힘 (높이 ≤ 화면 25%) + 요약에 분·환승', m1.peek && m1.h <= m1.vh * 0.25 && /분/.test(m1.sum) && /환승/.test(m1.sum), m1);
  R.check('휴대폰: 경로 선이 창에 가리지 않는 곳에 그려짐 (경로 아래 끝 < 창 위)', m1.n > 0 && m1.routeBottom != null && m1.routeBottom < m1.panelTop && m1.routeTop > 0, m1);
  await b.evaluate(`document.querySelector('#route-panel .rp-peek-open').click(); 0`); await sleep(300);
  const m2 = await b.evaluate(`(() => { const rp = document.getElementById('route-panel'); const fold = document.getElementById('route-peek-btn');
    return { peek: rp.classList.contains('rp-peek'), tabs: !!rp.querySelector('.rc-tab') && rp.querySelector('.rc-tab').offsetParent !== null, fold: !!fold && fold.offsetParent !== null, h: Math.round(rp.getBoundingClientRect().height) }; })()`);
  R.check('[자세히 ▲] → 펼쳐져 탭이 보이고 머리에 [지도 보기 ▼]', !m2.peek && m2.tabs && m2.fold, m2);
  await b.evaluate(`document.getElementById('route-peek-btn').click(); 0`); await sleep(300);
  const m3 = await b.evaluate(`document.getElementById('route-panel').classList.contains('rp-peek')`);
  R.check('[지도 보기 ▼] → 다시 접힘', m3 === true);
  const exc = b.logs.filter(l => /EXC/.test(l));
  // 2026-11-14 회장님: 실제 휴대폰에서 '찾기'를 눌러도 창·키보드·서랍·역 상세가 지도를 가림 → 결과가 나오면 다 닫고 지도
  //  사이드 서랍 열고 + 역 상세 열고 + 도착 칸에 초점(키보드) 둔 채로 '찾기'
  await b.evaluate(`(() => { if (window.UI && UI.openDrawer) UI.openDrawer(); StationDetail.show(STATIONS.find(s => s.properties.name_ko === '광화문'));
    const S = n => STATIONS.find(s => s.properties.name_ko === n);
    document.getElementById('route-panel').hidden = false;
    setRouteStation(document.getElementById('route-from'), S('광화문')); setRouteStation(document.getElementById('route-to'), S('잠실'));
    document.getElementById('route-to').focus(); })()`); await sleep(600);
  await b.evaluate(`document.getElementById('route-go').click(); 0`); await sleep(1800);
  const m4 = await b.evaluate(`(() => { const a = document.activeElement; const rp = document.getElementById('route-panel'), r = rp.getBoundingClientRect();
    return { focusInput: !!(a && /INPUT|TEXTAREA/.test(a.tagName)), drawer: document.body.classList.contains('drawer-open'), sd: document.getElementById('sd-panel').classList.contains('sd-open'),
      acOpen: [...document.querySelectorAll('.ac-list')].some(l => !l.hidden), peek: rp.classList.contains('rp-peek'), h: r.height, vh: innerHeight }; })()`);
  R.check('찾기 → 키보드(입력칸 초점)·서랍·역 상세·자동완성 목록이 다 닫히고 창은 한 줄로', !m4.focusInput && !m4.drawer && !m4.sd && !m4.acOpen && m4.peek && m4.h <= m4.vh * 0.25, m4);
  R.check('예외 0 (휴대폰)', exc.length === 0, exc.slice(0, 3));
  b.close();

  b = await launch({ port: 9762, w: 1440, h: 900 });
  await b.goto(BASE + '#normal', 1500); await ready(b);
  await go(b); await sleep(1500);
  const p = await b.evaluate(`(() => { const rp = document.getElementById('route-panel'); return { peek: rp.classList.contains('rp-peek'), tabs: !!rp.querySelector('.rc-tab') && rp.querySelector('.rc-tab').offsetParent !== null }; })()`);
  R.check('PC: 접히지 않고 결과 그대로', !p.peek && p.tabs, p);
  b.close();
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
