/* e2e: 처음 쓰는 사람 안내 (2026-11-11 사용성 점검 B)
 *  A. 노선도: 아래 안내 줄('역을 누르면…')이 데스크톱·휴대폰 모두 화면 안에 보인다 (휴대폰은 색 범례만 숨김)
 *  B. 노선도 카드 '역 정보' 실클릭 → 노선도가 닫히고 그 역의 역 상세가 열린다
 *  C. 투자 모드를 툴바로 처음 켜면 안내가 한 번 뜬다 — 화면 안, 툴바를 가리지 않음, '알겠어요'로 닫힘
 *  D. 껐다 다시 켜면 안내가 다시 안 뜬다
 *  E. 공유 링크 ?mode=invest 로 들어오면 안내가 안 뜬다
 * 실행: node tests/e2e/run.js --only first-hints
 */
'use strict';
const { launch, sleep, BASE, recorder, outDir } = require('./lib/cdp');
const path = require('path');
const R = recorder('first-hints');
const OUT = outDir('first-hints');

async function ready(b) {
  for (let i = 0; i < 120; i++) { await sleep(400); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&map.loaded()&&!!map.getLayer('rail-lines')`).catch(() => false)) break; }
  await sleep(800);
}
// 누르기 전에 그 지점 맨 위 요소가 대상인지 확인 (README 판정 규칙)
async function press(b, sel) {
  const i = await b.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({block:'center', inline:'nearest'});
    const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width/2, r.y + r.height/2);
    return { x: r.x + r.width/2, y: r.y + r.height/2, on: !!t && (t === e || e.contains(t)), top: t && (t.id || t.className || t.tagName) }; })()`);
  if (!i) return { ok: false, why: '요소 없음' };
  if (!i.on) return { ok: false, why: '가려짐(' + i.top + ')' };
  await b.click(i.x, i.y); await sleep(300);
  return { ok: true };
}
const TIP = `(() => { const e = document.getElementById('invest-tip'); if (!e) return null; const r = e.getBoundingClientRect();
  const tb = document.getElementById('toolbar').getBoundingClientRect();
  const overlapTb = !(r.right <= tb.left || r.left >= tb.right || r.bottom <= tb.top || r.top >= tb.bottom);
  return { inVp: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, overlapTb, text: e.innerText.slice(0, 40) }; })()`;

(async () => {
  for (const [w, h, mobile] of [[1440, 900, false], [390, 844, true]]) {
    const tag = w + 'px';
    const b = await launch({ port: 9801, w, h, mobile, tip: true });
    await b.send('Network.setBypassServiceWorker', { bypass: true });
    await b.goto(BASE + '#normal', 800); await ready(b);

    // A. 노선도 안내 줄
    const o = await press(b, '#diagram-btn'); await sleep(2500);
    const tip = await b.evaluate(`(() => { const e = document.querySelector('#diagram-overlay .dg-tip'); if (!e) return null; const r = e.getBoundingClientRect();
      return { shown: r.width > 0 && r.height > 0 && getComputedStyle(e).display !== 'none', inVp: r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1, text: e.textContent }; })()`);
    R.check(`${tag} A. 노선도 아래 '역을 누르면…' 안내 줄이 화면 안에 보인다`, o.ok && !!tip && tip.shown && tip.inVp && /역 정보/.test(tip.text), { o, tip });
    await b.shot(path.join(OUT, `diagram-${w}.png`)).catch(() => null);

    // B. 카드 '역 정보'
    const tgt = await b.evaluate(`(() => { const g = [...document.querySelectorAll('#diagram-overlay .dg-station')].find(g => g.dataset.name === '홍대입구'); if (!g) return null;
      const sc = document.querySelector('#diagram-overlay .dg-scroll'); const sr = sc.getBoundingClientRect(); let r = g.getBoundingClientRect();
      sc.scrollLeft += (r.x + r.width/2) - (sr.x + sr.width/2); sc.scrollTop += (r.y + r.height/2) - (sr.y + sr.height/2);
      r = g.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width/2, r.y + r.height/2);
      return { x: r.x + r.width/2, y: r.y + r.height/2, on: !!t && t.closest('.dg-station') === g }; })()`);
    if (!tgt || !tgt.on) R.check(`${tag} B. 노선도 '홍대입구' 노드 누르기`, null, tgt);
    else {
      await sleep(300); await b.click(tgt.x, tgt.y); await sleep(600);
      const p = await press(b, '#diagram-overlay [data-act=info]'); await sleep(1500);
      const st = await b.evaluate(`({ diagram: !!document.getElementById('diagram-overlay'), open: !!document.querySelector('#sd-panel.sd-open'),
        name: /홍대입구/.test((document.querySelector('#sd-panel') || {}).innerText || ''), dgBtn: document.getElementById('diagram-btn').classList.contains('active') })`);
      R.check(`${tag} B. 카드 '역 정보' → 노선도 닫힘·홍대입구 역 상세 열림`, p.ok && !st.diagram && st.open && st.name && !st.dgBtn, { p, st });
    }

    // C. 투자 모드 첫 안내
    await b.evaluate(`document.querySelector('#sd-panel') && document.querySelector('#sd-panel').classList.remove('sd-open'); 0`); await sleep(400);
    const m1 = await press(b, '#mode-btn'); await sleep(800);
    const t1 = await b.evaluate(TIP);
    R.check(`${tag} C. 투자 모드 처음 켜면 안내 — 화면 안·툴바 안 가림`, m1.ok && !!t1 && t1.inVp && !t1.overlapTb, { m1, t1 });
    await b.shot(path.join(OUT, `invest-tip-${w}.png`)).catch(() => null);
    const c = await press(b, '#invest-tip button'); await sleep(300);
    R.check(`${tag} C. '알겠어요'로 닫힘`, c.ok && (await b.evaluate(TIP)) === null, c);

    // D. 껐다 다시 켜기
    await press(b, '#mode-btn'); await sleep(500); await press(b, '#mode-btn'); await sleep(800);
    R.check(`${tag} D. 두 번째로 켜면 안내가 안 뜬다`, (await b.evaluate(`KR_MODE.isInvest()`)) && (await b.evaluate(TIP)) === null);
    const exc = b.logs.filter(l => /EXC/.test(l));
    R.check(`${tag} 예외 0`, exc.length === 0, exc.slice(0, 3));
    b.close(); await sleep(800);
  }

  // E. 공유 링크
  const e = await launch({ port: 9802, w: 1440, h: 900, tip: true });
  await e.send('Network.setBypassServiceWorker', { bypass: true });
  await e.goto(BASE.replace(/#.*$/, '').replace(/index\.html$/, 'index.html') + '?mode=invest#normal', 800); await ready(e);
  const ev = await e.evaluate(`({ invest: KR_MODE.isInvest(), tip: !!document.getElementById('invest-tip') })`);
  R.check('E. ?mode=invest 링크로 오면 투자 모드지만 안내는 안 뜬다', ev.invest && !ev.tip, ev);
  e.close();
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
