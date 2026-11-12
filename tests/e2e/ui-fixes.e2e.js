/* e2e: IMPL7 수정분 — 노선 비교(④)·노선도 카드 출발/도착(⑤)·노선도 켠 상태 툴바(⑥)·영향권 버튼(⑧)·?style=local(⑨)·
 *      테마/배경 전환 후 그린 노선·내 위치 점 유지
 * 출처: 2026-11-07 세션 점검 스크립트 impl7.js (sweep.js 의 info/press, impl1/impl3 절차 재사용).
 * 실행: node tests/e2e/run.js --only ui-fixes   (모바일 390×844: --only ui-fixes-mobile, 또는 MOBILE=1)
 *       ONLY=4,5,6,8,9,D 로 일부만.
 */
'use strict';
const { launch, sleep, BASE, outDir, ensureToolbar } = require('./lib/cdp');
const fs = require('fs'), path = require('path');
const LABEL = process.env.MOBILE === '1' ? 'ui-fixes-mobile' : 'ui-fixes';
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const OUT = outDir(LABEL); fs.mkdirSync(path.join(OUT, 'dl'), { recursive: true });
const R = { label: LABEL, base: BASE, items: {} };
let b; const ev = s => b.evaluate(s);
const res = [];
function rec(sec, item, ok, note) { res.push({ sec, item, ok, note }); console.log(`[${ok === null ? '미검증' : ok ? 'PASS' : 'FAIL'}] ${sec} / ${item} — ${note || ''}`); }

async function info(sel) {
  return ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return {exists:false};
    const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
    const inVp = r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
    const visible = r.width > 0 && r.height > 0 && inVp && cs.visibility !== 'hidden' && cs.display !== 'none' && !e.closest('[hidden]');
    const cx = r.x + r.width/2, cy = r.y + r.height/2; const top = document.elementFromPoint(cx, cy);
    return {exists:true, visible, cx, cy, onTop: !!top && (top === e || e.contains(top)), topDesc: top ? (top.id || String(top.className && top.className.baseVal !== undefined ? top.className.baseVal : top.className) || top.tagName) : null}; })()`);
}
async function press(sel, { scroll = true } = {}) {
  await ensureToolbar(b, sel);
  if (scroll) { await ev(`(e => { if (e && e.scrollIntoView) e.scrollIntoView({block:'center', inline:'nearest'}); 0 })(document.querySelector(${JSON.stringify(sel)}))`); await sleep(120); }
  const i = await info(sel);
  if (!i.exists) return { ok: false, why: '요소 없음' };
  if (!i.visible) return { ok: false, why: '보이지 않음' };
  if (!i.onTop) return { ok: false, why: '가려짐(' + String(i.topDesc).slice(0, 40) + ')' };
  await b.click(i.cx, i.cy); await sleep(350);
  return { ok: true };
}
// 모바일: 사이드바(테마·범위·나의 노선)는 서랍 안 — ☰ 로 열고 누른 뒤 ✕ 로 닫는다 (실제 클릭)
async function sidePress(sel) {
  if (process.env.MOBILE !== '1') return press(sel);
  const o = await press('#sidebar-toggle');
  // 서랍이 미끄러져 들어오는 동안은 버튼 위치가 바뀐다 — 보이고 맨 위에 올 때까지 기다린다 (최대 3초)
  for (let i = 0; i < 20; i++) { await sleep(150); const i2 = await info(sel); if (i2.visible && i2.onTop) break; }
  await sleep(150);
  const r = await press(sel); await sleep(300);
  const c = await press('#sidebar-close'); await sleep(400);
  if (!o.ok) return { ok: false, why: '☰ ' + o.why };
  if (r.ok && !c.ok) return { ok: false, why: '서랍 닫기 ' + c.why };
  return r;
}
// 툴바 메뉴의 칸 번호(nth-child) — 숫자를 박아 두면 툴바에 버튼이 하나만 늘어도 시험 23개가 깨진다(v109).
// 페이지를 열 때마다 메뉴 이름으로 다시 센다 (ready() 끝에서 syncDrop).
const DROP = { '도구': 0, '분석': 0, '저장': 0 };
async function syncDrop() {
  const m = await ev(`(() => { const o = {}; [...document.getElementById('toolbar').children].forEach((x, i) => { const d = x.classList.contains('tb-dropdown') && x.querySelector('.tb-dropbtn'); if (d) o[d.textContent.trim().replace(/\s.*$/, '')] = i + 1; }); return o; })()`).catch(() => ({}));
  Object.keys(DROP).forEach(k => { if (m[k]) DROP[k] = m[k]; });
}
async function menu(label, btnId) {
  const o = await press(`#toolbar > .tb-dropdown:nth-child(${DROP[label]}) .tb-dropbtn`); if (!o.ok) return { ok: false, why: label + ' 버튼 ' + o.why };
  await sleep(250);
  const r = await press('#' + btnId); if (!r.ok) return { ok: false, why: btnId + ' ' + r.why };
  return r;
}
async function ready() {
  for (let i = 0; i < 80; i++) { await sleep(500); if (await ev(`typeof dataReady!=='undefined'&&dataReady&&map.loaded()&&!!map.getLayer('rail-lines')`).catch(() => false)) break; }
  await ev(`window.KR_loadExits && window.KR_loadExits(); 0`).catch(() => {});   // 출구 지연 로딩(IMPL12 건 4) — 먼저 받게 함
  for (let i = 0; i < 20; i++) { if (await ev(`!!map.getLayer('station-exits')`).catch(() => false)) break; await sleep(500); }
  await sleep(800);
  await syncDrop();
}
async function fresh(url) {
  await b.goto('about:blank', 200);
  await b.send('Page.navigate', { url: url || BASE }); await ready();
}
const want = s => !ONLY.length || ONLY.includes(s);

(async () => {
  b = await launch(process.env.MOBILE === '1' ? { port: 9612, w: 390, h: 844, mobile: true } : { port: 9610 });
  await b.send('Network.setBypassServiceWorker', { bypass: true });
  await b.send('Network.setCacheDisabled', { cacheDisabled: true });
  const downloads = []; const reqs = [];
  await b.send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: path.join(OUT, 'dl'), eventsEnabled: true }).catch(() => {});
  b.handlers.push(m => {
    if (m.method === 'Browser.downloadWillBegin' || m.method === 'Page.downloadWillBegin') downloads.push(m.params.suggestedFilename);
    if (m.method === 'Network.responseReceived') reqs.push(m.params.response.status + ' ' + m.params.response.url);
  });
  // 처음 한 번 열어 localStorage 초기화
  await b.goto(BASE, 800); await ev(`localStorage.clear(); 0`);
  await fresh();

  /* ── ④ 노선 비교 ── */
  if (want('4')) {
    const r = await menu('분석', 'compare-btn'); await sleep(600);
    const n = await ev(`({ lines: LINES.length, o0: document.getElementById('lc-sel0') ? document.getElementById('lc-sel0').options.length : -1, o1: document.getElementById('lc-sel1') ? document.getElementById('lc-sel1').options.length : -1,
      names: document.getElementById('lc-sel0') ? [...document.getElementById('lc-sel0').options].slice(0, 4).map(o => o.textContent) : [] })`);
    R.items.compare = { open: r, ...n };
    rec('④ 노선 비교', '선택 상자 옵션 수', n.o0 - 1 === n.lines && n.o1 - 1 === n.lines, `LINES ${n.lines} / sel0 ${n.o0} / sel1 ${n.o1} (첫 항목 '노선 선택…' 포함) 예: ${n.names.join(', ')}`);
    // 실제 조작: 선택 상자를 마우스로 눌러 포커스 → 키보드(↓)로 고른다
    const picked = [];
    for (const [k, downs] of [[0, 3], [1, 6]]) {
      const p = await press('#lc-sel' + k);
      await b.key('Escape', 'Escape', 27); await sleep(150); // 열린 목록 닫기 (포커스 유지)
      const focused = await ev(`document.activeElement && document.activeElement.id`);
      for (let i = 0; i < downs; i++) { await b.key('ArrowDown', 'ArrowDown', 40); await sleep(80); }
      await sleep(400);
      picked.push(await ev(`(s => ({ press: ${JSON.stringify(p.ok)}, focused: ${JSON.stringify(focused)}, idx: s ? s.selectedIndex : -1, text: s && s.selectedIndex >= 0 ? s.options[s.selectedIndex].textContent : null }))(document.getElementById('lc-sel${k}'))`));
    }
    const body = await ev(`(document.getElementById('lc-body') || document.getElementById('lc-panel') || {innerText: ''}).innerText`);
    const kmNums = (body.match(/[\d.]+\s*km/g) || []);
    R.items.compare.picked = picked; R.items.compare.body = body.slice(0, 600);
    rec('④ 노선 비교', '두 노선 선택(마우스+키보드)', picked.every(p => p.idx > 0), JSON.stringify(picked));
    rec('④ 노선 비교', '비교 결과 계산', kmNums.length >= 2 && /길이 차이/.test(body), `km 값 ${kmNums.slice(0, 4).join(' / ')} · ${(body.match(/길이 차이[^\n]*/) || [''])[0]}`);
    await b.shot(path.join(OUT, '4-compare.png'));
    await press('#lc-close'); await sleep(300);
  }

  /* ── ⑤ 노선도 카드 출발·도착 ── */
  if (want('5')) {
    R.items.card = [];
    for (const [nm, which, nth] of [['홍대입구', 'from', 0], ['서울', 'to', 0], ['시청', 'from', 0], ['시청', 'to', 1], ['시청', 'from', 2]]) {
      await fresh();
      await ev(`document.getElementById('route-from').value=''; document.getElementById('route-to').value=''; 0`);
      if (nm === '시청') { await sidePress('.scope-btn[data-scope=all]'); await sleep(1200); }
      const o = await press('#diagram-btn'); await sleep(2500);
      // 대상 역 노드 — 동명역은 nth 번째 노드
      const tgt = await ev(`(() => { const gs = [...document.querySelectorAll('#diagram-overlay .dg-station')].filter(g => g.dataset.name === ${JSON.stringify(nm)});
        const g = gs[${nth}]; if (!g) return { n: gs.length };
        const sc = document.querySelector('#diagram-overlay .dg-scroll'); const sr = sc.getBoundingClientRect(); let r = g.getBoundingClientRect();
        sc.scrollLeft += (r.x + r.width/2) - (sr.x + sr.width/2); sc.scrollTop += (r.y + r.height/2) - (sr.y + sr.height/2);
        r = g.getBoundingClientRect();
        const t = document.elementFromPoint(r.x + r.width/2, r.y + r.height/2); const tg = t && t.closest('.dg-station');
        return { n: gs.length, topIsTarget: tg === g, topName: tg ? tg.dataset.name : (t && t.tagName), x: r.x + r.width/2, y: r.y + r.height/2, sid: g.dataset.sid || null, lines: g.dataset.lines }; })()`);
      if (!tgt || tgt.x === undefined) { rec('⑤ 노선도 카드', `${nm}(${nth}) ${which}`, null, '노드 없음 ' + JSON.stringify(tgt)); continue; }
      await sleep(300);
      if (!tgt.topIsTarget) { rec('⑤ 노선도 카드', `${nm}(${nth}) ${which}`, null, '클릭 지점 최상단 노드가 다른 역(' + tgt.topName + ') — 노드 겹침'); continue; }
      await b.click(tgt.x, tgt.y); await sleep(600);
      const bi = await info(`#diagram-overlay [data-act=${which}]`);
      if (!bi.exists) { rec('⑤ 노선도 카드', `${nm}(${nth}) ${which}`, false, '카드 안 뜸'); continue; }
      await b.click(bi.cx, bi.cy); await sleep(1200);
      const st = await ev(`(() => { const el = document.getElementById('route-${which}'); const sid = el.dataset.sid || null; const s = sid ? STATIONS.find(f => f.properties.id === sid) : null;
        return { value: el.value, sid, sidLines: s ? (s.properties.lines || s.properties.line_ids || []) : null, sidLL: s ? s.geometry.coordinates.map(v => +v.toFixed(3)) : null,
          routeOpen: !document.getElementById('route-panel').hidden, diagram: !!document.getElementById('diagram-overlay'),
          dgBtnActive: document.getElementById('diagram-btn').classList.contains('active') }; })()`);
      const row = { nm, which, nth, nodes: tgt.n, nodeLines: tgt.lines, nodeSid: tgt.sid, cardOnTop: bi.onTop, ...st };
      R.items.card.push(row);
      const lineOk = !st.sid ? false : (tgt.lines || '').split(',').some(l => JSON.stringify(st.sidLines || []).includes(l));
      if (nm === '시청' && nth === 2 && which === 'from' && st.routeOpen) {
        // 서울 시청을 카드로 지정한 뒤 강남까지 실제 경로 — 부산으로 해석되지 않는지
        await ev(`window.__rc7 = []; const o = RouteCompare.show; RouteCompare.show = function (f, t) { __rc7.push([f, t]); return o.apply(this, arguments); }; 0`);
        await press('#route-to'); await ev(`document.getElementById('route-to').value=''; 0`); await b.type('강남'); await sleep(600);
        const ti = await ev(`(() => { const e = [...document.getElementById('route-to').parentElement.querySelectorAll('.ac-list:not([hidden]) .ac-item')].find(e => (e.childNodes[0] && e.childNodes[0].nodeType === 3 ? e.childNodes[0].textContent : e.innerText).trim() === '강남'); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x + 30, r.y + r.height/2]; })()`);
        if (ti) { await b.click(ti[0], ti[1]); await sleep(200); }
        await press('#route-go'); await sleep(2500);
        const rt = await ev(`({ f: __rc7[0] && __rc7[0][0], txt: (document.getElementById('route-result').innerText || '').replace(/\s+/g, ' ').slice(0, 160) })`);
        row.route = rt;
        rec('⑤ 노선도 카드', '서울 시청(카드) → 강남 경로', rt.f === st.sid && !/부산|KTX 경부/.test(rt.txt), JSON.stringify(rt));
      }
      rec('⑤ 노선도 카드', `${nm}(${nth}) ${which}`, st.value === nm && st.routeOpen && !st.diagram && lineOk,
        `값='${st.value}' sid=${st.sid} 노선일치=${lineOk} 길찾기열림=${st.routeOpen} 노선도닫힘=${!st.diagram} 버튼최상단=${bi.onTop} 노드노선=${tgt.lines} 노선도버튼active=${st.dgBtnActive}`);
    }
  }

  /* ── ⑥ 노선도 켠 상태에서 저장 > 노선도 PNG ── */
  if (want('6')) {
    await fresh();
    const o = await press('#diagram-btn'); await sleep(2500);
    await ensureToolbar(b, '#toolbar');   // 980px 이하: 저장 버튼은 더보기 시트 안 (작업 1)
    await ev(`document.querySelector('#toolbar > .tb-dropdown:nth-child(${DROP['저장']}) .tb-dropbtn').scrollIntoView({block:'center', inline:'nearest'}); 0`); await sleep(150);
    const drop = await info(`#toolbar > .tb-dropdown:nth-child(${DROP['저장']}) .tb-dropbtn`);
    const d0 = downloads.length;
    const r = await menu('저장', 'diagram-save-btn'); await sleep(2500);
    const got = downloads.slice(d0);
    R.items.png = { diagramOpen: o, saveBtn: drop, menu: r, downloads: got };
    rec('⑥ 노선도 PNG', '저장 버튼 접근', drop.onTop, `최상단=${drop.topDesc}`);
    rec('⑥ 노선도 PNG', '저장 > 노선도 PNG 다운로드', r.ok && got.length > 0, (r.why || '') + ' 파일=' + JSON.stringify(got));
    // 노선도 막대 버튼이 툴바에 가려지지 않는지 (회귀)
    const bar = {};
    for (const id of ['dg-zoom-out', 'dg-zoom-in', 'dg-fit', 'dg-save', 'dg-close']) { const i = await info('#' + id); bar[id] = i.onTop ? 'ok' : ('가려짐:' + i.topDesc); }
    rec('⑥ 노선도 PNG', '노선도 막대 버튼 5개 가림 없음', Object.values(bar).every(v => v === 'ok'), JSON.stringify(bar));
    const d1 = downloads.length; const p2 = await press('#dg-save'); await sleep(2500);
    rec('⑥ 노선도 PNG', '노선도 안 PNG 버튼(기존 동작)', p2.ok && downloads.length > d1, JSON.stringify(downloads.slice(d1)));
    // 다른 메뉴도 노선도 위에서 열리는지
    const t = await press(`#toolbar > .tb-dropdown:nth-child(${DROP['도구']}) .tb-dropbtn`); await sleep(250);
    const di = await info('#draw-btn');
    rec('⑥ 노선도 PNG', '노선도 위에서 도구 메뉴 항목 보임', t.ok && di.visible && di.onTop, `최상단=${di.topDesc}`);
    await b.shot(path.join(OUT, '6-diagram-toolbar.png'));
    await press(`#toolbar > .tb-dropdown:nth-child(${DROP['도구']}) .tb-dropbtn`); await sleep(250);
    const c = await press('#dg-close'); await sleep(500);
    rec('⑥ 노선도 PNG', '닫기', c.ok && !(await ev(`!!document.getElementById('diagram-overlay')`)), c.why || '');
  }

  /* ── ⑧ 영향권 버튼 상태 ── */
  if (want('8')) {
    await fresh();
    const seq = [];
    const st = () => ev(`({ active: document.getElementById('coverage-btn').classList.contains('active'), cov: CoverageMap.isActive(), panel: (document.getElementById('cv-panel') || document.querySelector('#cv-head') && document.querySelector('#cv-head').parentNode || {style:{}}).style.display || '', circles: (map.getSource('cv-circles') && map.getSource('cv-circles')._data.features || []).length })`);
    let r = await menu('분석', 'coverage-btn'); await sleep(1200); seq.push(['켜기', r.ok, Object.assign(await st(), { why: r.why })]);
    r = await press('#cv-close'); await sleep(600); seq.push(['✕', r.ok, await st()]);
    r = await menu('분석', 'coverage-btn'); await sleep(1200); seq.push(['다시 켜기', r.ok, await st()]);
    r = await menu('분석', 'coverage-btn'); await sleep(800); seq.push(['메뉴로 끄기', r.ok, Object.assign(await st(), { why: r.why })]); seq.forEach(x => x[2].pressOk = x[1]);
    R.items.coverage = seq;
    const [a, x, c, d] = seq.map(s => s[2]);
    rec('⑧ 영향권', '켜기', a.active && a.cov && a.circles > 0, JSON.stringify(a));
    rec('⑧ 영향권', '✕ 후 버튼 꺼짐', !x.active && !x.cov && x.circles === 0, JSON.stringify(x));
    rec('⑧ 영향권', '다시 켜기', c.active && c.cov && c.circles > 0, JSON.stringify(c));
    rec('⑧ 영향권', '메뉴로 끄기', d.pressOk ? (!d.active && !d.cov) : null, (d.pressOk ? '' : '범위 밖 관찰: 메뉴 항목이 영향권 패널에 가려 누르지 못함 — ') + JSON.stringify(d));
    // 한 번 더: (메뉴로 껐으면) 다시 켜고 ✕ 로 닫는다 — 상태 일관성. IMPL9 에서 메뉴로 끌 수 있게 되어 순서를 맞춤
    if (!(await st()).cov) { await menu('분석', 'coverage-btn'); await sleep(1000); }
    r = await press('#cv-close'); await sleep(500); const e2 = await st();
    rec('⑧ 영향권', '두 번째 ✕ 후 버튼 꺼짐', r.ok && !e2.active && !e2.cov, JSON.stringify(e2));
  }

  /* ── ⑨ ?style=local ── */
  if (want('9')) {
    const q = {};
    for (const [k, url] of [['plain', BASE], ['local', BASE + '?style=local']]) {
      const r0 = reqs.length, l0 = b.logs.length;
      await fresh(url); await sleep(1500);
      const s = await ev(`(() => { const st = map.getStyle(); if (!st) return { key: typeof appliedStyleKey !== 'undefined' ? appliedStyleKey : null, sources: null, styleMissing: true, rail: !!map.getLayer('rail-lines') }; return { key: typeof appliedStyleKey !== 'undefined' ? appliedStyleKey : null, sources: Object.keys(st.sources).filter(k => !['lines','stations','my-location'].includes(k) && !/^station|exit|draw|my|memo|cv-|station-area/.test(k)), layers: st.layers.length, rail: !!map.getLayer('rail-lines'), sprite: st.sprite || null }; })()`);
      const rr = reqs.slice(r0);
      q[k] = { ...s, qaReq: rr.filter(x => /qa-style/.test(x)), tileReq: rr.filter(x => /openfreemap|arcgis|tiles/.test(x)).length,
        errs: b.logs.slice(l0).filter(l => /EXC|error/i.test(l)).slice(0, 4) };
    }
    R.items.styleLocal = q;
    const same = q.plain.key === q.local.key && JSON.stringify(q.plain.sources) === JSON.stringify(q.local.sources) && q.local.rail;
    rec('⑨ ?style=local', '일반 접속과 동작 일치', same && !q.local.qaReq.length && !q.local.errs.length,
      `일반 key=${q.plain.key} 원격타일요청 ${q.plain.tileReq} / local key=${q.local.key} 원격타일요청 ${q.local.tileReq} qa-style 요청=${JSON.stringify(q.local.qaReq)} 오류=${JSON.stringify(q.local.errs)}`);
  }

  /* ── 추가: 그린 노선·내 위치 점 유지 ── */
  if (want('D')) {
    await fresh(); await ev(`localStorage.removeItem('kr-rail-map-mylines-v1'); 0`);
    await fresh();
    const S = () => ev(`(() => { const d = s => map.getSource(s) && map.getSource(s)._data && map.getSource(s)._data.features ? map.getSource(s)._data.features.length : null;
      return { key: appliedStyleKey, mylines: d('mylines'), mylineLayers: ['mylines-solid','mylines-dash','mylines-dot'].filter(id => map.getLayer(id)).length,
        loc: d('my-location'), locLayer: !!map.getLayer('my-location-dot'), preview: d('draw-preview'), rail: !!map.getLayer('rail-lines'), list: document.querySelectorAll('#myline-list .line-item').length,
        rendered: map.getLayer('mylines-solid') ? map.queryRenderedFeatures({ layers: ['mylines-solid'] }).length : 0,
        locRendered: map.getLayer('my-location-dot') ? map.queryRenderedFeatures({ layers: ['my-location-dot'] }).length : 0 }; })()`);
    await ev(`map.jumpTo({ center: [126.9706, 37.5547], zoom: 13 }); 0`); await sleep(1500);
    // 노선 그리기: 실제 클릭 3점 + Enter
    let r = await menu('도구', 'draw-btn'); await sleep(400);
    const cv = await ev(`(() => { const r = map.getCanvas().getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })()`);
    const pts = [[0.42, 0.35], [0.55, 0.42], [0.62, 0.55]].map(([fx, fy]) => [cv[0] + cv[2] * fx, cv[1] + cv[3] * fy]);
    for (const [x, y] of pts) { await b.click(x, y); await sleep(350); }
    await b.key('Enter', 'Enter', 13); await sleep(600);
    // 내 위치 (CDP 로 서울역 좌표 주입)
    const lp = await press('#locate-btn'); await sleep(3000);
    await ev(`map.jumpTo({ center: [126.9706, 37.5547], zoom: 13 }); 0`); await sleep(1200);
    const s0 = await S();
    rec('추가 그린 노선·위치', '준비(그리기 1개·위치 1점)', s0.mylines === 1 && s0.loc === 1, `${r.why || ''} ${lp.why || ''} ${JSON.stringify(s0)}`);
    // 연쇄 전환 (실제 클릭)
    const CHAIN = [['theme', 'dark'], ['theme', 'light'], ['theme', 'eclipse'], ['style', 'satellite'], ['style', 'gray'], ['style', 'normal'], ['theme', 'neon'], ['theme', 'light']];
    const chain = [];
    for (const [kind, t] of CHAIN) {
      const sel = kind === 'theme' ? `#theme-row .theme-btn[data-theme=${t}]` : `#toolbar [data-style=${t}]`;
      const p = kind === 'theme' ? await sidePress(sel) : await press(sel); let s;
      for (let i = 0; i < 32; i++) { await sleep(250); s = await S(); if (s.rail) break; }
      // 화면 반영(GeoJSON 타일 생성·그리기)은 비동기 — 최대 6초까지 그려진 피처를 기다린다
      const t1 = Date.now();
      for (let i = 0; i < 24; i++) { await sleep(250); s = await S(); if (s.rendered > 0 && s.locRendered > 0) break; }
      s.renderMs = Date.now() - t1;
      await b.shot(path.join(OUT, `D-${chain.length}-${t}.png`));
      chain.push({ step: kind + ':' + t, press: p.ok, ...s });
      rec('추가 그린 노선·위치', `→ ${t}`, p.ok && s.mylines === 1 && s.mylineLayers === 3 && s.loc === 1 && s.locLayer && s.rendered > 0 && s.locRendered > 0, (p.ok ? '' : '누르기 실패: ' + p.why + ' ') + JSON.stringify(s));
    }
    await b.shot(path.join(OUT, 'D-after-chain.png'));
    // 그리는 중 전환: 2점 찍고 테마 전환 → 미리보기 유지 → Enter 로 완료
    r = await menu('도구', 'draw-btn'); await sleep(400);
    for (const [x, y] of [[cv[0] + cv[2] * 0.3, cv[1] + cv[3] * 0.6], [cv[0] + cv[2] * 0.38, cv[1] + cv[3] * 0.7]]) { await b.click(x, y); await sleep(350); }
    const pv0 = await S();
    await sidePress('#theme-row .theme-btn[data-theme=dark]'); for (let i = 0; i < 32; i++) { await sleep(250); if ((await S()).rail) break; } await sleep(700);
    const pv1 = await S();
    await b.click(cv[0] + cv[2] * 0.45, cv[1] + cv[3] * 0.72); await sleep(350);
    await b.key('Enter', 'Enter', 13); await sleep(700);
    const pv2 = await S();
    rec('추가 그린 노선·위치', '그리는 중 전환 후 미리보기 유지', pv1.preview === pv0.preview && pv0.preview >= 3, `전환 전 미리보기 ${pv0.preview} → 후 ${pv1.preview}`);
    rec('추가 그린 노선·위치', '전환 뒤 계속 그려 완료', pv2.mylines === 2 && pv2.list === 2, JSON.stringify(pv2));
    // 지우기 (사이드바 ✕ 실제 클릭)
    const del = await sidePress('#myline-list .line-item:last-child .mini-del'); await sleep(600);
    const pv3 = await S();
    rec('추가 그린 노선·위치', '지우기', del.ok && pv3.mylines === 1 && pv3.list === 1, (del.why || '') + JSON.stringify(pv3));
    await sidePress('#theme-row .theme-btn[data-theme=light]'); for (let i = 0; i < 32; i++) { await sleep(250); if ((await S()).rail) break; } await sleep(700);
    let pv4; for (let i = 0; i < 24; i++) { await sleep(250); pv4 = await S(); if (pv4.rendered > 0) break; }
    rec('추가 그린 노선·위치', '지운 뒤 전환해도 1개 유지', pv4.mylines === 1 && pv4.loc === 1, JSON.stringify(pv4));
    // 새로 고침 후 위치 점은 없어야 함(찍은 적 없음), 그린 노선은 저장분 1개
    await fresh(); await sleep(500);
    await sidePress('#theme-row .theme-btn[data-theme=dark]'); for (let i = 0; i < 32; i++) { await sleep(250); if ((await S()).rail) break; } await sleep(700);
    const pv5 = await S();
    rec('추가 그린 노선·위치', '위치 안 찍은 상태 전환 → 위치 점 없음', pv5.loc === 0 && pv5.mylines === 1, JSON.stringify(pv5));
    await sidePress('#theme-row .theme-btn[data-theme=light]'); await sleep(1500);
    // 메모 핀(범위 밖 관찰)
    R.items.draw = { s0, chain, pv0, pv1, pv2, pv3, pv4, pv5 };
  }

  const errs = b.logs.filter(l => /EXC|\[error\]/.test(l));
  R.consoleErrors = errs.slice(0, 20);
  R.results = res;
  const pass = res.filter(x => x.ok === true).length, fail = res.filter(x => x.ok === false).length, unv = res.filter(x => x.ok === null).length;
  console.log(`SUMMARY ${LABEL}: pass ${pass} fail ${fail} 미검증 ${unv} | 콘솔 오류 ${errs.length}`);
  errs.slice(0, 8).forEach(e => console.log('  ' + e.slice(0, 200)));
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(R, null, 1));
  console.log(`E2E-SUMMARY ${LABEL}: pass ${pass} fail ${fail} 미검증 ${unv}`);
  process.exitCode = fail ? 1 : 0;
  b.close();
})().catch(e => { console.error(e); try { b.close(); } catch {} process.exit(1); });
