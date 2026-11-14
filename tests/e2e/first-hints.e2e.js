/* e2e: 처음 쓰는 사람 안내 (2026-11-11 사용성 점검 B)
 *  A. 노선도: 아래 안내 줄('역을 누르면…')이 데스크톱·휴대폰 모두 화면 안에 보인다 (휴대폰은 색 범례만 숨김)
 *  B. 노선도 카드 '지도에서 보기'(옛 '역 정보', J10) 실클릭 → 노선도가 닫히고 그 역의 역 상세가 열린다
 *  C. 투자 모드를 툴바로 처음 켜면 안내가 한 번 뜬다 — 화면 안, 툴바를 가리지 않음, '알겠어요'로 닫힘
 *  D. 껐다 다시 켜면 안내가 다시 안 뜬다
 *  E. 공유 링크 ?mode=invest 로 들어오면 안내가 안 뜬다
 * 실행: node tests/e2e/run.js --only first-hints
 */
'use strict';
const { launch, sleep, BASE, recorder, outDir, ensureToolbar } = require('./lib/cdp');
const path = require('path');
const R = recorder('first-hints');
const OUT = outDir('first-hints');

async function ready(b) {
  for (let i = 0; i < 120; i++) { await sleep(400); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&map.loaded()&&!!map.getLayer('rail-lines')`).catch(() => false)) break; }
  await sleep(800);
}
// 누르기 전에 그 지점 맨 위 요소가 대상인지 확인 (README 판정 규칙)
async function press(b, sel) {
  await ensureToolbar(b, sel);   // 980px 이하: 툴바는 더보기 시트 안 (작업 1)
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
    R.check(`${tag} A. 노선도 아래 '역을 누르면…' 안내 줄이 화면 안에 보인다`, o.ok && !!tip && tip.shown && tip.inVp && /지도에서 볼/.test(tip.text), { o, tip });
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
    await b.evaluate(`document.querySelector('#sd-panel') && document.querySelector('#sd-panel').classList.remove('sd-open'); 0`);
    // 역 상세가 미끄러져 닫히는 동안은 닫기 버튼이 툴바 위에 남는다 — 비켜날 때까지 기다린다(최대 4초)
    let m1 = { ok: false };
    for (let i = 0; i < 8 && !m1.ok; i++) { await sleep(500); m1 = await press(b, '#mode-btn'); }
    await sleep(800);
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

  // F. 통근권 결과 0역 안내 — 개통 전 역(동명초교, 동북선)은 '개통 예정 노선 포함' 버튼, 송학은 길찾기 안내
  {
    const f = await launch({ port: 9803, w: 1440, h: 900 });
    await f.send('Network.setBypassServiceWorker', { bypass: true });
    await f.goto(BASE + '#normal', 800); await ready(f);
    await f.evaluate(`CommuteMap.show('st-dongbuk-1'); true`); await sleep(800);
    const e1 = await f.evaluate(`({ empty: !!document.querySelector('#cm-list .cm-empty'), btn: !!document.querySelector('#cm-list [data-unopened]'), text: (document.querySelector('#cm-list .cm-empty') || {}).textContent || '' })`);
    R.check("F. 개통 전 역: 0역 안내 + '개통 예정 노선 포함' 버튼", e1.empty && e1.btn && /개통 예정/.test(e1.text), e1);
    const pb = await press(f, '#cm-list [data-unopened]'); await sleep(800);
    const e2 = await f.evaluate(`({ n: document.querySelectorAll('#cm-list button[data-id]').length, total: +((document.getElementById('cm-summary').textContent.match(/안: ([0-9]+)역/) || [])[1]), checked: document.getElementById('cm-unopened').checked, empty: !!document.querySelector('#cm-list .cm-empty') })`);
    R.check('F. 버튼 누르면 체크가 켜지고, 안내에 적힌 수만큼 역이 나온다', pb.ok && e2.checked && e2.n > 0 && !e2.empty && (+((e1.text.match(/(\d+)역이 나와요/) || [])[1]) === e2.total), { pb, e2 });
    await f.evaluate(`CommuteMap.show('st-7983457102'); true`); await sleep(800);
    const e3 = await f.evaluate(`({ empty: !!document.querySelector('#cm-list .cm-empty'), btns: document.querySelectorAll('#cm-list .cm-empty button').length, text: (document.querySelector('#cm-list .cm-empty') || {}).textContent || '' })`);
    R.check('F. 어디로도 안 이어지는 역(송학): 길찾기 안내, 헛버튼 없음', e3.empty && e3.btns === 0 && /길찾기/.test(e3.text), e3);
    f.close(); await sleep(800);
  }

  // G. 길찾기 결과의 역 이름을 누르면 그 역의 역 정보 (데스크톱·휴대폰)
  for (const [w, h, mobile] of [[1440, 900, false], [390, 844, true]]) {
    const g = await launch({ port: 9804, w, h, mobile });
    await g.send('Network.setBypassServiceWorker', { bypass: true });
    await g.goto(BASE + '#normal', 800); await ready(g);
    await g.evaluate(`(() => { const f = STATIONS.find(s => s.properties.name_ko === '홍대입구' && s.properties.lines.includes('seoul-subway-line-2'));
      const t = STATIONS.find(s => s.properties.name_ko === '강남' && s.properties.lines.includes('seoul-subway-line-2'));
      routeFromStation(f.properties.name_ko, 'from', f.properties.id); routeFromStation(t.properties.name_ko, 'to', t.properties.id); 0 })()`);
    await sleep(500);
    // 휴대폰은 출발·도착이 다 차면 바로 찾고 결과 창을 한 줄로 접는다(v153 route-peek) — 접혔으면 [자세히 ▲]로 편다
    const peek0 = await g.evaluate(`!!document.querySelector('#route-panel.rp-peek')`);
    const go = peek0 ? await press(g, '#route-panel .rp-peek-open') : await press(g, '#route-go'); await sleep(2500);
    if (await g.evaluate(`!!document.querySelector('#route-panel.rp-peek')`)) { await press(g, '#route-panel .rp-peek-open'); await sleep(600); }
    const links = await g.evaluate(`[...document.querySelectorAll('#route-result .rc-panel:not([hidden]) .leg > .rc-st')].map(b => b.textContent)`);
    R.check(`${w}px G. 길찾기 결과의 역 이름이 누를 수 있는 버튼`, go.ok && links.includes('홍대입구') && links.includes('강남'), { go, links });
    const tgt = await g.evaluate(`(() => { const bs = [...document.querySelectorAll('#route-result .rc-panel:not([hidden]) .leg > .rc-st')].filter(b => b.textContent === '강남'); const b = bs[bs.length - 1]; if (!b) return null; b.setAttribute('data-e2e', '1'); return b.dataset.sid; })()`);
    const p = tgt ? await press(g, '#route-result [data-e2e]') : { ok: false, why: '강남 버튼 없음' }; await sleep(1200);
    const st = await g.evaluate(`({ open: !!document.querySelector('#sd-panel.sd-open'), name: /강남/.test((document.querySelector('#sd-panel') || {}).innerText || ''),
      routeKept: !!document.querySelector('#route-result .rc-panel') })`);
    R.check(`${w}px G. 역 이름 누르면 그 역 정보가 열리고 길찾기 결과는 남는다`, p.ok && st.open && st.name && st.routeKept, { p, st, sid: tgt });
    const exc = g.logs.filter(l => /EXC/.test(l));
    R.check(`${w}px G. 예외 0`, exc.length === 0, exc.slice(0, 3));
    g.close(); await sleep(800);
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
