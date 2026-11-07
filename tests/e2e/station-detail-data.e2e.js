/* e2e: 역 상세·투자분석 데이터 지연 로딩 (IMPL9 건 1)
 *  - 시세·단지·도심 접근성·공급 파일은 지도 준비 뒤 쉬는 동안 미리 받는다(IMPL10) — 준비 전에는 받지 않고, 파일마다 1번
 *  - 키보드(/ → 역 이름 → Enter)로 역을 열면 그때 받고, 네 절이 모두 뜬다
 *  - 느린 회선(Fast 3G)에서 투자분석을 켜자마자 지점을 찍어도, 자료가 도착하면 카드가 채워진다
 * 실행: node tests/e2e/run.js --only station-detail-data
 */
'use strict';
const { launch, sleep, BASE, recorder, outDir } = require('./lib/cdp');
const path = require('path');
const R = recorder('station-detail-data');
const OUT = outDir('station-detail-data');
const FILES = ['station-price.json', 'station-complex.json', 'access.json', 'station-dev.json'];

async function ready(b) {
  for (let i = 0; i < 120; i++) { await sleep(400); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&map.loaded()&&!!map.getLayer('rail-lines')`).catch(() => false)) break; }
  await sleep(600);
}
async function press(b, sel) {
  const i = await b.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({block:'center', inline:'nearest'});
    const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width/2, r.y + r.height/2);
    return { x: r.x + r.width/2, y: r.y + r.height/2, on: !!t && (t === e || e.contains(t)), top: t && (t.id || t.className || t.tagName) }; })()`);
  if (!i) return { ok: false, why: '요소 없음' };
  if (!i.on) return { ok: false, why: '가려짐(' + i.top + ')' };
  await b.click(i.x, i.y); await sleep(300);
  return { ok: true };
}
async function waitFor(b, expr, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await b.evaluate(expr).catch(() => false)) return Date.now() - t0; await sleep(200); }
  return null;
}
function watch(b) {
  const urls = [];
  b.handlers.push(m => { if (m.method === 'Network.requestWillBeSent') urls.push(m.params.request.url); });
  return f => urls.some(u => u.split('?')[0].endsWith('/data/' + f));
}

(async () => {
  // ── A·B·C: 첫 화면 → 키보드로 강남 열기 → 네 절
  const b = await launch({ port: 9661, w: 1440, h: 1000 });
  await b.send('Network.setBypassServiceWorker', { bypass: true });
  await b.send('Network.setCacheDisabled', { cacheDisabled: true });
  const got = watch(b);
  // 페이지 안에서 '지도 준비(dataReady)' 시각을 잰다 — 상세 4종 요청 시작 시각과 비교 (IMPL10 미리 받기)
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `(function poll(){ if (typeof dataReady !== 'undefined' && dataReady) { window.__readyAt = performance.now(); return; } setTimeout(poll, 10); })();` });
  await b.goto(BASE + '#normal', 800); await ready(b);
  // 미리 받기가 끝날 때까지(최대 30초) 기다린다
  await waitFor(b, `${JSON.stringify(FILES)}.every(f => performance.getEntriesByType('resource').some(e => e.name.split('?')[0].endsWith('/data/' + f) && e.responseEnd > 0))`, 30000);
  const pre = await b.evaluate(`(() => { const r = performance.getEntriesByType('resource'); return { readyAt: Math.round(window.__readyAt || -1),
    files: ${JSON.stringify(FILES)}.map(f => { const es = r.filter(e => e.name.split('?')[0].endsWith('/data/' + f)); return { f, n: es.length, start: es.length ? Math.round(es[0].startTime) : null }; }) }; })()`);
  R.check('상세 데이터 4종을 지도 준비 뒤에만 받기 시작 (첫 화면 방해 없음)',
    pre.readyAt > 0 && pre.files.every(x => x.start !== null && x.start >= pre.readyAt), pre);
  R.check('쉬는 동안 4종을 미리 받음 (파일마다 1번)', pre.files.every(x => x.n === 1), pre.files);

  await b.key('/', 'Slash', 191); await sleep(200);
  const focused = await b.evaluate(`document.activeElement && document.activeElement.id`);
  await b.type('강남'); await sleep(500);
  await b.key('Enter', 'Enter', 13);
  const openMs = await waitFor(b, `document.getElementById('sd-panel') && document.getElementById('sd-panel').classList.contains('sd-open')`, 5000);
  const head = await b.evaluate(`(document.querySelector('#sd-body b')||{}).textContent || null`);
  R.check('키보드: / → "강남" → Enter → 역 상세 열림', focused === 'search' && openMs !== null && head === '강남', { focused, openMs, head });

  const T = 25000;
  const sec = {
    '시세': `!!document.querySelector('#sd-panel .sd-price')`,
    '단지 목록': `!!document.querySelector('#sd-panel .sd-cx-p')`,
    '도심 접근성': `[...document.querySelectorAll('#sd-panel .sd-sec h3')].some(h => h.textContent === '도심 접근성')`,
    '앞으로 들어올 세대': `[...document.querySelectorAll('#sd-panel .sd-sec h3')].some(h => h.textContent === '앞으로 들어올 세대')`,
  };
  const secMs = {};
  for (const [k, expr] of Object.entries(sec)) {
    const ms = await waitFor(b, expr, T); secMs[k] = ms;
    R.check(`역 상세 '${k}' 절 표시`, ms !== null, ms === null ? `${T}ms 안에 안 뜸` : `${ms}ms`);
  }
  R.check('미리 받은 뒤 열면 시세·단지가 바로 뜸 (1.5초 안)', secMs['시세'] !== null && secMs['시세'] < 1500 && secMs['단지 목록'] !== null && secMs['단지 목록'] < 1500, secMs);
  const cnt = await b.evaluate(`${JSON.stringify(FILES)}.map(f => performance.getEntriesByType('resource').filter(e => e.name.split('?')[0].endsWith('/data/' + f)).length)`);
  R.check('역을 연 뒤에도 4종은 파일마다 1번만 받음 (중복 없음)', cnt.every(n => n === 1), cnt);
  await b.shot(path.join(OUT, 'gangnam.png'));
  const exc = b.logs.filter(l => /EXC/.test(l));
  R.check('예외 0 (역 상세)', exc.length === 0, exc.slice(0, 3));
  b.close(); await sleep(1000);

  // ── D: 느린 회선에서 투자분석을 켜자마자 지점 찍기 → 자료 도착 후 카드 채움
  const v = await launch({ port: 9662, w: 1440, h: 1000 });
  await v.send('Network.setBypassServiceWorker', { bypass: true });
  await v.send('Network.setCacheDisabled', { cacheDisabled: true });
  const got2 = watch(v);
  await v.goto(BASE + '#normal', 800); await ready(v);
  await v.evaluate(`(() => { const s = STATIONS.find(x => x.properties.name_ko === '강남' && x.properties.lines.includes('seoul-subway-line-2')); map.jumpTo({ center: s.geometry.coordinates, zoom: 15 }); 0 })()`); await sleep(1500);
  // 지금부터 느린 회선 (Fast 3G 상당)
  await v.send('Network.emulateNetworkConditions', { offline: false, latency: 562.5, downloadThroughput: 180000, uploadThroughput: 84375 });
  const m1 = await press(v, '#toolbar > .tb-dropdown:nth-child(6) .tb-dropbtn'); await sleep(250);
  const m2 = await press(v, '#invest-btn');
  const pt = await v.evaluate(`(() => { const r = map.getCanvas().getBoundingClientRect(); return [r.x + r.width/2 + 40, r.y + r.height/2 + 30]; })()`);
  await v.click(pt[0], pt[1]);
  const first = await waitFor(v, `!!document.querySelector('#iv-body')`, 5000);
  const cards0 = await v.evaluate(`[...document.querySelectorAll('#iv-body .iv-card h4')].map(h => h.textContent)`);
  const accMs = await waitFor(v, `[...document.querySelectorAll('#iv-body .iv-card h4')].some(h => /도심까지/.test(h.textContent))`, 40000);
  const devMs = await waitFor(v, `[...document.querySelectorAll('#iv-body .iv-card h4')].some(h => /앞으로 들어올 세대/.test(h.textContent))`, 40000);
  R.check('투자분석 켜기(실클릭)', m1.ok && m2.ok, (m1.why || '') + (m2.why || ''));
  R.check('투자분석 결과 패널 뜸', first !== null, { cardsAtFirst: cards0 });
  R.check("느린 회선: 자료 도착 후 '도심까지' 카드 채워짐", accMs !== null, accMs === null ? '40초 안에 안 뜸' : `${accMs}ms`);
  R.check("느린 회선: 자료 도착 후 '앞으로 들어올 세대' 카드 채워짐", devMs !== null, devMs === null ? '40초 안에 안 뜸' : `${devMs}ms`);
  R.check('투자분석을 켜면 도심 접근성·공급 자료를 받음', got2('access.json') && got2('station-dev.json'), FILES.filter(got2));
  await v.shot(path.join(OUT, 'invest-slow.png'));
  const exc2 = v.logs.filter(l => /EXC/.test(l));
  R.check('예외 0 (투자분석)', exc2.length === 0, exc2.slice(0, 3));
  v.close(); await sleep(1000);

  // ── E: 느린 회선에서 미리 받기 도중(준비 직후)에 역을 열기 → 깨지지 않고 네 절이 뜨고, 중복 없이 받음
  const w = await launch({ port: 9663, w: 1440, h: 1000 });
  await w.send('Network.setBypassServiceWorker', { bypass: true });
  await w.send('Network.setCacheDisabled', { cacheDisabled: true });
  await w.send('Network.emulateNetworkConditions', { offline: false, latency: 562.5, downloadThroughput: 180000, uploadThroughput: 84375 });
  await w.goto(BASE + '#normal', 800);
  for (let i = 0; i < 400; i++) { await sleep(100); if (await w.evaluate(`typeof dataReady!=='undefined'&&dataReady`).catch(() => false)) break; }
  await w.evaluate(`(() => { const s = STATIONS.find(x => x.properties.name_ko === '강남' && x.properties.lines.includes('seoul-subway-line-2')); showStation(s, { lng: s.geometry.coordinates[0], lat: s.geometry.coordinates[1] }); 0 })()`);
  const eMs = {};
  for (const [k, expr] of Object.entries(sec)) eMs[k] = await waitFor(w, expr, 60000);
  const cntE = await w.evaluate(`${JSON.stringify(FILES)}.map(f => performance.getEntriesByType('resource').filter(e => e.name.split('?')[0].endsWith('/data/' + f)).length)`);
  R.check('느린 회선: 미리 받기 도중에 역을 열어도 네 절이 모두 뜸', Object.values(eMs).every(x => x !== null), eMs);
  R.check('느린 회선: 그때도 4종은 파일마다 1번만 받음', cntE.every(n => n === 1), cntE);
  const excE = w.logs.filter(l => /EXC/.test(l));
  R.check('예외 0 (미리 받기 도중 열기)', excE.length === 0, excE.slice(0, 3));
  w.close();
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
