/* e2e: 지도 ↔ 노선도 같은 역 (J10, 2026-11-14 UX 종합 리뷰)
 *  A. 역 상세 '노선도에서 보기' 실클릭 → 노선도 열림, 그 역 강조 고리·가운데(화면 안)·역 카드
 *  B. 묶음의 대표 역이 아닌 역 ID(동명 환승역의 다른 노선 역)로도 찾는다
 *  C. 노선도 카드 '지도에서 보기' 실클릭 → 노선도 닫힘, 지도에서 같은 역 상세
 *  D. 그 역의 노선을 꺼서 노선도에 없으면 false + 안내 (빈 화면으로 두지 않음)
 *  E. 휴대폰 390×844 에서도 A
 * 실행: node tests/e2e/run.js --only diagram-sync
 */
'use strict';
const { launch, sleep, BASE, recorder } = require('./lib/cdp');
const R = recorder('diagram-sync');

async function ready(b) {
  for (let i = 0; i < 120; i++) { await sleep(400); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&map.loaded()&&!!map.getLayer('rail-lines')`).catch(() => false)) break; }
  await sleep(600);
}
async function waitFor(b, expr, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await b.evaluate(expr).catch(() => false)) return Date.now() - t0; await sleep(200); }
  return null;
}
async function press(b, sel) {
  const i = await b.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({block:'center', inline:'nearest'});
    const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width/2, r.y + r.height/2);
    return { x: r.x + r.width/2, y: r.y + r.height/2, on: !!t && (t === e || e.contains(t)), top: t && (t.id || String(t.className) || t.tagName) }; })()`);
  if (!i) return { ok: false, why: '요소 없음' };
  if (!i.on) return { ok: false, why: '가려짐(' + i.top + ')' };
  await b.click(i.x, i.y);
  await sleep(400);
  return { ok: true };
}
// 시청: 1·2호선 환승역 — 이름이 같은 역이 노선마다 따로 있다
const PICK = `(() => { const l = STATIONS.filter(s => s.properties.name_ko === '시청' && s.geometry.coordinates[1] > 37.5);
  l.sort((a, b) => (b.properties.lines || []).length - (a.properties.lines || []).length); return l.map(s => s.properties.id); })()`;
const SEL = `(() => { const svg = document.querySelector('#diagram-overlay .dg-canvas svg'); const sc = document.querySelector('#diagram-overlay .dg-scroll');
  const g = svg && svg.querySelector('.dg-sel'); const ring = svg && svg.querySelector('.dg-sel-ring');
  if (!g || !ring || !sc) return { active: DiagramMode.isActive(), g: !!g, ring: !!ring };
  const rr = ring.getBoundingClientRect(), sr = sc.getBoundingClientRect(); const card = document.querySelector('#diagram-overlay .dg-card');
  return { active: DiagramMode.isActive(), name: g.dataset.name, sids: g.dataset.sids, ring: true,
    inView: rr.left >= sr.left && rr.right <= sr.right && rr.top >= sr.top && rr.bottom <= sr.bottom,
    nearCenter: Math.abs((rr.left + rr.right) / 2 - (sr.left + sr.right) / 2) < sr.width * 0.3 && Math.abs((rr.top + rr.bottom) / 2 - (sr.top + sr.bottom) / 2) < sr.height * 0.3,
    card: card ? card.textContent.replace(/\\s+/g, ' ').slice(0, 80) : null }; })()`;

async function runA(b, tag) {
  const ids = await b.evaluate(PICK);
  await b.evaluate(`(() => { const s = STATIONS.find(x => x.properties.id === ${JSON.stringify(ids[0])}); showStation(s); return 0; })()`);
  await waitFor(b, `!!document.querySelector('#sd-panel .sd-dg')`, 5000);
  await sleep(900);   // 역 상세가 미끄러져 들어오는 동안은 화면 밖
  const p = await press(b, '#sd-panel .sd-dg');
  await waitFor(b, `!!document.querySelector('#diagram-overlay .dg-sel-ring') && !!document.querySelector('#diagram-overlay .dg-card')`, 8000);
  await sleep(300);
  const s = await b.evaluate(SEL);
  R.check(`${tag}A1 역 상세 '노선도에서 보기' → 노선도 열림·시청 강조 고리`, p.ok && s.active && s.name === '시청' && s.ring, JSON.stringify({ p, s }));
  R.check(`${tag}A2 고른 역이 화면 가운데쯤·화면 안`, s.inView && s.nearCenter, JSON.stringify(s));
  R.check(`${tag}A3 역 카드 열림(출발·도착·지도에서 보기)`, !!s.card && s.card.includes('지도에서 보기'), s.card);
  return ids;
}

(async () => {
  let b = await launch({ port: 9891, w: 1440, h: 900 });
  try {
    await b.goto(BASE, 500); await ready(b);
    const ids = await runA(b, '');

    // B. 다른 노선의 같은 이름 역 ID 로
    if (ids.length > 1) {
      const ok = await b.evaluate(`DiagramMode.focusStation(${JSON.stringify(ids[ids.length - 1])})`);
      await sleep(500);
      const s = await b.evaluate(SEL);
      R.check('B1 대표가 아닌 역 ID 로도 같은 묶음 찾음', ok === true && s.name === '시청' && (s.sids || '').includes(ids[ids.length - 1]), JSON.stringify({ ok, s, ids }));
    } else R.check('B1 (시청 역 하나뿐 — 묶음 검사 생략)', true);

    // C. 노선도 카드 → 지도
    await waitFor(b, `!!document.querySelector('#diagram-overlay .dg-card')`, 3000);
    const pc = await press(b, '#diagram-overlay .dg-card button[data-act="info"]');
    await waitFor(b, `!DiagramMode.isActive() && document.getElementById('sd-panel') && document.getElementById('sd-panel').classList.contains('sd-open')`, 5000);
    await sleep(900);
    const C = await b.evaluate(`(() => { const p = document.getElementById('sd-panel'); const c = map.getCenter();
      const s = STATIONS.find(x => x.properties.name_ko === '시청' && x.geometry.coordinates[1] > 37.5);
      return { active: DiagramMode.isActive(), open: p && p.classList.contains('sd-open'), title: p && (p.querySelector('b') || {}).textContent,
        dist: Math.hypot(c.lng - s.geometry.coordinates[0], c.lat - s.geometry.coordinates[1]) }; })()`);
    R.check("C1 카드 '지도에서 보기' → 노선도 닫힘·지도에 같은 역 상세", pc.ok && !C.active && C.open && C.title === '시청' && C.dist < 0.02, JSON.stringify({ pc, C }));

    // D. 노선 꺼서 노선도에 없는 역
    const D = await b.evaluate(`(() => { const s = STATIONS.find(x => x.properties.name_ko === '시청' && x.geometry.coordinates[1] > 37.5);
      (s.properties.lines || []).forEach(l => visibleLines.delete(l)); updateFilters();
      return { sid: s.properties.id }; })()`);
    const okD = await b.evaluate(`DiagramMode.focusStation(${JSON.stringify(D.sid)})`);
    // 노선도는 다음 프레임에 그린다 — 다 그려질 때까지(안내 줄이 '계산 중…'이 아니게) 기다린다
    await waitFor(b, `(() => { const h = document.querySelector('#diagram-overlay .dg-hint'); return !!h && !/계산 중/.test(h.textContent); })()`, 8000);
    await sleep(300);
    const okD2 = await b.evaluate(`DiagramMode.focusStation(${JSON.stringify(D.sid)})`);
    const st = await b.evaluate(`document.getElementById('status').textContent`);
    R.check('D1 노선 꺼진 역 → 찾지 못함 + 안내(노선 켜기)', okD2 === false && /노선 목록에서 그 노선을 켜/.test(st), JSON.stringify({ okD, okD2, st }));
    await b.evaluate(`DiagramMode.exit(); 0`);
    const exc = b.logs.filter(x => /EXC/.test(x));
    R.check('예외 0 (PC)', exc.length === 0, exc.slice(0, 3));
    b.close(); b = null;

    // E. 휴대폰
    b = await launch({ port: 9892, w: 390, h: 844, mobile: true });
    await b.goto(BASE, 500); await ready(b);
    await runA(b, 'E·휴대폰 ');
    const exc2 = b.logs.filter(x => /EXC/.test(x));
    R.check('예외 0 (휴대폰)', exc2.length === 0, exc2.slice(0, 3));
  } catch (e) {
    R.check('실행 오류', false, String(e && e.stack || e).slice(0, 300));
  } finally {
    R.finish();
    if (b) b.close();
    setTimeout(() => process.exit(process.exitCode || 0), 1500);
  }
})();
