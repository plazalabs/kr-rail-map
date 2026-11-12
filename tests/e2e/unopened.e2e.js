/* e2e: 미개통 노선 표시 + 기본 길찾기 (2026-11-09 회장님 결정 1)
 *  A. 지도: 운행 중인 노선(rail-lines)엔 미개통이 없고, 미개통은 점선 레이어(rail-lines-unopened)와 '개통 예정' 글자로만 그린다
 *  B. 길찾기 기본: '개통 예정 노선 포함' 꺼짐 → 결과에 미개통 배지·'지금 vs 개통 후' 상자가 없고, '켜면 몇 분' 안내 한 줄
 *  C. 스위치 실클릭 → 다시 찾아 개통 후 경로(미개통 배지·비교 상자), 저장됨, 새로고침해도 켜짐
 *  D. 미개통 노선에만 있는 역(교산): 기본이면 '지금 운행 중인 노선으로는 갈 수 없습니다' + 개통 후 안내
 *  E. 경로를 그리는 동안 미개통 점선·글자도 같이 숨는다
 * 실행: node tests/e2e/run.js --only unopened
 */
'use strict';
const { launch, sleep, BASE, recorder, outDir, ensureToolbar } = require('./lib/cdp');
const path = require('path');
const R = recorder('unopened');
const OUT = outDir('unopened');

async function ready(b) {
  for (let i = 0; i < 120; i++) { await sleep(400); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&map.loaded()&&!!map.getLayer('rail-lines')`).catch(() => false)) break; }
  await sleep(600);
}
async function waitFor(b, expr, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await b.evaluate(expr).catch(() => false)) return Date.now() - t0; await sleep(200); }
  return null;
}
// 실클릭 — 그 지점의 맨 위 요소가 대상일 때만 누른다 (가려지면 실패로 남긴다)
async function press(b, sel) {
  await ensureToolbar(b, sel);   // 980px 이하: 툴바는 더보기 시트 안 (작업 1)
  const i = await b.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({block:'center', inline:'nearest'});
    const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width/2, r.y + r.height/2);
    return { x: r.x + r.width/2, y: r.y + r.height/2, on: !!t && (t === e || e.contains(t)), top: t && (t.id || t.className || t.tagName) }; })()`);
  if (!i) return { ok: false, why: '요소 없음' };
  if (!i.on) return { ok: false, why: '가려짐(' + i.top + ')' };
  await b.click(i.x, i.y);
  return { ok: true };
}
const RESULT = `(() => { const r = document.getElementById('route-result'); return {
  text: r.textContent.replace(/\\s+/g, ' ').trim(),
  hint: !!r.querySelector('.rc-oo-hint'), nf: !!r.querySelector('.rc-nf'), badge: !!r.querySelector('.badge-unopened'),
  total: (r.querySelector('.total') || {}).textContent || '' }; })()`;
async function route(b, from, to) {
  await b.evaluate(`(() => { const p = document.getElementById('route-panel'); if (p.hidden) document.getElementById('route-btn').click();
    const st = n => STATIONS.find(s => s.properties.name_ko === n);
    setRouteStation(document.getElementById('route-from'), st(${JSON.stringify(from)}));
    setRouteStation(document.getElementById('route-to'), st(${JSON.stringify(to)}));
    document.getElementById('route-result').innerHTML = ''; return 0; })()`);
  const go = await press(b, '#route-go');
  await waitFor(b, `document.getElementById('route-result').textContent.trim().length > 0`, 8000);
  return go;
}

(async () => {
  const b = await launch({ port: 9571 });
  try {
    await b.goto(BASE, 500); await ready(b);

    // A. 지도
    await b.evaluate(`map.jumpTo({ center: [127.06, 37.6], zoom: 12 }); 0`);
    await waitFor(b, `map.loaded() && map.queryRenderedFeatures({ layers: ['rail-lines-unopened'] }).length > 0`, 10000);
    const A = await b.evaluate(`(() => {
      const st = f => f.properties.status || 'open';
      const open = map.queryRenderedFeatures({ layers: ['rail-lines'] });
      const un = map.queryRenderedFeatures({ layers: ['rail-lines-unopened'] });
      return { openN: open.length, openBad: [...new Set(open.filter(f => st(f) !== 'open').map(f => f.properties.name_ko))],
        unN: un.length, unBad: [...new Set(un.filter(f => st(f) === 'open').map(f => f.properties.name_ko))],
        unNames: [...new Set(un.map(f => f.properties.name_ko))],
        dash: map.getPaintProperty('rail-lines-unopened', 'line-dasharray'),
        label: map.getLayoutProperty('rail-lines-unopened-label', 'text-field') }; })()`);
    R.check('A1 운행 중 레이어에 미개통 노선 없음', A.openN > 0 && A.openBad.length === 0, A.openBad.join(',') || `${A.openN}개`);
    R.check('A2 미개통 레이어에 운행 중 노선 없음 + 동북선 보임', A.unN > 0 && A.unBad.length === 0 && A.unNames.includes('동북선'), A.unNames.join(','));
    R.check('A3 미개통은 점선', Array.isArray(A.dash) && A.dash.length >= 2, JSON.stringify(A.dash));
    R.check('A4 글자에 "개통 예정"', JSON.stringify(A.label).includes('개통 예정'));
    await b.shot(path.join(OUT, 'a-map.png'));

    // B. 기본 길찾기 (꺼짐)
    const def = await b.evaluate(`document.getElementById('route-unopened').checked`);
    R.check('B1 스위치 기본 꺼짐', def === false);
    await route(b, '강남', '원주');
    const B = await b.evaluate(RESULT);
    R.check('B2 기본 결과에 미개통 배지·비교 상자 없음', !B.badge && !B.nf, B.total);
    R.check('B3 켜면 몇 분 단축되는지 한 줄 안내', B.hint && /\d+분 단축 예상/.test(B.text), B.text.slice(0, 120));
    await b.shot(path.join(OUT, 'b-off.png'));

    // C. 실클릭으로 켜기 → 자동으로 다시 찾음
    const pc = await press(b, '#route-unopened');
    R.check('C1 스위치 실클릭', pc.ok, pc.why);
    await waitFor(b, `!!document.querySelector('#route-result .rc-nf')`, 6000);
    const C = await b.evaluate(RESULT);
    const saved = await b.evaluate(`localStorage.getItem('krrail-route-unopened')`);
    R.check('C2 켜면 개통 후 경로(미개통 배지 + 지금 vs 개통 후)', C.badge && C.nf && !C.hint, C.total);
    R.check('C3 저장됨', saved === '1', saved);
    // E. 경로를 그리는 동안 미개통 점선·글자 숨김
    const E = await b.evaluate(`({ op: map.getPaintProperty('rail-lines-unopened', 'line-opacity'), vis: map.getLayoutProperty('rail-lines-unopened-label', 'visibility') })`);
    R.check('E1 경로 표시 중 미개통 점선·글자 숨김', E.op === 0 && E.vis === 'none', E);
    await b.shot(path.join(OUT, 'c-on.png'));
    await b.goto(BASE, 500); await ready(b);
    R.check('C4 새로고침해도 켜짐', await b.evaluate(`document.getElementById('route-unopened').checked`) === true);

    // D. 끄고, 미개통 단독역
    await b.evaluate(`localStorage.setItem('krrail-route-unopened', '0'); 0`);
    await b.goto(BASE, 500); await ready(b);
    await route(b, '교산', '강남');
    const D = await b.evaluate(RESULT);
    R.check('D1 미개통 단독역: 지금은 갈 수 없음 + 개통 후 안내', D.text.includes('지금 운행 중인 노선으로는 갈 수 없습니다') && D.hint, D.text.slice(0, 120));
  } catch (e) {
    R.check('실행 오류', false, String(e && e.stack || e).slice(0, 300));
  } finally {
    R.finish();
    b.close();
    setTimeout(() => process.exit(process.exitCode || 0), 1500);
  }
})();
