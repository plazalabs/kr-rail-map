/* e2e: 처음 온 사람 안내 카드 (js/guide.js, 2026-11-11)
 *  - 첫 방문(저장 없음)에는 지도가 뜬 뒤 카드가 보인다 — 데스크톱·휴대폰 모두 화면 안, 툴바를 가리지 않음
 *  - '통근권 찾기' 를 누르면 카드가 닫히고 통근권 패널이 열린다
 *  - 다시 열면(새로고침) 카드가 다시 뜨지 않는다
 *  - 링크로 들어오면(?line=…) 처음이어도 뜨지 않는다
 *  - ✕ 로 닫힌다
 * 실행: node tests/e2e/run.js --only guide
 */
'use strict';
const { launch, sleep, BASE, recorder } = require('./lib/cdp');
const R = recorder('guide');

async function ready(b) {
  for (let i = 0; i < 120; i++) { await sleep(400); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&map.loaded()`).catch(() => false)) break; }
  await sleep(1200);
}
const card = b => b.evaluate(`(() => { const e = document.getElementById('guide-card'); if (!e) return null; const r = e.getBoundingClientRect();
  const tb = document.getElementById('toolbar').getBoundingClientRect();
  const overlapTb = !(r.right <= tb.left || r.left >= tb.right || r.bottom <= tb.top || r.top >= tb.bottom);
  const its = [...e.querySelectorAll('.gd-item')].map(x => x.getBoundingClientRect());
  return { inVp: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, items: e.querySelectorAll('.gd-item').length, overlapTb,
    share: Math.round(r.width * r.height / (innerWidth * innerHeight) * 1000) / 10, h: Math.round(r.height),
    minTap: Math.round(Math.min(...its.map(x => Math.min(x.width, x.height)))) }; })()`);

(async () => {
  for (const [w, h, mobile] of [[1440, 900, false], [390, 844, true]]) {
    const b = await launch({ port: 9791, w, h, mobile, guide: true });
    await b.send('Network.setBypassServiceWorker', { bypass: true });
    await b.goto(BASE + '#normal', 800); await ready(b);
    const c1 = await card(b);
    R.check(`${w}px 첫 방문: 안내 카드가 화면 안에 4항목, 툴바를 가리지 않음`, !!c1 && c1.inVp && c1.items === 4 && !c1.overlapTb, c1);
    // J8 (2026-11-14): 휴대폰에서 지도를 36% 가리던 카드 → 화면의 15% 이하, 누르는 칸은 44px 이상
    if (mobile) R.check(`${w}px J8 안내 카드가 화면의 15% 이하·누르는 칸 44px 이상`, !!c1 && c1.share <= 15 && c1.minTap >= 44, c1);
    await b.evaluate(`[...document.querySelectorAll('#guide-card .gd-item')].find(e => e.textContent.includes('통근권')).click()`); await sleep(1200);
    const after = await b.evaluate(`({ card: !!document.getElementById('guide-card'), cm: !!document.getElementById('cm-panel') && document.getElementById('cm-panel').style.display !== 'none' })`);
    R.check(`${w}px '통근권 찾기' → 카드 닫힘·통근권 열림`, !after.card && after.cm, after);
    await b.goto(BASE + '#normal', 800); await ready(b);
    R.check(`${w}px 다시 열면 카드가 안 뜬다`, (await card(b)) === null);
    b.close(); await sleep(800);
  }
  // 링크로 들어온 첫 방문 · ✕ 닫기
  const b = await launch({ port: 9792, w: 1440, h: 900, guide: true });
  await b.send('Network.setBypassServiceWorker', { bypass: true });
  await b.goto(BASE.replace(/#.*$/, '') + '?line=seoul-subway-line-2#normal', 800); await ready(b);
  R.check('링크(?line=)로 들어오면 첫 방문이어도 안 뜬다', (await card(b)) === null);
  await b.evaluate(`localStorage.removeItem('krrail-guide-seen'); history.replaceState(null, '', location.pathname + '#normal'); Guide.show(); true`); await sleep(300);
  await b.evaluate(`document.querySelector('#guide-card .gd-close').click()`); await sleep(300);
  const closed = await b.evaluate(`!document.getElementById('guide-card') && localStorage.getItem('krrail-guide-seen') === '1'`);
  R.check('✕ 로 닫히고 다시 안 뜨게 기억', closed);
  // 사이드바 '빠른 시작' — 카드를 본 뒤에도 늘 있다 (회장님: '처음 화면에 있던 게 안 보인다', 2026-11-11)
  const qs = await b.evaluate(`(() => { const items = [...document.querySelectorAll('#quick-start .qs-item')]; return { n: items.length, names: items.map(e => e.querySelector('b').textContent),
    visible: items.every(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.top >= 0 && r.bottom <= innerHeight; }) }; })()`);
  R.check("카드를 본 뒤에도 사이드바 '빠른 시작' 3칸(길찾기는 레일, J7)이 화면 안에 늘 있다", qs.n === 3 && qs.visible && /통근권/.test(qs.names[0]) && !qs.names.some(n => /길찾기/.test(n)), qs);
  await b.evaluate(`document.querySelector('#quick-start .qs-item[data-i="1"]').click()`); await sleep(1000);
  R.check("빠른 시작 '통근권 찾기' → 통근권 패널", await b.evaluate(`document.getElementById('cm-panel') && document.getElementById('cm-panel').style.display !== 'none'`));
  await b.evaluate(`CommuteMap.hide(); document.querySelector('#quick-start .qs-item[data-i="2"]').click()`); await sleep(500);
  const inv = await b.evaluate(`({ on: KR_MODE.isInvest(), label: document.querySelector('#quick-start .qs-item[data-i="2"] b').textContent, pressed: document.querySelector('#quick-start .qs-item[data-i="2"]').getAttribute('aria-pressed') })`);
  R.check("빠른 시작 '투자 모드' → 켜지고 칸이 '켜짐' 표시", inv.on && /켜짐/.test(inv.label) && inv.pressed === 'true', inv);
  await b.evaluate(`document.querySelector('#quick-start .qs-item[data-i="2"]').click()`); await sleep(400);
  R.check("한 번 더 누르면 꺼짐", await b.evaluate(`!KR_MODE.isInvest()`));
  const exc = b.logs.filter(l => /EXC/.test(l));
  R.check('예외 0', exc.length === 0, exc.slice(0, 3));
  b.close();
  // 휴대폰: 서랍 안 맨 위, 누르면 서랍이 닫히고 그 기능
  const m = await launch({ port: 9793, w: 390, h: 844, mobile: true });
  await m.send('Network.setBypassServiceWorker', { bypass: true });
  await m.goto(BASE + '#normal', 800); await ready(m);
  await m.evaluate(`document.getElementById('sidebar-toggle').click(); true`); await sleep(700);
  const mv = await m.evaluate(`(() => { const e = document.querySelector('#quick-start .qs-item'); const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && document.body.classList.contains('drawer-open'); })()`);
  R.check('휴대폰: ☰ 서랍 맨 위에 빠른 시작이 보인다', mv);
  // J7: 길찾기는 레일로 옮겨 빠른 시작에는 통근권(1)·투자(2)·노선도(3)
  await m.evaluate(`document.querySelector('#quick-start .qs-item[data-i="1"]').click()`); await sleep(900);
  const mr = await m.evaluate(`({ drawer: document.body.classList.contains('drawer-open'), cm: !!document.getElementById('cm-panel') && document.getElementById('cm-panel').style.display !== 'none' })`);
  R.check("휴대폰: '통근권 찾기' 누르면 서랍이 닫히고 통근권 창이 열린다", !mr.drawer && mr.cm, mr);
  m.close();
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
