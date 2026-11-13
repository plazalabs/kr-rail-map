/* e2e: RAIL MARKET MAP — 역 타일 지도 (js/market-map.js, 2026-11-13)
 *  PC 1440×900
 *  - 분석 메뉴 'RAIL MARKET MAP' → 패널 열림, GTX-A 묶음이 맨 앞, 부제 '집값 예측 아님'
 *  - 타일이 판 밖으로 안 나가고 서로 안 겹침 (화면에서 직접 잼)
 *  - 광운대 타일 누르기 → 지도가 광운대로 가고 역 상세가 열림 + 카드에 지금→개통 후
 *  - 지도에서 다른 역(청량리)을 열면 그 타일이 골라짐 (양방향)
 *  - 색 '순위 변화' → 범례 바뀜, 연도 2027 → 타일 다시 그림
 *  - Esc 로 닫힘, 닫은 뒤 포커스가 연 단추로
 *  휴대폰 390×844
 *  - 아래 시트 + 탭 지도|타일|분석, 타일 누르면 '분석' 탭, '지도' 탭 → 시트 숨고 '타일로 돌아가기'
 * 실행: node tests/e2e/run.js --only market-map
 */
'use strict';
const { launch, sleep, BASE, recorder, clickStation, ensureToolbar } = require('./lib/cdp');
const R = recorder('market-map');

async function ready(b) {
  for (let i = 0; i < 120; i++) { await sleep(300); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&!!map.getSource('lines')&&typeof MarketMap!=='undefined'`).catch(() => false)) break; }
  await sleep(800);
}
async function until(b, expr, n = 40) {
  for (let i = 0; i < n; i++) { if (await b.evaluate(expr).catch(() => false)) return true; await sleep(250); }
  return false;
}

(async () => {
  // ── PC ──
  let b = await launch({ port: 9671, w: 1440, h: 900 });
  await b.goto(BASE + '#normal', 1500); await ready(b);
  const opened = await b.evaluate(`(() => { const btn = document.getElementById('market-btn'); if (!btn) return 'no-btn'; btn.click(); return 'ok'; })()`);
  const tilesUp = await until(b, `document.querySelectorAll('#mm-panel .mm-tile').length > 50`, 60); await sleep(500);
  const head = await b.evaluate(`(() => { const p = document.getElementById('mm-panel'); return { hidden: p.hidden, groups: [...p.querySelectorAll('.mm-gname')].map(g => g.textContent.split(' · ')[0]),
    def: (p.querySelector('.mm-def') || {}).textContent || '', n: p.querySelectorAll('.mm-tile').length }; })()`);
  R.check("분석 메뉴 'RAIL MARKET MAP' → 패널·타일", opened === 'ok' && tilesUp && !head.hidden, { opened, tilesUp, n: head.n });
  R.check('GTX-A 묶음이 맨 앞, GTX-B·C 도 있음', head.groups[0] === 'GTX-A' && ['GTX-B', 'GTX-C'].every(g => head.groups.includes(g)), head.groups.slice(0, 6));
  R.check("부제에 '집값이나 투자수익 예측이 아닙니다'", /집값이나 투자수익 예측이 아닙니다/.test(head.def), head.def);

  const geo = await b.evaluate(`(() => { const bd = document.querySelector('#mm-panel .mm-board').getBoundingClientRect();
    const ts = [...document.querySelectorAll('#mm-panel .mm-tile')].map(t => t.getBoundingClientRect());
    const out = ts.filter(r => r.left < bd.left - 1 || r.top < bd.top - 1 || r.right > bd.right + 1 || r.bottom > bd.bottom + 1).length;
    let ov = 0; for (let i = 0; i < ts.length && ov < 3; i++) for (let j = i + 1; j < ts.length; j++) { const a = ts[i], c = ts[j];
      const w = Math.min(a.right, c.right) - Math.max(a.left, c.left), h = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top); if (w > 1.5 && h > 1.5) { ov++; break; } }
    const p = document.getElementById('mm-panel').getBoundingClientRect();
    return { out, ov, panelInView: p.left >= 0 && p.right <= innerWidth && p.bottom <= innerHeight }; })()`);
  R.check('타일이 판 안에 있고 서로 안 겹침, 패널이 화면 안', geo.out === 0 && geo.ov === 0 && geo.panelInView, geo);

  // 타일 → 지도·상세
  const kw = await b.evaluate(`(() => { const s = STATIONS.find(f => f.properties.name_ko === '광운대'); const t = s && document.querySelector('#mm-panel .mm-tile[data-id="' + s.properties.id + '"]');
    if (!t) return null; t.click(); return s.properties.id; })()`);
  await sleep(1400);
  const afterTile = await b.evaluate(`(() => { const c = map.getCenter(); const s = STATIONS.find(f => f.properties.id === ${JSON.stringify(kw)});
    const d = s ? Math.hypot(c.lng - s.geometry.coordinates[0], c.lat - s.geometry.coordinates[1]) : 9;
    const sd = document.getElementById('sd-panel'); const card = document.querySelector('#mm-panel .mm-card').textContent;
    return { near: d < 0.02, sdOpen: !!sd && sd.classList.contains('sd-open'), sdName: sd ? /광운대/.test(sd.textContent) : false, card: /광운대/.test(card) && /→/.test(card),
      sel: !!document.querySelector('#mm-panel .mm-tile.sel[data-id=' + JSON.stringify(${JSON.stringify(kw)}) + ']') }; })()`);
  R.check('광운대 타일 → 지도가 광운대로 + 역 상세 열림 + 카드(지금→개통 후)', !!kw && afterTile.near && afterTile.sdOpen && afterTile.sdName && afterTile.card && afterTile.sel, afterTile);
  // 패널이 역 상세와 겹치지 않는다 (PC: 패널 왼쪽, 상세 오른쪽)
  const noOverlap = await b.evaluate(`(() => { const a = document.getElementById('mm-panel').getBoundingClientRect(), c = document.getElementById('sd-panel').getBoundingClientRect(); return a.right <= c.left + 1; })()`);
  R.check('PC: 타일 패널과 역 상세가 안 겹침', noOverlap);

  // 지도 → 타일 (양방향): 청량리를 역 상세로 열면 그 타일이 골라진다
  const cr = await b.evaluate(`(() => { const s = STATIONS.find(f => f.properties.name_ko === '청량리' && (f.properties.lines || []).some(l => /gtx-c/.test(l))); if (!s) return null;
    StationDetail.show(s); return s.properties.id; })()`);
  await sleep(500);
  const back = await b.evaluate(`(() => { const t = document.querySelector('#mm-panel .mm-tile.sel'); return { sel: t ? t.dataset.id : null, card: /청량리/.test(document.querySelector('#mm-panel .mm-card').textContent) }; })()`);
  R.check('지도·검색에서 청량리 열기 → 청량리 타일이 골라짐', !!cr && back.sel === cr && back.card, { cr, back });

  // 목록(순위) 보기: 빨라지는 분 큰 순(신규 먼저), 줄 누르면 역 상세 → 다시 타일로
  await b.evaluate(`(() => { const s = document.querySelector('#mm-panel [data-k="view"]'); s.value = 'list'; s.dispatchEvent(new Event('change')); })()`); await sleep(400);
  const lst = await b.evaluate(`(() => { const rows = [...document.querySelectorAll('#mm-panel .mm-row')]; const m = MarketMap.model();
    const g = id => { for (const G of m.groups) for (const t of G.tiles) if (t.row.id === id) return t.row.isNew ? 1e6 : (t.gain == null ? -1e6 : t.gain); return null; };
    const ks = rows.map(r => g(r.dataset.id)); const sorted = ks.every((k, i) => i === 0 || ks[i - 1] >= k);
    return { n: rows.length, total: m.total, sorted, first: rows[0] ? rows[0].textContent.slice(0, 40) : null }; })()`);
  R.check('목록 보기: 타일과 같은 역 수, 빨라지는 분 큰 순', lst.n === lst.total && lst.n > 50 && lst.sorted, lst);
  await b.evaluate(`(() => { const r = [...document.querySelectorAll('#mm-panel .mm-row')][3]; r.click(); })()`); await sleep(900);
  const lsd = await b.evaluate(`({ sd: document.getElementById('sd-panel').classList.contains('sd-open'), sel: !!document.querySelector('#mm-panel .mm-row.sel') })`);
  R.check('목록 줄 누르면 역 상세 열림 + 그 줄 골라짐', lsd.sd && lsd.sel, lsd);
  await b.evaluate(`(() => { const s = document.querySelector('#mm-panel [data-k="view"]'); s.value = 'tiles'; s.dispatchEvent(new Event('change')); })()`); await sleep(400);
  // 색·연도
  await b.evaluate(`(() => { const s = document.querySelector('#mm-panel [data-k="color"]'); s.value = 'tier'; s.dispatchEvent(new Event('change')); })()`);
  await sleep(300);
  const leg = await b.evaluate(`document.querySelector('#mm-panel .mm-legend').textContent`);
  R.check("색 '순위 변화' → 범례에 떡상·상대 하락", /떡상/.test(leg) && /상대 하락/.test(leg), leg.slice(0, 120));
  const before = await b.evaluate(`[...document.querySelectorAll('#mm-panel .mm-tile')].map(t => t.style.backgroundColor).join('|')`);
  await b.evaluate(`(() => { const y = document.querySelector('#mm-panel .mm-years button[data-y="2027"]'); if (y) y.click(); })()`);
  await sleep(400);
  const after = await b.evaluate(`({ c: [...document.querySelectorAll('#mm-panel .mm-tile')].map(t => t.style.backgroundColor).join('|'), pressed: (document.querySelector('#mm-panel .mm-years button[aria-pressed="true"]') || { getAttribute: () => null }).getAttribute('data-y') })`);
  R.check('연도 2027 → 타일 색이 바뀜(그해까지 개통 가정)', after.c !== before && after.pressed === '2027', after.pressed);

  // Esc 닫기
  await b.evaluate(`document.querySelector('#mm-panel .mm-tile[tabindex="0"]') && document.querySelector('#mm-panel .mm-tile[tabindex="0"]').focus(); 0`);
  await b.key('Escape', 'Escape', 27); await sleep(300);
  const closed = await b.evaluate(`document.getElementById('mm-panel').hidden`);
  R.check('Esc → 패널 닫힘', closed === true);
  // 역 상세 → '타일 지도에서 보기' (홍대입구 2호선: 새 노선 역이 아니라 기본 보기에 없음 → 전체로 넓혀 고름)
  await b.evaluate(`(() => { const s = STATIONS.find(f => f.properties.name_ko === '홍대입구' && f.properties.lines.includes('seoul-subway-line-2')); StationDetail.show(s); })()`);
  const hasLink = await until(b, `!!document.querySelector('#sd-panel [data-market-st]')`, 40);
  const linkId = await b.evaluate(`(() => { const a = document.querySelector('#sd-panel [data-market-st]'); if (!a) return null; a.click(); return a.getAttribute('data-market-st'); })()`);
  await sleep(1200);
  const viaSd = await b.evaluate(`(() => { const t = document.querySelector('#mm-panel .mm-tile.sel'); return { open: !document.getElementById('mm-panel').hidden, sel: t ? t.dataset.id : null,
    scope: document.querySelector('#mm-panel [data-k="scope"]').value }; })()`);
  R.check("역 상세 '타일 지도에서 보기' → 패널이 열리고 그 역 타일이 골라짐", hasLink && !!linkId && viaSd.open && viaSd.sel === linkId, Object.assign({ linkId }, viaSd));
  await b.key('Escape', 'Escape', 27); await sleep(200);
  const exc = b.logs.filter(l => /EXC/.test(l));
  R.check('예외 0 (PC)', exc.length === 0, exc.slice(0, 3));
  b.close();

  // ── 링크 복사 → 같은 조건으로 다시 열림 ──
  b = await launch({ port: 9673, w: 1440, h: 900 });
  await b.goto(BASE + '?market=1&y=2031&w=gbd&c=tier&g=line&s=affected#normal', 1500); await ready(b);
  await until(b, `document.querySelectorAll('#mm-panel .mm-tile').length > 30`, 60); await sleep(500);
  await b.evaluate(`(() => { const s = STATIONS.find(f => f.properties.name_ko === '광운대'); MarketMap.pick(s.properties.id, {}); window.__copied = null;
    if (navigator.clipboard) navigator.clipboard.writeText = t => { window.__copied = t; return Promise.resolve(); }; document.querySelector('#mm-panel .mm-link').click(); })()`);
  await sleep(300);
  const copied = await b.evaluate(`window.__copied`);
  const st1 = await b.evaluate(`MarketMap.state()`);
  R.check('주소의 조건대로 열림 (2031·강남·순위 변화·빨라지는 역 모두)', st1.y === '2031' && st1.w === 'gbd' && st1.color === 'tier', st1);
  b.close();
  b = await launch({ port: 9674, w: 1440, h: 900 });
  await b.goto(copied ? copied.replace(/^https?:\/\/[^/]+\/[^?]*/, BASE) : BASE, 1500); await ready(b);
  await until(b, `document.querySelectorAll('#mm-panel .mm-tile').length > 30`, 60); await sleep(500);
  const st2 = await b.evaluate(`({ s: MarketMap.state(), scope: document.querySelector('#mm-panel [data-k="scope"]').value, sel: (document.querySelector('#mm-panel .mm-tile.sel') || {}).dataset })`);
  R.check('링크 복사한 주소로 열면 같은 조건 + 같은 역 골라짐', !!copied && st2.s.y === '2031' && st2.s.w === 'gbd' && st2.s.color === 'tier' && st2.scope === 'affected' && st2.s.sel === st1.sel && !!st1.sel, { copied, st2: st2.s, scope: st2.scope });
  b.close();
  b = await launch({ port: 9675, w: 1440, h: 900 });
  await b.goto(BASE + '?market=1&y=1999&w=evil&c=%3Cimg%3E&g=x#normal', 1500); await ready(b);
  await until(b, `document.querySelectorAll('#mm-panel .mm-tile').length > 30`, 60);
  const st4 = await b.evaluate(`MarketMap.state()`);
  R.check('엉뚱한 주소 값은 무시하고 기본값 (연도 전체·평균·빨라지는 분·새 노선)', st4.y === 'all' && st4.w === 'avg' && st4.color === 'gain' && st4.group === 'line', st4);
  b.close();

  // ── 투자 색: 투자 모드에서만 ──
  b = await launch({ port: 9676, w: 1440, h: 900, invest: true });
  await b.goto(BASE + '?market=1&c=jeonse&s=all#invest', 1500); await ready(b);
  await until(b, `document.querySelectorAll('#mm-panel .mm-tile').length > 100`, 60);
  await until(b, `typeof StationJeonse !== 'undefined' && StationJeonse.isReady && StationJeonse.isReady()`, 60); await sleep(800);
  const jv = await b.evaluate(`(() => { const st = MarketMap.state(); const m = MarketMap.model(); const keys = {}; m.groups.forEach(G => G.tiles.forEach(t => { keys[t.color.key] = (keys[t.color.key] || 0) + 1; }));
    return { color: st.color, keys, legend: document.querySelector('#mm-panel .mm-legend').textContent.slice(0, 80) }; })()`);
  const jk = Object.keys(jv.keys).filter(k => /^j\d$/.test(k)).length;
  R.check('투자 모드: 색 = 전세가율 → 전세가율 구간 색 3개 이상 + 범례', jv.color === 'jeonse' && jk >= 3 && /전세가율|50%/.test(jv.legend), jv);
  await b.evaluate(`(() => { const s = document.querySelector('#mm-panel [data-k="size"]'); s.value = 'supply'; s.dispatchEvent(new Event('change')); })()`);
  await until(b, `typeof StationDev !== 'undefined' && StationDev.isReady()`, 40); await sleep(900);
  const sv = await b.evaluate(`(() => { const m = MarketMap.model(); const vs = []; m.groups.forEach(G => G.tiles.forEach(t => vs.push(t.v)));
    return { size: MarketMap.state().size, distinct: new Set(vs).size, max: Math.max(...vs), legend: /입주|인허가/.test(document.querySelector('#mm-panel .mm-legend').textContent) }; })()`);
  R.check('투자 모드: 크기 = 입주 예정 세대 → 타일 크기가 역마다 다름 + 범례 설명', sv.size === 'supply' && sv.distinct > 10 && sv.max > 100 && sv.legend, sv);
  b.close();
  b = await launch({ port: 9677, w: 1440, h: 900 });
  await b.goto(BASE + '?market=1&c=jeonse#normal', 1500); await ready(b);
  await until(b, `document.querySelectorAll('#mm-panel .mm-tile').length > 30`, 60);
  const nv = await b.evaluate(`MarketMap.state().color`);
  R.check('투자 모드가 아니면 전세가율 색은 막히고 기본(빨라지는 분)', nv === 'gain', nv);
  b.close();

  // ── 휴대폰 ──
  b = await launch({ port: 9672, w: 390, h: 844, mobile: true });
  await b.goto(BASE + '?market=1#normal', 1500); await ready(b);
  const mUp = await until(b, `document.querySelectorAll('#mm-panel .mm-tile').length > 30`, 60);
  const m1 = await b.evaluate(`(() => { const p = document.getElementById('mm-panel'), r = p.getBoundingClientRect(); const tabs = [...p.querySelectorAll('.mm-tabs button')].filter(x => x.offsetParent).map(x => x.textContent);
    return { tabs, bottom: Math.round(r.bottom), h: Math.round(r.height), inView: r.left >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 }; })()`);
  R.check('휴대폰: ?market=1 로 열림, 탭 지도|타일|분석, 화면 안', mUp && m1.tabs.join('|') === '지도|타일|분석' && m1.inView, m1);
  await b.evaluate(`(() => { const t = document.querySelector('#mm-panel .mm-tile'); t && t.click(); })()`);
  await sleep(500);
  const m2 = await b.evaluate(`({ tab: document.getElementById('mm-panel').dataset.tab, card: document.querySelector('#mm-panel .mm-card').offsetHeight > 40 })`);
  R.check("휴대폰: 타일 누르면 '분석' 탭에 카드", m2.tab === 'card' && m2.card, m2);
  await b.evaluate(`document.querySelector('#mm-panel .mm-tabs button[data-tab="map"]').click(); 0`); await sleep(300);
  const m3 = await b.evaluate(`({ hidden: document.getElementById('mm-panel').hidden, back: !document.getElementById('mm-return').hidden })`);
  R.check("휴대폰: '지도' 탭 → 시트 숨고 '타일로 돌아가기'", m3.hidden && m3.back, m3);
  await b.evaluate(`document.getElementById('mm-return').click(); 0`); await sleep(300);
  const m4 = await b.evaluate(`!document.getElementById('mm-panel').hidden && document.getElementById('mm-panel').dataset.tab === 'tiles'`);
  R.check("휴대폰: '타일로 돌아가기' → 타일 탭", m4);
  const exc2 = b.logs.filter(l => /EXC/.test(l));
  R.check('예외 0 (휴대폰)', exc2.length === 0, exc2.slice(0, 3));
  b.close();
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
