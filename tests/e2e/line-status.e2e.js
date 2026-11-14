/* e2e: 노선 상태 범례(J4) + 노선 보기 버튼(J5) — 2026-11-14 UX 종합 리뷰
 *  A. PC: 지도 오른쪽 아래 범례 4줄(운행 중·공사 중·계획·구상), 글자+선 모양, 가리지 않음, 상태별 선 레이어 3개(점선 모양 서로 다름)
 *  B. PC: 범례 '공사 중' 실클릭 → 공사 중 노선 숨김(목록 체크도 꺼짐) → 다시 누르면 켜짐
 *  C. PC: 보기 버튼 '운행 중'·'고속철도'·'계획·구상'·'전체' 실클릭 → 켜진 노선이 그 조건과 같고 그 버튼만 눌림
 *  D. 휴대폰 390×844: 범례는 '범례' 버튼으로 접힘, 확대 버튼·탭바와 안 겹침, 누르면 펼쳐지고 화면 안
 * 실행: node tests/e2e/run.js --only line-status
 */
'use strict';
const { launch, sleep, BASE, recorder } = require('./lib/cdp');
const R = recorder('line-status');

async function ready(b) {
  for (let i = 0; i < 120; i++) { await sleep(400); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&map.loaded()&&!!map.getLayer('rail-lines')&&!!document.querySelector('#line-presets .lp-btn')`).catch(() => false)) break; }
  await sleep(600);
}
// 실클릭 — 그 지점의 맨 위 요소가 대상일 때만 누른다
async function press(b, sel) {
  const i = await b.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({block:'center', inline:'nearest'});
    const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width/2, r.y + r.height/2);
    return { x: r.x + r.width/2, y: r.y + r.height/2, on: !!t && (t === e || e.contains(t)), top: t && (t.id || t.className || t.tagName) }; })()`);
  if (!i) return { ok: false, why: '요소 없음' };
  if (!i.on) return { ok: false, why: '가려짐(' + i.top + ')' };
  await b.click(i.x, i.y);
  await sleep(350);
  return { ok: true };
}
const STATE = `(() => {
  const vis = scopeLines().filter(f => visibleLines.has(f.properties.id)).map(f => f.properties);
  const checked = [...document.querySelectorAll('#line-list .line-item')].filter(l => l.querySelector('input').checked).length;
  const pressed = [...document.querySelectorAll('#line-presets .lp-btn[aria-pressed="true"]')].map(x => x.dataset.preset);
  const legend = Object.fromEntries([...document.querySelectorAll('#status-legend .sl-row')].map(x => [x.dataset.status, x.getAttribute('aria-pressed') + ':' + x.querySelector('.sl-n').textContent]));
  return { n: vis.length, total: scopeLines().length, checked, pressed, legend,
    statuses: [...new Set(vis.map(p => p.status || 'open'))].sort().join(','), cats: [...new Set(vis.map(p => p.category))].sort().join(',') };
})()`;
const overlap = (a, c) => a && c && a.left < c.right && c.left < a.right && a.top < c.bottom && c.top < a.bottom;

(async () => {
  let b = await launch({ port: 9881, w: 1440, h: 900 });
  try {
    await b.goto(BASE, 500); await ready(b);
    await b.evaluate(`setScope('all', { fly: false }); 0`); await sleep(500);

    // A
    const A = await b.evaluate(`(() => {
      const el = document.getElementById('status-legend'); if (!el) return null;
      const r = el.getBoundingClientRect();
      const rows = [...el.querySelectorAll('.sl-row')].filter(x => !x.hidden);
      const covered = rows.filter(x => { const q = x.getBoundingClientRect(); const t = document.elementFromPoint(q.x + q.width/2, q.y + q.height/2); return !(t && (t === x || x.contains(t))); }).map(x => x.dataset.status);
      const dash = id => JSON.stringify(map.getPaintProperty(id, 'line-dasharray'));
      return { labels: rows.map(x => x.querySelector('.sl-label').textContent), svg: rows.map(x => !!x.querySelector('svg line')).every(Boolean),
        inView: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, right: innerWidth - r.right, bottom: innerHeight - r.bottom,
        toggleShown: getComputedStyle(el.querySelector('.sl-toggle')).display !== 'none', covered,
        layers: ['rail-lines-unopened', 'rail-lines-planned', 'rail-lines-proposed'].map(id => !!map.getLayer(id)),
        dashes: [dash('rail-lines-unopened'), dash('rail-lines-planned'), dash('rail-lines-proposed')] };
    })()`);
    R.check('A1 범례 4줄: 운행 중·공사 중·계획·구상', A && A.labels.join('|') === '운행 중|공사 중|계획|구상', JSON.stringify(A && A.labels));
    R.check('A2 줄마다 선 모양 그림(색만으로 나누지 않음)', A && A.svg);
    R.check('A3 화면 안·오른쪽 아래·PC 는 펼친 채(접는 버튼 없음)', A && A.inView && A.right < 80 && A.bottom < 200 && !A.toggleShown, JSON.stringify(A && { r: A.right, b: A.bottom, t: A.toggleShown }));
    R.check('A4 범례 줄이 다른 것에 안 가림', A && A.covered.length === 0, JSON.stringify(A && A.covered));
    R.check('A5 상태별 선 레이어 3개, 점선 모양 서로 다름', A && A.layers.every(Boolean) && new Set(A.dashes).size === 3, JSON.stringify(A && A.dashes));

    // B
    const s0 = await b.evaluate(STATE);
    const p1 = await press(b, '#status-legend .sl-row[data-status="construction"]');
    const s1 = await b.evaluate(STATE);
    R.check('B1 범례 공사 중 누름 → 공사 중 노선 숨김·목록 체크 같이', p1.ok && !s1.statuses.includes('construction') && s1.checked === s1.n && s1.legend.construction.startsWith('false'), JSON.stringify({ p1, s1 }));
    const p2 = await press(b, '#status-legend .sl-row[data-status="construction"]');
    const s2 = await b.evaluate(STATE);
    R.check('B2 다시 누르면 원래대로', p2.ok && s2.n === s0.n && s2.legend.construction.startsWith('true'), JSON.stringify({ p2, n0: s0.n, n2: s2.n }));

    // C
    const q0 = await b.evaluate(STATE);
    R.check('C0 처음엔 전체(기본 = 전체, 회장님 결정)', q0.n === q0.total && q0.pressed.join() === 'all', JSON.stringify(q0));
    let p = await press(b, '#line-presets .lp-btn[data-preset="open"]');
    let q = await b.evaluate(STATE);
    R.check('C1 운행 중 → 켜진 노선 = 운행 중만, 그 버튼만 눌림, 목록 체크 같이', p.ok && q.statuses === 'open' && q.pressed.join() === 'open' && q.checked === q.n && q.n > 0, JSON.stringify({ p, q }));
    R.check('C2 범례도 따라감(공사 중 꺼짐)', q.legend.construction && q.legend.construction.startsWith('false'), JSON.stringify(q.legend));
    p = await press(b, '#line-presets .lp-btn[data-preset="hsr"]');
    q = await b.evaluate(STATE);
    R.check('C3 고속철도 → KTX 종류만', p.ok && q.cats === 'ktx' && q.pressed.join() === 'hsr', JSON.stringify({ p, q }));
    p = await press(b, '#line-presets .lp-btn[data-preset="plan"]');
    q = await b.evaluate(STATE);
    R.check('C4 계획·구상 → planned·proposed 만', p.ok && q.statuses === 'planned,proposed' && q.pressed.join() === 'plan', JSON.stringify({ p, q }));
    // 목록에서 하나 직접 끄면 버튼 눌림이 풀린다
    await b.evaluate(`(() => { const cb = document.querySelector('#line-list .line-item input:checked'); cb.click(); return 0; })()`); await sleep(300);
    q = await b.evaluate(STATE);
    R.check('C5 노선 하나 직접 바꾸면 버튼 눌림 풀림', q.pressed.length === 0, JSON.stringify(q.pressed));
    p = await press(b, '#line-presets .lp-btn[data-preset="all"]');
    q = await b.evaluate(STATE);
    R.check('C6 전체 → 모두 켜짐', p.ok && q.n === q.total && q.pressed.join() === 'all', JSON.stringify({ p, n: q.n, t: q.total }));
    const exc = b.logs.filter(x => /EXC/.test(x));
    R.check('예외 0 (PC)', exc.length === 0, exc.slice(0, 3));
    b.close(); b = null;

    // D. 휴대폰
    b = await launch({ port: 9882, w: 390, h: 844, mobile: true });
    await b.goto(BASE, 500); await ready(b);
    const rect = sel => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e || e.offsetParent === null && getComputedStyle(e).position !== 'fixed') return null; const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; })()`;
    const D = await b.evaluate(`(() => { const el = document.getElementById('status-legend');
      return { rowsHidden: getComputedStyle(el.querySelector('.sl-rows')).display === 'none', toggle: getComputedStyle(el.querySelector('.sl-toggle')).display !== 'none' }; })()`);
    const leg = await b.evaluate(rect('#status-legend'));
    const zoom = await b.evaluate(rect('.maplibregl-ctrl-zoom-in'));
    const zoomOut = await b.evaluate(rect('.maplibregl-ctrl-compass'));
    const tab = await b.evaluate(rect('#tabbar'));
    R.check('D1 휴대폰: 범례 접힘(버튼 하나)', D.rowsHidden && D.toggle, JSON.stringify(D));
    R.check('D2 접힌 범례가 확대 버튼·탭바와 안 겹침', leg && !overlap(leg, zoom) && !overlap(leg, zoomOut) && !overlap(leg, tab), JSON.stringify({ leg, zoom, tab }));
    const pt = await press(b, '#status-legend .sl-toggle');
    const leg2 = await b.evaluate(rect('#status-legend'));
    const open = await b.evaluate(`getComputedStyle(document.querySelector('#status-legend .sl-rows')).display !== 'none' && document.querySelector('#status-legend .sl-toggle').getAttribute('aria-expanded') === 'true'`);
    R.check('D3 범례 버튼 누르면 펼침(aria-expanded)', pt.ok && open, JSON.stringify(pt));
    R.check('D4 펼친 범례 화면 안·탭바 위', leg2 && leg2.top >= 0 && leg2.right <= 390 && (!tab || leg2.bottom <= tab.top + 1), JSON.stringify({ leg2, tab }));
    const pr = await press(b, '#status-legend .sl-row[data-status="construction"]');
    R.check('D5 휴대폰에서도 줄 누르면 켜고 끄기', pr.ok && (await b.evaluate(STATE)).legend.construction.startsWith('false'), JSON.stringify(pr));
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
