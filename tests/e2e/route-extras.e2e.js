/* e2e: 길찾기 동명역 보조 — 옛 링크 해석·키보드 선택·역 ID 유지·⇄ 교체·즐겨찾기 경로 저장/복원 (IMPL3)
 * 출처: 2026-11-07 세션 점검 스크립트 impl3-extra.js. 원본은 값만 찍었고, 여기서 판정을 붙였다.
 * 기대값은 구현보고_IMPL3_20261107.md 의 실측 결과와 같다.
 * 실행: node tests/e2e/run.js --only route-extras  (또는 E2E_BASE=<주소> node 이 파일)
 */
'use strict';
const { launch, sleep, BASE, recorder } = require('./lib/cdp');
const R = recorder('route-extras');
(async () => {
  const b = await launch({ port: 9622, w: 1440, h: 1000 });
  await b.send('Network.setBypassServiceWorker', { bypass: true }); await b.send('Network.setCacheDisabled', { cacheDisabled: true });
  const ready = async () => { for (let i = 0; i < 80; i++) { await sleep(400); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&map.loaded()&&typeof RouteCompare!=='undefined'`).catch(() => false)) break; } await sleep(800); };
  const ev = s => b.evaluate(s);
  const ids = async () => ev(`(() => { const f = n => STATIONS.filter(s => s.properties.name_ko === n);
    return { seoulSi: f('시청').find(s => s.properties.lines.includes('seoul-subway-line-2')).properties.id,
      busanSi: f('시청').find(s => s.properties.lines.includes('busan-metro-line-1')).properties.id,
      seoulGyo: f('교대').find(s => s.properties.lines.includes('seoul-subway-line-2')).properties.id,
      gangnam: f('강남').find(s => s.properties.lines.includes('seoul-subway-line-2')).properties.id }; })()`);

  // 1. 옛 링크(이름만) — 서울 시청으로 해석 + 상태줄 안내
  await b.goto(BASE + '?from=' + encodeURIComponent('시청') + '&to=' + encodeURIComponent('강남') + '#normal', 800); await ready(); await sleep(1500);
  const I = await ids();
  const leg = await ev(`({ status: document.getElementById('status').textContent, sid: document.getElementById('route-from').dataset.sid || null })`);
  R.check('옛 링크 ?from=시청&to=강남 → 서울 시청 ID', leg.sid === I.seoulSi, leg);
  R.check('옛 링크 → 동명역 해석 안내 문구', /동명역/.test(leg.status), leg.status);

  // 2. 키보드: 시청 입력 → ↓↓ Enter = 두 번째 항목(서울 시청)
  await b.goto('about:blank', 200); await b.goto(BASE + '#normal', 800); await ready();
  await ev(`localStorage.removeItem('kr-rail-map-favorites-v1'); document.getElementById('route-panel').hidden = false; 0`);
  const c = await ev(`(() => { const r = document.getElementById('route-from').getBoundingClientRect(); return [r.x + 20, r.y + r.height/2]; })()`);
  await b.click(c[0], c[1]); await b.type('시청'); await sleep(300);
  const labels = await ev(`[...document.querySelectorAll('#route-from ~ .ac-list .ac-item, #route-from + .ac-list .ac-item')].slice(0, 3).map(e => e.innerText.replace(/\\s+/g,' '))`);
  await b.key('ArrowDown', 'ArrowDown', 40); await b.key('ArrowDown', 'ArrowDown', 40); await b.key('Enter', 'Enter', 13); await sleep(200);
  const kb = await ev(`({ v: document.getElementById('route-from').value, sid: document.getElementById('route-from').dataset.sid || null })`);
  R.check('키보드 ↓↓Enter → 두 번째 항목(서울 시청) ID 저장', kb.v === '시청' && kb.sid === I.seoulSi, { labels, kb });

  // 3. ID 로 지정한 '먼 쌍'(부산 시청 → 서울 교대)이 근접 추정에 덮이지 않음
  await ev(`setRouteStation(document.getElementById('route-from'), stationById('${I.busanSi}')); setRouteStation(document.getElementById('route-to'), stationById('${I.seoulGyo}')); window.__rc=[]; RouteCompare.show=(f,t)=>__rc.push([f,t]); document.getElementById('route-go').click(); 0`);
  const far = await ev(`__rc[0] || null`);
  R.check('ID 지정 먼 쌍 유지', !!far && far[0] === I.busanSi && far[1] === I.seoulGyo, far);

  // 4. 경로 저장 → fromId/toId 함께 저장
  await ev(`document.getElementById('route-save').click(); 0`); await sleep(200);
  const saved = await ev(`JSON.parse(localStorage.getItem('kr-rail-map-favorites-v1') || '{}')`);
  const r0 = (saved.routes || [])[0] || {};
  R.check('즐겨찾기 경로에 fromId/toId 저장', r0.fromId === I.busanSi && r0.toId === I.seoulGyo, r0);

  // 5. ⇄ 교체 → ID 도 맞바뀜
  await ev(`document.getElementById('route-swap').click(); __rc=[]; document.getElementById('route-go').click(); 0`);
  const sw = await ev(`__rc[0] || null`);
  R.check('⇄ 교체 → ID 도 맞바뀜', !!sw && sw[0] === I.seoulGyo && sw[1] === I.busanSi, sw);

  // 6. 즐겨찾기 항목 클릭 → 저장한 ID 로 복원
  await ev(`setRouteStation(document.getElementById('route-from'), ''); setRouteStation(document.getElementById('route-to'), ''); renderFavorites(); 0`);
  await ev(`__rc=[]; [...document.querySelectorAll('.fav-item')].find(d => d.textContent.includes('시청 → 교대')).click(); 0`); await sleep(200);
  const fv = await ev(`__rc[0] || null`);
  R.check('즐겨찾기 복원 → 저장한 ID', !!fv && fv[0] === I.busanSi && fv[1] === I.seoulGyo, fv);

  // 7. 옛 즐겨찾기(이름만) → 서울 시청 → 강남
  await ev(`favorites.routes = [{ from: '시청', to: '강남' }]; renderFavorites(); __rc=[]; [...document.querySelectorAll('.fav-item')].find(d => d.textContent.includes('시청 → 강남')).click(); 0`); await sleep(200);
  const old = await ev(`__rc[0] || null`);
  R.check('옛 즐겨찾기(이름만) → 서울 시청 → 강남', !!old && old[0] === I.seoulSi && old[1] === I.gangnam, old);

  const exc = b.logs.filter(l => /EXC/.test(l));
  R.check('예외 0', exc.length === 0, exc.slice(0, 3));
  b.close();
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
