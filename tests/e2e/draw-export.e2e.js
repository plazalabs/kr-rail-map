/* e2e: 나만의 노선 그리기 → 저장 → GeoJSON 내보내기 (2차 감사 V1, 2026-11-13)
 *  - 도구 > 나만의 노선 그리기 → 지도 3곳 실제 클릭 → Enter → 사이드바 목록에 1개, localStorage 저장
 *  - GeoJSON 내보내기 → FeatureCollection, LineString 좌표 3개(지도에서 찍은 곳 근처), 이름·색·선 모양
 *  - Esc 로 그리기 취소하면 지도 클릭이 더 이상 점을 찍지 않음
 * 실행: node tests/e2e/run.js --only draw-export
 */
'use strict';
const { launch, sleep, BASE, recorder } = require('./lib/cdp');
const R = recorder('draw-export');
async function ready(b) {
  for (let i = 0; i < 120; i++) { await sleep(300); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&!!map.getSource('lines')`).catch(() => false)) break; }
  await sleep(1200);
}
(async () => {
  const b = await launch({ port: 9721, w: 1440, h: 900 });
  await b.goto(BASE + '#normal', 1500); await ready(b);
  await b.evaluate(`localStorage.removeItem('kr-rail-map-mylines-v1'); map.jumpTo({ center: [127.06, 37.62], zoom: 12.5 }); 0`); await sleep(800);
  await b.evaluate(`document.getElementById('draw-btn').click(); document.getElementById('draw-name').value = '시험 노선'; document.activeElement && document.activeElement.blur(); 0`); await sleep(300);
  // 역에서 조금 떨어진 세 점 (지도 화면 좌표로 바꿔 실제 클릭)
  const want = [[127.03, 37.60], [127.06, 37.63], [127.09, 37.61]];
  for (const c of want) {
    const p = await b.evaluate(`(() => { const r = map.getCanvas().getBoundingClientRect(); const q = map.project(${JSON.stringify(c)}); return [r.x + q.x, r.y + q.y]; })()`);
    await b.click(p[0], p[1]); await sleep(250);
  }
  await b.evaluate(`document.activeElement && document.activeElement.blur(); 0`);
  await b.key('Enter', 'Enter', 13); await sleep(500);
  const saved = await b.evaluate(`({ rows: [...document.querySelectorAll('#myline-list .myline-name')].map(x => x.textContent), ls: (JSON.parse(localStorage.getItem('kr-rail-map-mylines-v1') || '{}').myLines || []).map(l => ({ n: l.name, k: l.coords.length })) })`);
  R.check('지도 3곳 클릭 + Enter → 목록·저장에 노선 1개(점 3개)', saved.rows.length === 1 && saved.rows[0] === '시험 노선' && saved.ls.length === 1 && saved.ls[0].k === 3, saved);
  // 내보내기 — 다운로드 대신 파일 내용을 가로챈다
  await b.evaluate(`(() => { window.__gj = null; const orig = URL.createObjectURL; URL.createObjectURL = blob => { blob.text().then(t => { window.__gj = t; }); return 'blob:x'; }; HTMLAnchorElement.prototype.click = function () {}; document.getElementById('export-geojson').click(); })()`);
  await sleep(500);
  const gj = await b.evaluate(`window.__gj`);
  let fc = null; try { fc = JSON.parse(gj); } catch (e) { /* 아래에서 실패 */ }
  const f0 = fc && fc.features && fc.features[0];
  const near = f0 && f0.geometry.coordinates.every((c, i) => Math.abs(c[0] - want[i][0]) < 0.01 && Math.abs(c[1] - want[i][1]) < 0.01);
  R.check('GeoJSON: FeatureCollection · LineString 좌표 3개(찍은 곳 근처, 역 붙임 허용) · 이름·색·선', !!fc && fc.type === 'FeatureCollection' && f0.geometry.type === 'LineString' && f0.geometry.coordinates.length === 3 && near && f0.properties.name === '시험 노선' && /^#[0-9a-f]{6}$/i.test(f0.properties.color) && !!f0.properties.dash,
    f0 ? { coords: f0.geometry.coordinates, props: f0.properties } : gj);
  // Esc 취소 뒤 지도 클릭 → 점 안 찍힘
  await b.evaluate(`document.getElementById('draw-btn').click(); 0`); await sleep(200);
  await b.key('Escape', 'Escape', 27); await sleep(200);
  const p = await b.evaluate(`(() => { const r = map.getCanvas().getBoundingClientRect(); const q = map.project([127.05, 37.62]); return [r.x + q.x, r.y + q.y]; })()`);
  await b.click(p[0], p[1]); await sleep(300);
  const after = await b.evaluate(`(() => { const s = map.getSource('draw-preview'); const d = s && s._data; return d && d.features ? d.features.length : 0; })()`);
  R.check('Esc 로 취소하면 지도 클릭이 점을 찍지 않음', after === 0, after);
  await b.evaluate(`localStorage.removeItem('kr-rail-map-mylines-v1'); 0`);
  const exc = b.logs.filter(l => /EXC/.test(l));
  R.check('예외 0', exc.length === 0, exc.slice(0, 3));
  b.close();
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
