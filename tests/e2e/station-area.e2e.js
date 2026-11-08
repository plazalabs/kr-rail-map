/* e2e: 역세권 범위(근사) 레이어 — 토글·출구/역 좌표 기준·거리 ±1m·전환 복원·노선 필터·역 패널·✕·모바일 (IMPL5B)
 * 출처: 2026-11-07 세션 점검 스크립트 impl5b.js (실제 마우스·키 이벤트, 헤드리스 Chrome).
 * 실행: node tests/e2e/run.js --only station-area  (또는 E2E_BASE=<주소> node 이 파일)
 */
// IMPL5B 검증: 역세권 범위(근사) 레이어 — 실클릭 토글 / 방식별 그리기 / 거리 / 테마·배경 복원 / 위성 라벨 / 노선 필터 / ✕ / 역 패널 / 모바일
// cdp.js·impl1·impl6 방식 재사용
const { launch, sleep, BASE, outDir } = require('./lib/cdp');
const path = require('path'), fs = require('fs');
const OUT = outDir('station-area');
const out = { checks: [] };
function check(name, ok, detail) { out.checks.push({ name, ok: !!ok, detail }); console.log(ok ? 'PASS' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); }

async function ready(b) {
  for (let i = 0; i < 80; i++) { await sleep(400); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&map.loaded()&&!!map.getLayer('rail-lines')&&typeof StationArea!=='undefined'`).catch(() => false)) break; }
  await b.evaluate(`window.KR_loadExits && window.KR_loadExits(); 0`).catch(() => {});   // 출구 지연 로딩(IMPL12 건 4) — 먼저 받게 함
  for (let i = 0; i < 20; i++) { if (await b.evaluate(`StationExits.isReady()`).catch(() => false)) break; await sleep(500); }
}
const idle = b => b.evaluate(`new Promise(r => { let done = false; const f = () => { if (!done) { done = true; r(); } }; map.once('idle', f); setTimeout(f, 6000); })`).then(() => sleep(300));
const rendered = (b) => b.evaluate(`(() => { const o = {}; for (const id of ['station-area-fill','station-area-r1','station-area-r2','station-area-label-r1','station-area-label-r2']) o[id] = map.getLayer(id) ? map.queryRenderedFeatures({ layers: [id] }).length : -1; return o; })()`);
async function clickSel(b, sel) {
  const c = await b.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({block:'center'}); const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width/2, r.y + r.height/2); return [r.x + r.width/2, r.y + r.height/2, t === e || e.contains(t) || (t && t.contains && t.contains(e))]; })()`);
  if (!c) return 'missing';
  await b.click(c[0], c[1]); return c[2] ? 'mouse' : 'mouse(가림?)';
}

(async () => {
  const b = await launch({ port: 9651, w: 1440, h: 1000 });
  await b.send('Network.setBypassServiceWorker', { bypass: true });
  await b.send('Network.setCacheDisabled', { cacheDisabled: true });
  await b.goto(BASE, 600); await b.evaluate(`localStorage.setItem('krrail-theme','light'); 0`);
  await b.goto('about:blank', 200); await b.goto(BASE + '#normal', 800); await ready(b);

  // 1. 사이드바 체크박스 실클릭
  const how = await clickSel(b, '#layer-station-area'); await sleep(500);
  const st1 = await b.evaluate(`({ checked: document.getElementById('layer-station-area').checked, legend: !document.getElementById('sa-legend').hidden, hint: !document.getElementById('sa-hint').hidden, zoom: map.getZoom(), legendText: document.getElementById('sa-legend').innerText.replace(/\\s+/g,' ') })`);
  check('토글 실클릭 → 켜짐·범례 표시', st1.checked && st1.legend, { how, ...st1, legendText: st1.legendText.slice(0, 120) });
  check('줌 14 미만 안내 표시', st1.hint, st1.zoom.toFixed(1));
  check('범례에 근사 표기', /승강장 경계 기준이 아닌 근사 표시/.test(st1.legendText));

  // 2. 강남 z15
  const gangnam = await b.evaluate(`STATIONS.find(s => s.properties.name_ko === '강남' && (s.properties.lines||[]).includes('seoul-subway-line-2')).properties.id`);
  await b.evaluate(`(() => { const s = STATIONS.find(x => x.properties.id === '${gangnam}'); map.jumpTo({ center: s.geometry.coordinates, zoom: 15 }); 0 })()`); await idle(b);
  let r = await rendered(b);
  const src = await b.evaluate(`(() => { const d = map.getSource('station-area')._data; const fs = (d && d.features) || []; const k = {}; fs.forEach(f => { k[f.properties.kind] = (k[f.properties.kind]||0) + 1; }); return { n: fs.length, kinds: k, hasGangnam: fs.some(f => f.properties.sid === '${gangnam}'), gk: (fs.find(f => f.properties.sid === '${gangnam}')||{properties:{}}).properties.kind }; })()`);
  check('강남 z15: 범위가 그려짐 (fill·1차·2차 선)', r['station-area-fill'] > 0 && r['station-area-r1'] > 0 && r['station-area-r2'] > 0, { rendered: r, source: src });
  check('강남 z15: 거리 라벨(250m/350m) 표시', r['station-area-label-r1'] > 0 && r['station-area-label-r2'] > 0, r);
  check('강남은 출구 기준(exit)', src.gk === 'exit', src.gk);
  check('줌 14 이상이면 안내 숨김', await b.evaluate(`document.getElementById('sa-hint').hidden`));
  await b.shot(path.join(OUT, `gangnam-z15.png`));

  // 3. 출구 없는 역 (수도권 안에서 하나)
  const noExit = await b.evaluate(`(() => { const s = STATIONS.find(x => { const c = x.geometry.coordinates; return c[1] > 37.4 && c[1] < 37.7 && c[0] > 126.8 && c[0] < 127.2 && StationExits.exitsOf(x.properties.id).length === 0; }); return s ? { id: s.properties.id, name: s.properties.name_ko, c: s.geometry.coordinates } : null; })()`);
  if (noExit) {
    await b.evaluate(`map.jumpTo({ center: [${noExit.c}], zoom: 15 }); 0`); await idle(b);
    const k = await b.evaluate(`(() => { const fs = map.getSource('station-area')._data.features.filter(f => f.properties.sid === '${noExit.id}'); return fs.map(f => f.properties.kind + ':' + f.properties.r); })()`);
    const rr = await rendered(b);
    check('출구 없는 역은 역 좌표 기준(center)', k.length === 2 && k.every(x => x.startsWith('center')), { station: noExit.name, k, rendered: rr['station-area-r1'] });
    await b.shot(path.join(OUT, `center-${noExit.name}.png`));
  } else check('출구 없는 역 표본 찾기', false, '수도권에 없음');

  // 4. 거리 실측: 표본 역들의 '실제로 지도에 넣은' 기하에서 꼭짓점·변 중점 오차
  const sampleNames = ['강남', '서울', '고속터미널', '잠실', '홍대입구'];
  const dist = await b.evaluate(`(() => { const D = StationArea._debug; const R = Math.PI/180; const res = [];
    const picks = ${JSON.stringify(sampleNames)}.map(n => STATIONS.filter(s => s.properties.name_ko === n).find(s => s.geometry.coordinates[1] > 37.3 && s.geometry.coordinates[1] < 37.8)).filter(Boolean);
    ${noExit ? `picks.push(STATIONS.find(s => s.properties.id === '${noExit.id}'));` : ''}
    for (const s of picks) {
      const anc = D.approxAnchors(s, id => StationExits.exitsOf(id));
      const feats = D.featuresFor([s]);
      for (const f of feats) { const r = f.properties.r; let wv = 0, wm = 0, nv = 0;
        const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
        for (const p of polys) for (const ring of p) for (let i = 0; i < ring.length - 1; i++) {
          const v = ring[i], m = [(ring[i][0] + ring[i+1][0]) / 2, (ring[i][1] + ring[i+1][1]) / 2];
          const dv = Math.min(...anc.points.map(q => D.hav(q[0], q[1], v[0], v[1]))) - r;
          const dm = Math.min(...anc.points.map(q => D.hav(q[0], q[1], m[0], m[1]))) - r;
          nv++; if (Math.abs(dv) > Math.abs(wv)) wv = dv; if (Math.abs(dm) > Math.abs(wm)) wm = dm; }
        res.push({ name: s.properties.name_ko, kind: anc.kind, anchors: anc.points.length, r, verts: nv, maxVertErr: +wv.toFixed(3), maxMidErr: +wm.toFixed(3) }); }
    } return res; })()`);
  dist.forEach(d => check(`거리 ${d.name}(${d.kind}, 기준점 ${d.anchors}) ${d.r}m: 꼭짓점 ±1m·변 중점 ±1m`, Math.abs(d.maxVertErr) <= 1 && Math.abs(d.maxMidErr) <= 1, d));

  // 5. 테마·배경 전환 후 복원 (+ 위성 라벨)
  await b.evaluate(`(() => { const s = STATIONS.find(x => x.properties.id === '${gangnam}'); map.jumpTo({ center: s.geometry.coordinates, zoom: 15 }); 0 })()`); await idle(b);
  for (const [kind, target] of [['theme', 'dark'], ['style', 'satellite'], ['style', 'gray'], ['theme', 'light'], ['style', 'normal']]) {
    const sel = kind === 'theme' ? `#theme-row .theme-btn[data-theme=${target}]` : `#toolbar [data-style=${target}]`;
    const h = await clickSel(b, sel); await sleep(1500); await idle(b);
    const rr = await rendered(b);
    const chk = await b.evaluate(`document.getElementById('layer-station-area').checked && !document.getElementById('sa-legend').hidden`);
    const ok = rr['station-area-r1'] > 0 && rr['station-area-r2'] > 0 && rr['station-area-fill'] > 0 && chk;
    check(`${kind}:${target} 후 복원`, ok, { how: h, rendered: rr, toggleOn: chk });
    if (target === 'satellite') {
      check('위성에서 거리 라벨 표시', rr['station-area-label-r1'] > 0 && rr['station-area-label-r2'] > 0, rr);
      await b.shot(path.join(OUT, `satellite.png`));
    }
  }

  // 6. 노선 필터 연동: 강남의 line_id 노선 체크 해제 → 강남 범위가 화면에서 빠지는지 (역 점과 함께)
  const lid = await b.evaluate(`STATIONS.find(s => s.properties.id === '${gangnam}').properties.line_id`);
  const sidsBefore = await b.evaluate(`[...new Set(map.queryRenderedFeatures({ layers: ['station-area-r1'] }).map(f => f.properties.sid))]`);
  const cbSel = `#line-list label.line-item[data-line-id="${lid}"] input[type=checkbox]`;
  const hasCb = await b.evaluate(`!!document.querySelector(${JSON.stringify(cbSel)})`);
  let filt = null;
  if (hasCb) {
    await b.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(cbSel)}); const d = e.closest('details'); if (d) d.open = true; 0 })()`); await sleep(200);
    const h = await clickSel(b, cbSel); await sleep(800); await idle(b);
    const sidsAfter = await b.evaluate(`[...new Set(map.queryRenderedFeatures({ layers: ['station-area-r1'] }).map(f => f.properties.sid))]`);
    const dotAfter = await b.evaluate(`map.queryRenderedFeatures({ layers: ['rail-stations'] }).some(f => f.properties.id === '${gangnam}')`);
    filt = { how: h, lid, before: sidsBefore.includes(gangnam), after: sidsAfter.includes(gangnam), dotAfter };
    // IMPL12 건 1: 환승역은 지나는 노선(lines) 중 하나라도 켜져 있으면 보인다. 강남은 2호선+신분당선이라
    // 대표 노선(2호선)만 꺼도 신분당선이 켜져 있으면 남는다. 범위와 역 점은 같은 기준으로 움직여야 한다.
    const others = await b.evaluate(`STATIONS.find(s => s.properties.id === '${gangnam}').properties.lines.filter(l => l !== '${lid}')`);
    check('대표 노선만 끄면 환승역(강남)은 범위·점 모두 남음 (다른 노선이 켜져 있음, 역 점과 같은 기준)',
      filt.before && filt.after && filt.dotAfter && others.length > 0, Object.assign({ others }, filt));
    // 나머지 노선까지 다 끄면 범위·점 모두 빠진다
    for (const o of others) {
      const sel = `#line-list label.line-item[data-line-id="${o}"] input[type=checkbox]`;
      await b.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (e) { const d = e.closest('details'); if (d) d.open = true; } 0 })()`);
      await clickSel(b, sel); await sleep(500);
    }
    await idle(b);
    const allOffArea = await b.evaluate(`map.queryRenderedFeatures({ layers: ['station-area-r1'] }).some(f => f.properties.sid === '${gangnam}')`);
    const allOffDot = await b.evaluate(`map.queryRenderedFeatures({ layers: ['rail-stations'] }).some(f => f.properties.id === '${gangnam}')`);
    check('지나는 노선을 모두 끄면 범위도 빠짐 (역 점과 같은 기준)', !allOffArea && !allOffDot, { allOffArea, allOffDot });
    for (const o of others) {
      await clickSel(b, `#line-list label.line-item[data-line-id="${o}"] input[type=checkbox]`); await sleep(400);
    }
    await clickSel(b, cbSel); await sleep(800); await idle(b);
    const back = await b.evaluate(`map.queryRenderedFeatures({ layers: ['station-area-r1'] }).some(f => f.properties.sid === '${gangnam}')`);
    check('노선 다시 체크 → 범위 복귀', back);
  } else {
    const cbs = await b.evaluate(`[...document.querySelectorAll('#line-list input[type=checkbox]')].slice(0,3).map(e => e.outerHTML.slice(0,160))`);
    check('노선 체크박스 찾기', false, cbs);
  }

  // 7. 역 패널 한 줄 (강남 실클릭)
  await b.evaluate(`(() => { const s = STATIONS.find(x => x.properties.id === '${gangnam}'); map.jumpTo({ center: s.geometry.coordinates, zoom: 15 }); 0 })()`); await idle(b);
  const p = await b.evaluate(`(() => { const s = STATIONS.find(x => x.properties.id === '${gangnam}'); const p = map.project(s.geometry.coordinates); const r = map.getCanvas().getBoundingClientRect(); return [r.x + p.x, r.y + p.y]; })()`);
  await b.click(p[0], p[1]); await sleep(1200);
  const panel = await b.evaluate(`(() => { const sec = [...document.querySelectorAll('#sd-panel .sd-sec')].find(e => /역세권 범위/.test(e.innerText)); return { open: document.getElementById('sd-panel').classList.contains('sd-open'), text: sec ? sec.innerText.replace(/\\s+/g, ' ') : null, sum: StationArea.summaryOf('${gangnam}') }; })()`);
  check('역 패널에 역세권 한 줄', panel.open && panel.text && /1차\(250m\) 안 출구 \d+개 · 다른 역 \d+개/.test(panel.text), panel);
  await b.shot(path.join(OUT, `panel.png`));
  await b.evaluate(`document.getElementById('sd-close') && document.getElementById('sd-close').click(); 0`); await sleep(300);

  // 8. 범례 ✕ 실클릭 → 끄기
  const hx = await clickSel(b, '#sa-legend .sa-close'); await sleep(500);
  const off = await b.evaluate(`({ checked: document.getElementById('layer-station-area').checked, legend: !document.getElementById('sa-legend').hidden, layers: ['station-area-fill','station-area-r1','station-area-r2'].filter(id => !!map.getLayer(id)) })`);
  check('범례 ✕ → 토글 해제·레이어 제거·범례 숨김', !off.checked && !off.legend && off.layers.length === 0, { how: hx, ...off });

  // 9. 콘솔 오류
  out.errors = b.logs.filter(l => /EXC|\[error\]/.test(l)).map(s => s.split('\n')[0]);
  check('콘솔 오류 0', out.errors.length === 0, out.errors.slice(0, 5));
  b.close(); await sleep(800);

  // 10. 모바일 390: 사이드바 열고 토글 → 범례 위치
  const m = await launch({ port: 9652, w: 390, h: 844, mobile: true });
  await m.send('Network.setBypassServiceWorker', { bypass: true });
  await m.goto(BASE + '#normal', 800); await ready(m);
  await clickSel(m, '#sidebar-toggle'); await sleep(600);
  const mh = await clickSel(m, '#layer-station-area'); await sleep(400);
  await clickSel(m, '#sidebar-close'); await sleep(500);
  await m.evaluate(`(() => { const s = STATIONS.find(x => x.properties.id === '${gangnam}'); map.jumpTo({ center: s.geometry.coordinates, zoom: 15 }); 0 })()`); await idle(m);
  const mob = await m.evaluate(`(() => { const r = document.getElementById('sa-legend').getBoundingClientRect(); const t = document.getElementById('sidebar-toggle').getBoundingClientRect(); const tb = document.getElementById('toolbar').getBoundingClientRect(); return { legend: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], inView: r.right <= innerWidth && r.bottom <= innerHeight && r.x >= 0, overlapsToggle: !(r.right < t.left || r.left > t.right || r.bottom < t.top || r.top > t.bottom), overlapsToolbar: r.bottom > tb.top, n: map.queryRenderedFeatures({ layers: ['station-area-r1'] }).length }; })()`);
  check('모바일 390: 범례가 화면 안·토글/툴바와 안 겹침·범위 그려짐', mob.inView && !mob.overlapsToggle && !mob.overlapsToolbar && mob.n > 0, { how: mh, ...mob });
  await m.shot(path.join(OUT, `mobile.png`));
  m.close();

  const s = out.checks.reduce((a, c) => (a[c.ok ? 0 : 1]++, a), [0, 0]);
  console.log('SUMMARY pass', s[0], 'fail', s[1]);
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(out, null, 1));
  console.log(`E2E-SUMMARY station-area: pass ${s[0]} fail ${s[1]} 미검증 0`);
  process.exitCode = s[1] ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
