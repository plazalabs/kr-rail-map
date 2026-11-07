/* e2e: 패널 가림·버튼 상태·메모 핀 (IMPL9 건 6)
 *  - 영향권을 켠 상태에서 메뉴(분석 > 노선 영향권)로 끌 수 있다 — 데스크톱·모바일
 *  - 노선도를 막대 '닫기' · Esc · 카드 '출발' 로 닫으면 툴바 '노선도' 버튼도 꺼진다
 *  - 메모 핀이 테마·배경 전환 뒤에도 남는다
 * 실행: node tests/e2e/run.js --only panel-state
 */
'use strict';
process.env.PROMPT_TEXT = process.env.PROMPT_TEXT || '점검 메모';   // 메모 입력창(prompt)에 넣을 글
const { launch, sleep, BASE, recorder } = require('./lib/cdp');
const R = recorder('panel-state');

async function ready(b) {
  for (let i = 0; i < 120; i++) { await sleep(400); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&map.loaded()&&!!map.getLayer('rail-lines')`).catch(() => false)) break; }
  await sleep(600);
}
function mk(b) {
  const info = sel => b.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return { exists: false };
    if (e.scrollIntoView) e.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = e.getBoundingClientRect(); const cx = r.x + r.width/2, cy = r.y + r.height/2; const t = document.elementFromPoint(cx, cy);
    return { exists: true, visible: r.width > 0 && r.height > 0, cx, cy, onTop: !!t && (t === e || e.contains(t)), top: t ? (t.id || String(t.className) || t.tagName) : null }; })()`);
  const press = async sel => {
    const i = await info(sel);
    if (!i.exists) return { ok: false, why: '요소 없음' };
    if (!i.visible) return { ok: false, why: '보이지 않음' };
    if (!i.onTop) return { ok: false, why: '가려짐(' + String(i.top).slice(0, 40) + ')' };
    await b.click(i.cx, i.cy); await sleep(350); return { ok: true };
  };
  const menu = async (label, id) => {
    // 툴바의 직계 자식 중 몇 번째인가 (nth-child)
    const dd = await b.evaluate(`[...document.getElementById('toolbar').children].findIndex(x => x.classList.contains('tb-dropdown') && x.querySelector('.tb-dropbtn').textContent.trim().startsWith('${label}'))`);
    const o = await press(`#toolbar > :nth-child(${dd + 1}) .tb-dropbtn`);
    if (!o.ok) return { ok: false, why: label + ' 버튼 ' + o.why };
    await sleep(250);
    const r = await press('#' + id); return r.ok ? r : { ok: false, why: id + ' ' + r.why };
  };
  return { info, press, menu };
}

async function coverageCase(tag, opts) {
  const b = await launch(opts);
  await b.send('Network.setBypassServiceWorker', { bypass: true });
  await b.goto(BASE + '#normal', 800); await ready(b);
  const { menu } = mk(b);
  const st = () => b.evaluate(`({ btn: document.getElementById('coverage-btn').classList.contains('active'), on: CoverageMap.isActive() })`);
  const on = await menu('분석', 'coverage-btn'); await sleep(1000); const s1 = await st();
  const off = await menu('분석', 'coverage-btn'); await sleep(800); const s2 = await st();
  R.check(`${tag}: 영향권 켜기 (메뉴)`, on.ok && s1.on && s1.btn, { on, s1 });
  R.check(`${tag}: 켠 상태에서 메뉴로 끄기`, off.ok && !s2.on && !s2.btn, { off, s2 });
  b.close(); await sleep(800);
}

(async () => {
  // ── 영향권: 데스크톱·모바일
  await coverageCase('데스크톱', { port: 9711, w: 1440, h: 1000 });
  await coverageCase('모바일 390', { port: 9712, w: 390, h: 844, mobile: true });

  // ── 노선도 버튼 상태 + 메모 핀 (데스크톱)
  const b = await launch({ port: 9713, w: 1440, h: 1000 });
  await b.send('Network.setBypassServiceWorker', { bypass: true });
  await b.goto(BASE, 600); await b.evaluate(`localStorage.removeItem('kr-rail-map-memos-v1'); localStorage.setItem('krrail-theme','light'); 0`);
  await b.goto('about:blank', 200); await b.goto(BASE + '#normal', 800); await ready(b);
  const { press, menu } = mk(b);
  const dg = () => b.evaluate(`({ btn: document.getElementById('diagram-btn').classList.contains('active'), open: !!document.getElementById('diagram-overlay') })`);
  for (const how of ['막대 닫기', 'Esc', "카드 '출발'"]) {
    const p1 = await press('#diagram-btn'); await sleep(2500);
    const s0 = await dg();
    if (how === '막대 닫기') await press('#dg-close');
    else if (how === 'Esc') await b.key('Escape', 'Escape', 27);
    else {
      const t = await b.evaluate(`(() => { const g = [...document.querySelectorAll('#diagram-overlay .dg-station')].find(x => x.dataset.name === '홍대입구'); const sc = document.querySelector('#diagram-overlay .dg-scroll'); const sr = sc.getBoundingClientRect(); let r = g.getBoundingClientRect();
        sc.scrollLeft += (r.x + r.width/2) - (sr.x + sr.width/2); sc.scrollTop += (r.y + r.height/2) - (sr.y + sr.height/2); r = g.getBoundingClientRect(); return [r.x + r.width/2, r.y + r.height/2]; })()`);
      await sleep(300); await b.click(t[0], t[1]); await sleep(600);
      await press('#diagram-overlay [data-act=from]');
      await b.evaluate(`document.getElementById('route-panel').hidden = true; 0`);
    }
    await sleep(600);
    const s1 = await dg();
    R.check(`노선도 ${how} → 노선도 닫힘·툴바 버튼 꺼짐`, p1.ok && s0.open && s0.btn && !s1.open && !s1.btn, { s0, s1 });
  }
  const p2 = await press('#diagram-btn'); await sleep(2000); const s2 = await dg();
  R.check('닫은 뒤 다시 누르면 노선도 열림·버튼 켜짐', p2.ok && s2.open && s2.btn, s2);
  await press('#dg-close'); await sleep(500);

  // ── 메모 핀
  await b.evaluate(`map.jumpTo({ center: [126.9780, 37.5665], zoom: 14 }); 0`); await sleep(1500);
  const m1 = await menu('도구', 'memo-btn'); await sleep(300);
  const cv = await b.evaluate(`(() => { const r = map.getCanvas().getBoundingClientRect(); return [r.x + r.width * 0.55, r.y + r.height * 0.45]; })()`);
  await b.click(cv[0], cv[1]); await sleep(1000);
  const pins = () => b.evaluate(`({ data: map.getSource('memos') && map.getSource('memos')._data ? (map.getSource('memos')._data.features || []).length : null, layer: !!map.getLayer('memo-pins'),
    shown: map.getLayer('memo-pins') ? map.queryRenderedFeatures({ layers: ['memo-pins'] }).length : 0, saved: JSON.parse(localStorage.getItem('kr-rail-map-memos-v1') || '[]').length })`);
  await b.key('Escape', 'Escape', 27); await sleep(300);
  // 핀이 그려질 때까지(타일 생성은 비동기) 최대 4초
  let q0; for (let i = 0; i < 16; i++) { q0 = await pins(); if (q0.shown > 0) break; await sleep(250); }
  R.check('메모 핀 1개 찍기 (도구 > 메모 핀, 실클릭)', m1.ok && q0.saved === 1 && q0.shown > 0, q0);
  for (const [kind, t] of [['theme', 'dark'], ['style', 'satellite'], ['style', 'normal'], ['theme', 'light']]) {
    const sel = kind === 'theme' ? `#theme-row .theme-btn[data-theme=${t}]` : `#toolbar [data-style=${t}]`;
    const p = await press(sel);
    let q; for (let i = 0; i < 32; i++) { await sleep(250); q = await pins(); if (q.layer && q.shown > 0) break; }
    R.check(`메모 핀이 ${t} 전환 뒤에도 보임`, p.ok && q.layer && q.data === 1 && q.shown > 0, q);
  }
  const exc = b.logs.filter(l => /EXC/.test(l));
  R.check('예외 0', exc.length === 0, exc.slice(0, 3));
  b.close();
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
