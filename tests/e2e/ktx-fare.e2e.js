/* e2e: KTX 공식 운임표 (2026-09-01 KTX·SRT 통합 운임) — 길찾기 요금과 요금 내역
 *  A. data/ktx-fares.json 을 첫 화면에서 한 번 받는다
 *  B. 서울→부산(최단시간, KTX 만): 예상 요금 54,400원, 내역 'KTX 서울→부산 54,400원 공식 운임표 (2026.9.1 기준)', '추정' 없음
 *  C. 청량리→동해(KTX + 일반철도): 합계에 '(일부 추정)', 내역에 공식 줄과 추정 줄이 따로
 *  D. 강남→역삼(전철만): 요금 내역 없음 (1,550원 한 줄)
 * 실행: node tests/e2e/run.js --only ktx-fare
 */
'use strict';
const { launch, sleep, BASE, recorder, outDir, ensureToolbar } = require('./lib/cdp');
const path = require('path');
const R = recorder('ktx-fare');
const OUT = outDir('ktx-fare');

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
  await ensureToolbar(b, sel);   // 980px 이하: 툴바는 더보기 시트 안 (작업 1)
  const i = await b.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({block:'center', inline:'nearest'});
    const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width/2, r.y + r.height/2);
    return { x: r.x + r.width/2, y: r.y + r.height/2, on: !!t && (t === e || e.contains(t)), top: t && (t.id || t.className || t.tagName) }; })()`);
  if (!i) return { ok: false, why: '요소 없음' };
  if (!i.on) return { ok: false, why: '가려짐(' + i.top + ')' };
  await b.click(i.x, i.y);
  return { ok: true };
}
async function route(b, from, to) {
  await b.evaluate(`(() => { if (document.getElementById('route-panel').hidden) document.getElementById('route-btn').click();
    const st = n => STATIONS.filter(s => s.properties.name_ko === n).sort((x, y) => y.properties.lines.length - x.properties.lines.length)[0];
    setRouteStation(document.getElementById('route-from'), st(${JSON.stringify(from)}));
    setRouteStation(document.getElementById('route-to'), st(${JSON.stringify(to)}));
    document.getElementById('route-result').innerHTML = ''; return 0; })()`);
  const go = await press(b, '#route-go');
  await waitFor(b, `!!document.querySelector('#route-result .rc-panel:not([hidden]) .total')`, 8000);
  const r = await b.evaluate(`(() => { const p = document.querySelector('#route-result .rc-panel:not([hidden])'); if (!p) return null;
    const f = p.querySelector('.rc-fare');
    return { total: p.querySelector('.total').textContent.replace(/\\s+/g, ' '), rows: f ? [...f.querySelectorAll('li')].map(li => li.textContent.replace(/\\s+/g, ' ').trim()) : [] }; })()`);
  return Object.assign({ go }, r || {});
}

(async () => {
  const b = await launch({ port: 9573 });
  const reqs = [];
  b.handlers.push(m => { if (m.method === 'Network.requestWillBeSent' && /ktx-fares\.json/.test(m.params.request.url)) reqs.push(m.params.request.url); });
  try {
    await b.goto(BASE, 500); await ready(b);
    R.check('A1 운임표 파일을 한 번 받음', reqs.length === 1, reqs.length + '번');

    const B = await route(b, '서울', '부산');
    R.check('B1 길찾기 실클릭', B.go.ok, B.go.why);
    R.check('B2 서울→부산 예상 요금 54,400원', /예상 요금 54,400원/.test(B.total) && !/추정/.test(B.total), B.total);
    // 종합12장 A① (11-14): KTX 사이 역은 '선로상 지나는 역' — 'N개역'(모든 열차가 서는 것처럼) 아님 + 코레일 정차역 확인 링크
    const pass = await b.evaluate(`(() => { const p = document.querySelector('#route-result .rc-panel:not([hidden])'); if (!p) return null;
      const L = [...p.querySelectorAll('.leg')].find(l => l.querySelector('.leg-passnote')); if (!L) return { legs: [...p.querySelectorAll('.leg')].map(l => l.textContent.slice(0, 60)) };
      return { note: !!L.querySelector('.leg-passnote a[href*="korail"]'), btn: (L.querySelector('.via-toggle') || {}).textContent }; })()`);
    R.check("B2b KTX 사이 역 = '선로상 N구간'(N개역 아님) + 정차역은 열차마다 다름 안내·코레일 링크", !!pass && pass.note && /^선로상 \d+구간$/.test(pass.btn || ''), pass);
    R.check('B3 내역: KTX 서울→부산 54,400원 공식 운임표 (2026.9.1 기준)',
      B.rows.length === 1 && B.rows[0].includes('54,400원') && B.rows[0].includes('공식 운임표 (2026.9.1 기준)'), B.rows);
    await b.shot(path.join(OUT, 'b-seoul-busan.png'));

    const C = await route(b, '청량리', '동해');
    R.check('C1 공식과 추정이 섞이면 합계에 "(일부 추정)"', /\(일부 추정\)/.test(C.total), C.total);
    R.check('C2 내역에 공식 줄과 추정 줄이 따로', C.rows.some(t => t.includes('공식 운임표')) && C.rows.some(t => t.includes('추정')), C.rows);
    await b.shot(path.join(OUT, 'c-donghae.png'));

    const D = await route(b, '강남', '역삼');
    R.check('D1 전철만 탄 경로는 내역 없음', /예상 요금 1,550원/.test(D.total) && D.rows.length === 0, D.total);
  } catch (e) {
    R.check('실행 오류', false, String(e && e.stack || e).slice(0, 300));
  } finally {
    R.finish();
    b.close();
    setTimeout(() => process.exit(process.exitCode || 0), 1500);
  }
})();
