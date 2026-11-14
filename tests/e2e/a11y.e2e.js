/* e2e: axe 접근성 자동 검사 (WCAG 2.1 A/AA, axe-core 4.10.2 — tests/e2e/vendor/axe.min.js, MPL-2.0) — 2026-11-15
 *  처음 돌렸을 때 위반: 길찾기 번호 칩 대비·타일맵 grid 구조 32곳·순위표 노선 칩 대비 86곳·차트 role=img 안 링크·
 *  노선 페이지 회색 글자 23곳·다크 길찾기 탭(흰 글자 on 밝은 파랑)·다크 순위표 점선 칩 → 모두 0 으로 고친 뒤 회귀 막기
 * 실행: node tests/e2e/run.js --only a11y
 */
'use strict';
const fs = require('fs'), path = require('path');
const { launch, sleep, BASE, recorder } = require('./lib/cdp');
const R = recorder('a11y');
const AXE = fs.readFileSync(path.join(__dirname, 'vendor', 'axe.min.js'), 'utf8');
const root = BASE.replace(/#.*$/, '').replace(/[^/]*$/, '');
const STATES = [
  ['첫 화면 PC', 'index.html#normal', 1440, 900],
  ['길찾기 결과 PC', 'index.html?from=광화문&to=강남#normal', 1440, 900, 2500],
  ['다크 길찾기 결과 PC', 'index.html?from=광화문&to=강남#normal', 1440, 900, 2500, { dark: true }],
  ['타일맵', 'index.html?market=1#normal', 1440, 900, 2500],
  ['휴대폰 떡상', 'index.html?rocket=1#normal', 390, 844, 2500, { mobile: true }],
  ['순위표', 'rank.html', 1280, 900],
  ['다크 순위표', 'rank.html', 1280, 900, 1200, { dark: true }],
  ['노선 페이지', 'line/gtx-c.html', 1280, 900],
  ['다크 게시판 페이지', 'board.html', 1280, 900, 1200, { dark: true }],
  ['다크 역 상세', 'index.html#normal', 1440, 900, 1500, { dark: true, act: `StationDetail.show(STATIONS.find(s => s.properties.name_ko === '광화문'))` }],
];
(async () => {
  for (const [nm, url, w, h, wait, o = {}] of STATES) {
    const b = await launch({ port: 9799, w, h, mobile: !!o.mobile });
    await b.send('Network.setBypassServiceWorker', { bypass: true });
    if (o.dark) { await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] }); await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('krrail-theme', 'dark'); } catch (e) {}` }); }
    await b.goto(root + url, 800);
    for (let i = 0; i < 80; i++) { await sleep(250); if (await b.evaluate(`document.readyState === 'complete' && (typeof dataReady === 'undefined' || dataReady)`).catch(() => false)) break; }
    if (o.act) await b.evaluate(o.act + '; 0').catch(() => null);
    await sleep(wait || 1200);
    await b.evaluate(AXE + ';0');
    const v = await b.evaluate(`axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, resultTypes: ['violations'] })
      .then(r => r.violations.map(v => v.id + 'x' + v.nodes.length + ' ' + v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | ')))`);
    R.check(`${nm}: axe WCAG 2.1 AA 위반 0`, v.length === 0, v);
    b.close(); await sleep(600);
  }
  // 휴대폰 닫힌 서랍: 화면 밖 단추 81개가 키보드·낭독기에 잡히던 것 (11-15) → 닫힘 = visibility:hidden, 열면 보임
  {
    const b = await launch({ port: 9799, w: 360, h: 740, mobile: true });
    await b.send('Network.setBypassServiceWorker', { bypass: true });
    await b.goto(root + 'index.html#normal', 800);
    for (let i = 0; i < 80; i++) { await sleep(250); if (await b.evaluate(`typeof dataReady !== 'undefined' && dataReady`).catch(() => false)) break; }
    await sleep(1200);
    const closed = await b.evaluate(`getComputedStyle(document.getElementById('sidebar')).visibility`);
    await b.evaluate(`document.getElementById('sidebar-toggle').click(); 0`);
    // 미끄러져 들어오는 동안(.24s)은 검색칸이 아직 화면 밖 — 다른 시험과 이어 돌면 프레임이 늦어 0.5초로 모자랐다(11-15) → 3초까지 기다림
    let open;
    for (let i = 0; i < 30; i++) { await sleep(100); open = await b.evaluate(`({ v: getComputedStyle(document.getElementById('sidebar')).visibility, s: (() => { const r = document.getElementById('search').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })() })`); if (open.v === 'visible' && open.s) break; }
    await b.evaluate(`document.getElementById('sidebar-close').click(); 0`); await sleep(1000);
    const again = await b.evaluate(`getComputedStyle(document.getElementById('sidebar')).visibility + '/' + document.body.className + '/' + getComputedStyle(document.getElementById('sidebar')).transform`);
    R.check('휴대폰 서랍: 닫힘 hidden → 열면 visible·검색칸 화면 안 → 다시 닫으면 hidden', closed === 'hidden' && open.v === 'visible' && open.s && /^hidden/.test(again), { closed, open, again });
    b.close();
  }
  // 키보드 초점 테: PC 첫 화면에서 Tab 으로 도는 모든 칸에 초점 표시가 보여야 한다 (11-15: 배경 지도 단추 3개는 box-shadow:none !important 에 테가 지워져 안 보였다)
  {
    const b = await launch({ port: 9798, w: 1440, h: 900 });
    await b.send('Network.setBypassServiceWorker', { bypass: true });
    await b.goto(root + 'index.html#normal', 800);
    for (let i = 0; i < 80; i++) { await sleep(250); if (await b.evaluate(`typeof dataReady !== 'undefined' && dataReady`).catch(() => false)) break; }
    await sleep(1500);
    const seen = new Set(), bad = []; let rep = 0;
    for (let i = 0; i < 300 && rep < 4; i++) {
      await b.key('Tab', 'Tab', 9); await sleep(40);
      const r = await b.evaluate(`(() => { const e = document.activeElement; if (!e || e === document.body) return null;
        if (!e.__fk) e.__fk = (window.__fkN = (window.__fkN || 0) + 1);
        const cs = getComputedStyle(e);
        const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none');
        return { k: e.__fk, ring, id: (e.id || e.getAttribute('aria-label') || e.textContent || e.tagName).trim().slice(0, 24) }; })()`);
      if (!r) continue;
      if (seen.has(r.k)) { rep++; continue; }
      seen.add(r.k); if (!r.ring) bad.push(r.id);
    }
    R.check('PC 첫 화면 Tab 으로 도는 칸 모두 초점 테 보임 (' + seen.size + '칸)', seen.size > 60 && bad.length === 0, bad.join(', ') || seen.size);
    b.close(); await sleep(400);
  }
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
