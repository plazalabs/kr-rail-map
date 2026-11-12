/* e2e: 툴바 드롭다운 3개·14개 항목이 모바일·태블릿·데스크톱에서 보이고 눌림 (버그 ②, IMPL2)
 * 출처: 2026-11-07 세션 점검 스크립트 impl2.js (실제 마우스·키 이벤트, 헤드리스 Chrome).
 * 실행: node tests/e2e/run.js --only toolbar-menus  (또는 E2E_BASE=<주소> node 이 파일)
 */
// IMPL2 재현·검증: 툴바 드롭다운 3개(도구·분석·저장)와 14개 항목이 화면에 뜨고 실제로 눌리는지
// cdp.js 재사용. 뷰포트: 390x844(모바일), 768x1024(태블릿, ≤980), 1440x1000(데스크톱)
// 항목마다 새로 로드 → 드롭다운 버튼 실클릭 → 항목 가시성·최상단 요소 판정 → 항목 실클릭 → 클릭 도달 여부
// 오류 제보는 외부 구글 폼을 여므로 window.open 만 가로채 기록한다 (테스트 하네스 한정)
const { launch, sleep, BASE, outDir, ensureToolbar } = require('./lib/cdp');
const fs = require('fs'), path = require('path');
const OUT = outDir('toolbar-menus');
const VPS = (process.env.VPS || 'm390,t768,d1440').split(',');
const VP = { m390: { w: 390, h: 844, mobile: true }, t768: { w: 768, h: 1024, mobile: true }, d1440: { w: 1440, h: 1000, mobile: false } };
const MENUS = [
  ['도구', ['draw-btn', 'measure-btn', 'radius-btn', 'memo-btn']],
  ['분석', ['compare-btn', 'stats-btn', 'timeline-btn', 'invest-btn', 'coverage-btn', 'commute-btn']],
  ['저장', ['diagram-save-btn', 'save-btn', 'share-btn', 'report-btn']],
];

async function ready(b) {
  for (let i = 0; i < 80; i++) { await sleep(400); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&map.loaded()`).catch(() => false)) break; }
  await sleep(600);
}
const ddSel = name => `[...document.querySelectorAll('#toolbar .tb-dropdown')].find(d => d.querySelector('.tb-dropbtn').textContent.trim() === '${name}')`;

(async () => {
  const out = { base: BASE, rows: [], toolbar: {} };
  let port = 9611;
  for (const vk of VPS) {
    const v = VP[vk];
    const b = await launch({ port: port++, w: v.w, h: v.h, mobile: v.mobile, invest: true });
    await b.send('Network.setBypassServiceWorker', { bypass: true });
    await b.send('Network.setCacheDisabled', { cacheDisabled: true });
    await b.send('Page.setDownloadBehavior', { behavior: 'deny' }).catch(() => {});
    // 툴바 자체 점검 (가로 스크롤·위치)
    await b.goto(BASE + '#normal', 800); await ready(b);
    out.toolbar[vk] = await b.evaluate(`(() => { const t = document.getElementById('toolbar'); const cs = getComputedStyle(t); const r = t.getBoundingClientRect();
      const sw = t.scrollWidth, cw = t.clientWidth; const s0 = t.scrollLeft; t.scrollLeft = 9999; const s1 = t.scrollLeft; t.scrollLeft = 0;
      return { rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], ox: cs.overflowX, oy: cs.overflowY, scrollW: sw, clientW: cw, scrollable: s1 > s0, scrolledTo: s1 }; })()`);
    console.log(vk, 'toolbar', JSON.stringify(out.toolbar[vk]));
    for (const [menu, items] of MENUS) {
      for (const id of items) {
        await b.goto('about:blank', 200);
        await b.goto(BASE + '#normal', 800); await ready(b);
        await b.evaluate(`window.__open = []; window.open = (u) => { __open.push(String(u)); return null; }; 0`);
        await ensureToolbar(b);   // 980px 이하: 더보기 시트 열기 (작업 1)
        // 드롭다운 버튼을 툴바 안에서 보이게 하고 실클릭
        const bc = await b.evaluate(`(() => { const d = ${ddSel(menu)}; const e = d.querySelector('.tb-dropbtn'); e.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width/2, r.y + r.height/2); return [r.x + r.width/2, r.y + r.height/2, t === e || e.contains(t)]; })()`);
        await b.click(bc[0], bc[1]); await sleep(300);
        const st = await b.evaluate(`(() => { const d = ${ddSel(menu)}; const m = d.querySelector('.tb-dropmenu'); const e = document.getElementById('${id}'); const mr = m.getBoundingClientRect(); const r = e.getBoundingClientRect();
          const cx = r.x + r.width/2, cy = r.y + r.height/2; const t = document.elementFromPoint(cx, cy);
          const inVp = r.width > 0 && r.height > 0 && r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
          const tb = document.getElementById('toolbar').getBoundingClientRect();
          return { open: d.classList.contains('open'), menuRect: [Math.round(mr.x), Math.round(mr.y), Math.round(mr.width), Math.round(mr.height)], itemRect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], inVp,
            top: t === e || (t && e.contains(t)), topEl: t ? (t.id || t.className || t.tagName) : null, overlapsToolbar: mr.bottom > tb.top + 1 && mr.top < tb.bottom - 1, cx, cy }; })()`);
        let hit = false, effect = null;
        if (st.open && st.inVp) {
          await b.evaluate(`window.__hit = 0; document.getElementById('${id}').addEventListener('click', () => { __hit++; }, { capture: true, once: true }); window.__st0 = (document.getElementById('status')||{}).textContent; 0`);
          await b.click(st.cx, st.cy); await sleep(900);
          const r = await b.evaluate(`({ hit: __hit, open: ${ddSel(menu)}.classList.contains('open'), status: (document.getElementById('status')||{}).textContent, stChanged: (document.getElementById('status')||{}).textContent !== __st0, winOpen: __open.slice(), active: document.getElementById('${id}').classList.contains('active') })`);
          hit = r.hit > 0; effect = r;
        }
        const pass = st.open && st.inVp && st.top && hit;
        out.rows.push({ vp: vk, menu, id, btnTop: bc[2], ...st, hit, effect, pass });
        console.log(pass ? 'PASS' : 'FAIL', vk, menu, id, 'btnTop=' + bc[2], 'open=' + st.open, 'inVp=' + st.inVp, 'top=' + st.top + '(' + st.topEl + ')', 'menu=' + JSON.stringify(st.menuRect), 'overlapTB=' + st.overlapsToolbar, 'hit=' + hit, effect ? 'status="' + String(effect.status).slice(0, 40) + '" win=' + effect.winOpen.length + ' closed=' + !effect.open : '');
      }
    }
    // 데스크톱/모바일 스크린샷: 세 메뉴 각각 열린 상태
    for (const [menu] of MENUS) {
      await b.goto('about:blank', 200); await b.goto(BASE + '#normal', 800); await ready(b);
      await ensureToolbar(b);
      const bc = await b.evaluate(`(() => { const e = ${ddSel(menu)}.querySelector('.tb-dropbtn'); e.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const r = e.getBoundingClientRect(); return [r.x + r.width/2, r.y + r.height/2]; })()`);
      await b.click(bc[0], bc[1]); await sleep(300);
      await b.shot(path.join(OUT, `${vk}-${menu}.png`));
    }
    out[vk + '_exc'] = b.logs.filter(l => /EXC|Failed|net::|ERR_/.test(l)).slice(0, 10);
    b.close(); await sleep(800);
  }
  const s = {}; for (const r of out.rows) { s[r.vp] = s[r.vp] || [0, 0]; s[r.vp][r.pass ? 0 : 1]++; }
  console.log('SUMMARY pass/fail by viewport', JSON.stringify(s));
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(out, null, 1));
  const fail = out.rows.filter(r => !r.pass).length;
  console.log(`E2E-SUMMARY toolbar-menus: pass ${out.rows.length - fail} fail ${fail} 미검증 0`);
  process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
