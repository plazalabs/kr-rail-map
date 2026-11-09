/* e2e: 역 즐겨찾기를 역 ID 기준으로 (IMPL9 건 5)
 *  - 서울 시청·부산 시청을 각각 역 상세의 ⭐ 로 즐겨찾기 → 두 항목이 따로 저장·표시되고 섞이지 않는다
 *  - 사이드바 항목을 누르면 그 역이 열린다 / 한쪽을 해제해도 다른 쪽은 남는다
 *  - 옛 저장분(이름만 있는 즐겨찾기)도 그대로 열린다
 * 실행: node tests/e2e/run.js --only fav-stations
 */
'use strict';
const { launch, sleep, BASE, recorder, clickStation } = require('./lib/cdp');
const R = recorder('fav-stations');
const KEY = 'kr-rail-map-favorites-v1';

async function ready(b) {
  for (let i = 0; i < 120; i++) { await sleep(400); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&map.loaded()&&!!map.getLayer('rail-stations')`).catch(() => false)) break; }
  await sleep(600);
}
async function press(b, sel) {
  const i = await b.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({block:'center', inline:'nearest'});
    const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width/2, r.y + r.height/2);
    return { x: r.x + r.width/2, y: r.y + r.height/2, on: !!t && (t === e || e.contains(t)), top: t && (t.id || t.className || t.tagName) }; })()`);
  if (!i) return { ok: false, why: '요소 없음' };
  if (!i.on) return { ok: false, why: '가려짐(' + i.top + ')' };
  await b.click(i.x, i.y); await sleep(400);
  return { ok: true };
}
// 지도에서 그 역을 실제로 클릭해 역 상세를 연다
async function openOnMap(b, id) {
  await b.evaluate(`(() => { const s = STATIONS.find(f => f.properties.id === '${id}'); map.jumpTo({ center: s.geometry.coordinates, zoom: 15 }); 0 })()`);
  // 고정 1.8초 대기 뒤 눈감고 클릭하던 것을, 그 역이 클릭으로 잡힐 때까지 기다리게 (2026-11-09 FLAKY 원인)
  const c = await clickStation(b, id); await sleep(1200);
  return c.ok && b.evaluate(`document.getElementById('sd-panel').classList.contains('sd-open')`);
}
const favRows = b => b.evaluate(`[...document.querySelectorAll('#fav-list .fav-item')].filter(d => !/→/.test(d.textContent)).map(d => d.textContent.replace('✕', '').trim())`);
const stored = b => b.evaluate(`JSON.parse(localStorage.getItem('${KEY}') || '{}').stations || []`);
const centerNear = (b, id) => b.evaluate(`(() => { const s = STATIONS.find(f => f.properties.id === '${id}'); const c = map.getCenter(); return Math.hypot(c.lng - s.geometry.coordinates[0], c.lat - s.geometry.coordinates[1]) < 0.01; })()`);

(async () => {
  const b = await launch({ port: 9691, w: 1440, h: 1000 });
  await b.send('Network.setBypassServiceWorker', { bypass: true });
  await b.send('Network.setCacheDisabled', { cacheDisabled: true });
  await b.goto(BASE, 600); await b.evaluate(`localStorage.removeItem('${KEY}'); 0`);
  await b.goto('about:blank', 200); await b.goto(BASE + '#normal', 800); await ready(b);
  const I = await b.evaluate(`({ seoul: STATIONS.find(s => s.properties.name_ko === '시청' && s.properties.lines.includes('seoul-subway-line-2')).properties.id,
    busan: STATIONS.find(s => s.properties.name_ko === '시청' && s.properties.lines.includes('busan-metro-line-1')).properties.id })`);

  // 부산 역도 지도에 보이게 표시 범위를 '전국' 으로 (기본은 수도권)
  const sc = await press(b, '.scope-btn[data-scope=all]'); await sleep(800);
  // 1. 서울 시청 ⭐, 부산 시청 ⭐ (실클릭)
  const o1 = await openOnMap(b, I.seoul); const f1 = await press(b, '#sd-panel .sd-actions [data-act=fav]');
  await press(b, '#sd-close');
  const o2 = await openOnMap(b, I.busan); const f2 = await press(b, '#sd-panel .sd-actions [data-act=fav]');
  await press(b, '#sd-close');
  const st = await stored(b), rows = await favRows(b);
  R.check('서울·부산 시청 ⭐ 실클릭', sc.ok && o1 && o2 && f1.ok && f2.ok, { sc, o1, o2, f1, f2 });
  const ids = st.map(e => (e && e.id) || null);
  R.check('저장: 두 항목이 각각 역 ID 로 (섞이지 않음)', st.length === 2 && ids.includes(I.seoul) && ids.includes(I.busan), st);
  R.check('사이드바: 시청 두 줄이 서로 구분돼 표시', rows.length === 2 && new Set(rows).size === 2 && rows.every(r => r.startsWith('시청')), rows);

  // 2. 사이드바 항목 클릭 → 그 역
  for (const [k, id] of [['서울', I.seoul], ['부산', I.busan]]) {
    const idx = await b.evaluate(`[...document.querySelectorAll('#fav-list .fav-item')].findIndex(d => d.dataset.sid === '${id}')`);
    const r = idx >= 0 ? await press(b, `#fav-list .fav-item:nth-child(${idx + 2})`) : { ok: false, why: 'data-sid 항목 없음' };
    // 먼 거리 flyTo 는 몇 초 걸린다 — 최대 8초 동안 도착을 기다린다
    let near = false; for (let t = 0; t < 32 && !near; t++) { await sleep(250); near = await centerNear(b, id); }
    const open = await b.evaluate(`document.getElementById('sd-panel').classList.contains('sd-open')`);
    R.check(`사이드바 '${k} 시청' 클릭 → 그 역으로 이동·상세`, r.ok && near && open, { why: r.why, near, open });
    await press(b, '#sd-close');
  }

  // 3. 서울만 해제 → 부산은 남음
  const o3 = await openOnMap(b, I.seoul); const f3 = await press(b, '#sd-panel .sd-actions [data-act=fav]'); await press(b, '#sd-close');
  const st2 = await stored(b);
  // 열기·누르기 결과도 같이 남긴다 — 예전엔 안 남겨서 실패해도 앱 문제인지 클릭이 빗나간 건지 알 수 없었다
  R.check('서울 시청만 해제 → 부산 시청은 남음', o3 && f3.ok && st2.length === 1 && st2[0] && st2[0].id === I.busan, { o3, f3, st2 });

  // 4. 옛 저장분(이름만)
  await b.evaluate(`localStorage.setItem('${KEY}', JSON.stringify({ stations: ['시청', '강남'], routes: [] })); 0`);
  await b.goto('about:blank', 200); await b.goto(BASE + '#normal', 800); await ready(b);
  const rows3 = await favRows(b);
  R.check('옛 저장분: 두 항목이 그대로 보임', rows3.length === 2 && rows3[0].startsWith('시청') && rows3[1].startsWith('강남'), rows3);
  const gn = await b.evaluate(`STATIONS.find(s => s.properties.name_ko === '강남').properties.id`);
  const r4 = await press(b, '#fav-list .fav-item:nth-child(3)'); await sleep(1500);
  R.check("옛 저장분 '강남' 클릭 → 강남으로 이동·상세", r4.ok && await centerNear(b, gn) && await b.evaluate(`document.getElementById('sd-panel').classList.contains('sd-open')`), r4.why || '');
  await press(b, '#sd-close');
  const r5 = await press(b, '#fav-list .fav-item:nth-child(2)'); await sleep(1500);
  const opened = await b.evaluate(`document.getElementById('sd-panel').classList.contains('sd-open') && (document.querySelector('#sd-body b')||{}).textContent`);
  R.check("옛 저장분 '시청'(이름만) 클릭 → 시청 상세가 열림 (어느 시청인지는 옛 동작대로)", r5.ok && opened === '시청', opened);
  const exc = b.logs.filter(l => /EXC/.test(l));
  R.check('예외 0', exc.length === 0, exc.slice(0, 3));
  b.close();
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
