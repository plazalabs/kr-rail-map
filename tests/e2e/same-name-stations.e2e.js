/* e2e: 동명역(시청 등 37개 이름)을 모두 고를 수 있고 길찾기에 그 역 ID 가 들어감 + 공유·옛 링크·역 상세 출발 (버그 ③, IMPL3)
 * 출처: 2026-11-07 세션 점검 스크립트 impl3.js (실제 마우스·키 이벤트, 헤드리스 Chrome).
 * 실행: node tests/e2e/run.js --only same-name-stations  (또는 E2E_BASE=<주소> node 이 파일)
 */
// IMPL3 재현·검증: 동명역 선택 가능 여부 (자동완성 → 실제로 길찾기에 들어가는 역 ID)
// cdp.js 재사용. 실제 키 입력(insertText)·실제 마우스 클릭.
// 판정: 이름 N 을 출발칸에 입력 → 자동완성에서 이름이 정확히 N 인 항목을 하나씩 클릭 → 도착칸에 '강남' 선택 →
//       길찾기 클릭 → RouteCompare.show 로 넘어간 출발 ID 를 기록. N 의 모든 역 ID 가 한 번씩 잡히면 통과.
//       (전수 열거 동안은 RouteCompare.show 를 기록용 스텁으로 바꾼다 — 테스트 하네스 한정. 시청→강남 본 검증은 원본 실행)
const { launch, sleep, BASE, outDir } = require('./lib/cdp');
const fs = require('fs'), path = require('path');
const OUT = outDir('same-name-stations');
const METRO14 = ['시청', '양정', '금곡', '증산', '중앙', '판교', '고촌', '평창', '박물관', '교대', '송정', '양평', '마산', '운천'];

async function ready(b) {
  for (let i = 0; i < 80; i++) { await sleep(400); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&map.loaded()&&typeof RouteCompare!=='undefined'`).catch(() => false)) break; }
  await sleep(800);
}
async function typeInto(b, id, text) {
  const c = await b.evaluate(`(() => { const e = document.getElementById('${id}'); e.scrollIntoView({block:'center'}); const r = e.getBoundingClientRect(); return [r.x + 20, r.y + r.height/2]; })()`);
  await b.click(c[0], c[1]); await sleep(60);
  await b.evaluate(`(() => { const e = document.getElementById('${id}'); e.select(); 0 })()`);
  await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
  await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
  await b.type(text); await sleep(250);
}
// 현재 열린 자동완성 항목 [{i, text, x, y}]
const acItems = (b, id) => b.evaluate(`[...document.getElementById('${id}').parentElement.querySelectorAll('.ac-list:not([hidden]) .ac-item')].map((e, i) => { const r = e.getBoundingClientRect(); return { i, text: e.innerText.replace(/\\s+/g, ' ').trim(), name: (e.childNodes[0] && e.childNodes[0].nodeType === 3 ? e.childNodes[0].textContent : e.innerText).trim(), x: r.x + 30, y: r.y + r.height/2 }; })`);

(async () => {
  const out = { base: BASE, names: {}, metro: {}, sicheong: null, legacy: null, share: null, detail: null };
  const b = await launch({ port: 9621, w: 1440, h: 1000 });
  await b.send('Network.setBypassServiceWorker', { bypass: true });
  await b.send('Network.setCacheDisabled', { cacheDisabled: true });
  await b.goto(BASE + '#normal', 800); await ready(b);

  // A. 동명역 영향 범위 (데이터에서 계산)
  const dup = await b.evaluate(`(() => { const R = Math.PI/180; const km = (a, c) => { const dLa = (c[1]-a[1])*R, dLo = (c[0]-a[0])*R; const h = Math.sin(dLa/2)**2 + Math.cos(a[1]*R)*Math.cos(c[1]*R)*Math.sin(dLo/2)**2; return 6371*2*Math.asin(Math.sqrt(h)); };
    const by = {}; STATIONS.forEach(s => (by[s.properties.name_ko] = by[s.properties.name_ko] || []).push(s));
    const res = {}; for (const n in by) { const g = by[n]; if (g.length < 2) continue; let mx = 0; for (let i = 0; i < g.length; i++) for (let j = i+1; j < g.length; j++) mx = Math.max(mx, km(g[i].geometry.coordinates, g[j].geometry.coordinates));
      res[n] = { ids: g.map(s => s.properties.id), maxKm: +mx.toFixed(1) }; } return res; })()`);
  const far = Object.keys(dup).filter(n => dup[n].maxKm >= 5);
  out.dupAll = Object.keys(dup).length; out.dupFar = far.length;
  out.hiddenStations = far.reduce((a, n) => a + dup[n].ids.length - 1, 0);
  console.log('동명 이름 전체', out.dupAll, '/ 5km 이상', out.dupFar, '/ 이름으로 못 고르는 역(첫 역 제외)', out.hiddenStations);
  console.log('5km 미만 동명:', Object.keys(dup).filter(n => dup[n].maxKm < 5).map(n => n + '(' + dup[n].maxKm + 'km)').join(', '));

  // B. 전수: 동명 이름 전부(5km 미만 포함)
  await b.evaluate(`window.__rc = []; window.__rcOrig = RouteCompare.show; RouteCompare.show = (f, t) => { __rc.push([f, t]); }; document.getElementById('route-panel').hidden = false; 0`);
  for (const n of Object.keys(dup)) {
    const want = dup[n].ids; const got = new Set(); const labels = [];
    // 자동완성 목록을 한 번 받아 정확히 이름이 n 인 항목 수를 센다
    await typeInto(b, 'route-from', n); let items = (await acItems(b, 'route-from')).filter(it => it.name === n);
    const cnt = items.length;
    for (let k = 0; k < cnt; k++) {
      await typeInto(b, 'route-from', n); items = (await acItems(b, 'route-from')).filter(it => it.name === n);
      const it = items[k]; if (!it) break; labels.push(it.text);
      await b.click(it.x, it.y); await sleep(120);
      await typeInto(b, 'route-to', '강남'); const ti = (await acItems(b, 'route-to')).find(x => x.name === '강남');
      if (ti) { await b.click(ti.x, ti.y); await sleep(120); }
      await b.evaluate(`__rc = []; document.getElementById('route-go').click(); 0`); await sleep(80);
      const rc = await b.evaluate(`__rc[0] || null`);
      if (rc) got.add(rc[0]);
    }
    const pass = want.every(id => got.has(id));
    out.names[n] = { want: want.length, items: cnt, got: got.size, pass, labels, far: dup[n].maxKm >= 5 };
    if (METRO14.includes(n)) out.metro[n] = out.names[n];
  }
  const nm = Object.values(out.names);
  console.log('동명 전체', nm.length, '이름 중 통과', nm.filter(x => x.pass).length, '/ 5km 이상', far.length, '중 통과', far.filter(n => out.names[n].pass).length,
    '/ 선택 가능 역', nm.reduce((a, x) => a + x.got, 0), '/', nm.reduce((a, x) => a + x.want, 0));
  for (const n of METRO14) { const r = out.names[n]; console.log(' ', r && r.pass ? 'PASS' : 'FAIL', n, r ? `역 ${r.want} · 자동완성 ${r.items} · 선택가능 ${r.got} | ${r.labels.join(' / ')}` : '동명 아님?'); }
  await b.evaluate(`RouteCompare.show = __rcOrig; 0`);

  // C. 시청(서울) → 강남 본 경로
  const seoulSicheong = await b.evaluate(`STATIONS.filter(s => s.properties.name_ko === '시청').find(s => s.geometry.coordinates[1] > 37 && s.geometry.coordinates[0] < 127.2).properties.id`);
  await typeInto(b, 'route-from', '시청');
  let items = (await acItems(b, 'route-from')).filter(it => it.name === '시청');
  // 서울 시청 표시를 고르는 기준: 라벨에 '1호선' 또는 '2호선' (수도권). 없으면 첫 항목(수정 전 상태)
  const pick = items.find(it => /(^|\D)[12]호선/.test(it.text) && !/부산|대전|대구/.test(it.text)) || items[0];
  await b.click(pick.x, pick.y); await sleep(150);
  await typeInto(b, 'route-to', '강남'); const ti = (await acItems(b, 'route-to')).find(x => x.name === '강남'); await b.click(ti.x, ti.y); await sleep(150);
  await b.evaluate(`window.__rc2 = []; const o = RouteCompare.show; RouteCompare.show = function (f, t) { __rc2.push([f, t]); return o.apply(this, arguments); }; 0`);
  const goC = await b.evaluate(`(() => { const e = document.getElementById('route-go'); const r = e.getBoundingClientRect(); return [r.x + r.width/2, r.y + r.height/2]; })()`);
  await b.click(goC[0], goC[1]); await sleep(2500);
  const resText = await b.evaluate(`(document.getElementById('route-result').innerText || '').replace(/\\s+/g, ' ').slice(0, 400)`);
  out.sicheong = { acLabels: items.map(i => i.text), picked: pick.text, fromId: (await b.evaluate(`__rc2[0] && __rc2[0][0]`)), seoulId: seoulSicheong, result: resText,
    busan: /부산|KTX 경부/.test(resText) };
  out.sicheong.ok = out.sicheong.fromId === seoulSicheong && !out.sicheong.busan;
  console.log('시청→강남', out.sicheong.ok ? 'PASS' : 'FAIL', JSON.stringify(out.sicheong));
  await b.shot(path.join(OUT, 'sicheong.png'));

  // D. 공유 링크 (새 링크) → 같은 경로가 복원되는지
  await b.evaluate(`document.getElementById('share-btn').click(); 0`); await sleep(600);
  const link = await b.evaluate(`navigator.clipboard.readText().catch(e => 'ERR ' + e.message)`);
  out.share = { link };
  if (/^http/.test(link)) {
    await b.goto('about:blank', 200); await b.goto(link, 800); await ready(b);
    // restoreFromUrl 의 자동 길찾기(800ms 후)가 래퍼 설치보다 먼저 돈다 → 자동 결과는 본문으로 판정,
    // 출발 ID 는 복원된 입력칸 그대로 길찾기를 한 번 더 눌러 기록
    await sleep(1500);
    out.share.autoResult = await b.evaluate(`(document.getElementById('route-result').innerText || '').replace(/\\s+/g, ' ').slice(0, 200)`);
    await b.evaluate(`window.__rc3 = []; RouteCompare.show = function (f, t) { __rc3.push([f, t]); }; document.getElementById('route-go').click(); 0`); await sleep(300);
    out.share.routed = await b.evaluate(`__rc3[0] || null`);
    out.share.from = await b.evaluate(`document.getElementById('route-from').value`);
    out.share.busan = /부산|KTX 경부/.test(out.share.autoResult);
    out.share.ok = !!out.share.routed && out.share.routed[0] === seoulSicheong && !out.share.busan && !!out.share.autoResult;
  }
  console.log('공유 링크', out.share.ok ? 'PASS' : 'FAIL', JSON.stringify(out.share));

  // E. 옛 링크 (?from=시청&to=강남, 이름만)
  await b.goto('about:blank', 200); await b.goto(BASE.replace('index.html', 'index.html?from=' + encodeURIComponent('시청') + '&to=' + encodeURIComponent('강남')) + '#normal', 800); await ready(b);
  await sleep(1500);
  const legacyAuto = await b.evaluate(`(document.getElementById('route-result').innerText || '').replace(/\\s+/g, ' ').slice(0, 300)`);
  await b.evaluate(`window.__rc4 = []; RouteCompare.show = function (f, t) { __rc4.push([f, t]); }; document.getElementById('route-go').click(); 0`); await sleep(300);
  out.legacy = { routed: await b.evaluate(`__rc4[0] || null`), autoResult: legacyAuto, busan: /부산|KTX 경부/.test(legacyAuto) };
  out.legacy.ok = !!out.legacy.routed && out.legacy.routed[0] === seoulSicheong && !out.legacy.busan && !!legacyAuto;
  console.log('옛 링크', out.legacy.ok ? 'PASS' : 'FAIL', JSON.stringify(out.legacy));

  // F. 역 상세 '여기서 출발' (지도에서 서울 시청 실클릭 → 패널 버튼 실클릭)
  await b.goto('about:blank', 200); await b.goto(BASE + '#normal', 800); await ready(b);
  await b.evaluate(`window.__rc5 = []; RouteCompare.show = (f, t) => { __rc5.push([f, t]); }; 0`);
  await b.evaluate(`(() => { const s = STATIONS.find(f => f.properties.id === '${seoulSicheong}'); map.jumpTo({ center: s.geometry.coordinates, zoom: 15 }); 0 })()`); await sleep(1800);
  const p = await b.evaluate(`(() => { const s = STATIONS.find(f => f.properties.id === '${seoulSicheong}'); const p = map.project(s.geometry.coordinates); const r = map.getCanvas().getBoundingClientRect(); return [r.x + p.x, r.y + p.y]; })()`);
  await b.click(p[0], p[1]); await sleep(1300);
  const head = await b.evaluate(`(document.querySelector('#sd-head h2, #sd-panel b')||{}).textContent || null`);
  const fb = await b.evaluate(`(() => { const e = document.querySelector('#sd-panel .sd-actions [data-act=from]'); if (!e) return null; e.scrollIntoView({block:'center'}); const r = e.getBoundingClientRect(); return [r.x + r.width/2, r.y + r.height/2]; })()`);
  if (fb) { await b.click(fb[0], fb[1]); await sleep(400); }
  await typeInto(b, 'route-to', '강남'); const t2 = (await acItems(b, 'route-to')).find(x => x.name === '강남'); if (t2) { await b.click(t2.x, t2.y); await sleep(150); }
  await b.evaluate(`document.getElementById('route-go').click(); 0`); await sleep(300);
  out.detail = { panelHead: head, clicked: !!fb, routed: await b.evaluate(`__rc5[__rc5.length - 1] || null`) };
  out.detail.ok = !!out.detail.routed && out.detail.routed[0] === seoulSicheong;
  console.log('역 상세 출발', out.detail.ok ? 'PASS' : 'FAIL', JSON.stringify(out.detail));

  out.exc = b.logs.filter(l => /EXC/.test(l)).slice(0, 10);
  console.log('예외', out.exc.length, out.exc.map(s => s.split('\n')[0]).join(' | '));
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(out, null, 1));
  b.close();
  const judged = [...Object.entries(out.names).map(([n, r]) => ['동명 ' + n, r.pass]),
    ['시청→강남', out.sicheong && out.sicheong.ok], ['공유 링크', out.share && out.share.ok], ['옛 링크', out.legacy && out.legacy.ok],
    ['역 상세 출발', out.detail && out.detail.ok], ['예외 0', out.exc.length === 0]];
  const fail = judged.filter(j => !j[1]);
  fail.forEach(j => console.log('[FAIL]', j[0]));
  console.log(`E2E-SUMMARY same-name-stations: pass ${judged.length - fail.length} fail ${fail.length} 미검증 0`);
  process.exitCode = fail.length ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
