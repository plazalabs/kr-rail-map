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
    R.check(`${w}px 첫 방문: 안내 카드가 화면 안, 툴바를 가리지 않음` + (mobile ? '' : ', 4항목'), !!c1 && c1.inVp && !c1.overlapTb && (mobile || c1.items === 4), c1);
    // J8 (2026-11-14): 휴대폰에서 지도를 36% 가리던 카드 → 화면의 15% 이하. 11-15 부터 휴대폰은 질문+입력만(네 기능은 탭바)
    if (mobile) R.check(`${w}px J8 안내 카드가 화면의 15% 이하`, !!c1 && c1.share <= 15, c1);
    // 메타 피드백(11-15): 첫 화면 질문 한 줄 + 우리 동네 역 → '지금 N분 → 개통 후 M분'
    const q = await b.evaluate(`(() => { const e = document.querySelector('#guide-card .gd-q'), i = document.getElementById('gd-st');
      const r = i && i.getBoundingClientRect(); return { q: e && e.textContent, inp: !!i && r.height >= 36 && r.top >= 0 && r.bottom <= innerHeight }; })()`);
    R.check(`${w}px 첫 화면 질문 'GTX 개통 후, 우리 동네…' + 역 입력칸`, /GTX 개통 후, 우리 동네/.test(q.q || '') && q.inp, q);
    await b.evaluate(`(() => { const i = document.getElementById('gd-st'); i.focus(); i.value = '청량리'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`); await sleep(300);
    const ac = await b.evaluate(`(() => { const l = document.querySelector('#guide-card .ac-list'); if (!l || l.hidden) return null; const r = l.getBoundingClientRect();
      return { n: l.querySelectorAll('.ac-item').length, inVp: r.top >= 0 && r.bottom <= innerHeight }; })()`);
    R.check(`${w}px 역 이름을 치면 후보가 화면 안에(위로) 뜬다`, !!ac && ac.n > 0 && ac.inVp, ac);
    await b.evaluate(`document.getElementById('gd-st').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`);
    for (let i = 0; i < 25; i++) { await sleep(400); if (await b.evaluate(`!/불러오는/.test(document.querySelector('#guide-card .gd-ans').textContent)`)) break; }
    const ans = await b.evaluate(`(() => { const a = document.querySelector('#guide-card .gd-ans'); const c = document.getElementById('guide-card').getBoundingClientRect();
      return { t: a && a.textContent, inVp: c.top >= 0 && c.bottom <= innerHeight }; })()`);
    R.check(`${w}px 고르면 '지금 N분 → 개통 후 M분 · 추정값' 답이 화면 안에`, /지금 \d+분 → 개통 후 \d+분/.test(ans.t || '') && /추정값/.test(ans.t || '') && ans.inVp, ans);
    if (mobile) {
      await b.evaluate(`document.querySelector('#guide-card .gd-more').click()`); await sleep(1800);
      const d = await b.evaluate(`({ card: !!document.getElementById('guide-card'), seen: localStorage.getItem('krrail-guide-seen'),
        sd: !!document.querySelector('.sd-tab') && /청량리/.test((document.getElementById("sd-panel") || document.body).textContent) })`);
      R.check(`${w}px '자세히 보기' → 카드 닫힘·기억·청량리 역 상세 열림`, !d.card && d.seen === '1' && d.sd, d);
      await b.goto('about:blank', 200); await b.goto(BASE + '#normal', 800); await ready(b);
      R.check(`${w}px 다시 열면 카드가 안 뜬다`, (await card(b)) === null);
      b.close(); await sleep(800); continue;
    }
    await b.evaluate(`(() => { const i = document.getElementById('gd-st'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await b.evaluate(`[...document.querySelectorAll('#guide-card .gd-item')].find(e => e.textContent.includes('통근권')).click()`); await sleep(1200);
    const after = await b.evaluate(`({ card: !!document.getElementById('guide-card'), cm: !!document.getElementById('cm-panel') && document.getElementById('cm-panel').style.display !== 'none' })`);
    R.check(`${w}px '통근권 찾기' → 카드 닫힘·통근권 열림`, !after.card && after.cm, after);
    // 11-15: 같은 주소(#normal)로 goto 하면 크롬이 다시 안 읽어 이 검사가 그냥 통과했다 → 빈 쪽을 거쳐 정말 다시 연다
    await b.goto('about:blank', 200); await b.goto(BASE + '#normal', 800); await ready(b);
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
