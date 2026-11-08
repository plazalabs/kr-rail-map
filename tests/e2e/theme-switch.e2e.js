/* e2e: 테마·배경 전환 후 노선·역·라벨·출구·내 위치 레이어 복원 (버그 ①, IMPL1)
 * 출처: 2026-11-07 세션 점검 스크립트 impl1.js (실제 마우스·키 이벤트, 헤드리스 Chrome).
 * 실행: node tests/e2e/run.js --only theme-switch  (또는 E2E_BASE=<주소> node 이 파일)
 */
// IMPL1 재현·검증: 스타일이 바뀌는 테마/배경 전환 후 커스텀 레이어 복원 여부
// cdp.js(분석 세션 도구) 재사용. 실제 마우스 클릭으로 전환, restoreCustomLayers 수동 호출 없음.
// 사용: node impl1.js [BASE_URL]   결과 JSON 은 stdout 마지막 줄
const { launch, sleep, BASE, outDir } = require('./lib/cdp');
const fs = require('fs'), path = require('path');
const OUT = outDir('theme-switch');
const LAYERS = { 노선: 'rail-lines', 역: 'rail-stations', 역라벨: 'station-labels', 출구: 'station-exits', 내위치: 'my-location-dot' };
const CASES = [
  // [이름, 시작 테마, 시작 모드, 동작 종류, 대상]
  ['라이트→다크', 'light', 'normal', 'theme', 'dark'],
  ['다크→라이트', 'dark', 'normal', 'theme', 'light'],
  ['라이트→이클립스', 'light', 'normal', 'theme', 'eclipse'],
  ['라이트→네온', 'light', 'normal', 'theme', 'neon'],
  ['일반→위성', 'light', 'normal', 'style', 'satellite'],
  ['위성→흑백', 'light', 'satellite', 'style', 'gray'],
  ['흑백→일반', 'light', 'gray', 'style', 'normal'],
  ['위성→일반', 'light', 'satellite', 'style', 'normal'],
];
const CHAIN = [['theme', 'dark'], ['theme', 'light'], ['theme', 'eclipse'], ['theme', 'light'],
  ['style', 'satellite'], ['style', 'gray'], ['style', 'normal']];

async function ready(b) {
  for (let i = 0; i < 80; i++) {
    await sleep(500);
    if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&map.loaded()&&!!map.getLayer('rail-lines')`).catch(() => false)) break;
  }
  // 출구는 지연 로딩(IMPL12 건 4) — 첫 화면에서 받지 않으므로 먼저 받게 한 뒤, 전환 후 다시 붙는지 본다. 최대 10초 대기
  await b.evaluate(`window.KR_loadExits && window.KR_loadExits(); 0`).catch(() => {});
  for (let i = 0; i < 20; i++) { if (await b.evaluate(`!!map.getLayer('station-exits')`).catch(() => false)) break; await sleep(500); }
}
const probe = b => b.evaluate(`(() => { const o = {}; const L = ${JSON.stringify(LAYERS)}; for (const k in L) o[k] = !!map.getLayer(L[k]); o._key = appliedStyleKey; o._loc = map.getSource('my-location') ? (map.getSource('my-location')._data && map.getSource('my-location')._data.features ? map.getSource('my-location')._data.features.length : '?') : null; return o; })()`);

async function act(b, kind, target) {
  const sel = kind === 'theme' ? `#theme-row .theme-btn[data-theme=${target}]` : `#toolbar [data-style=${target}]`;
  const c = await b.evaluate(`(() => { const e = document.querySelector('${sel}'); if (!e) return null; e.scrollIntoView({block:'center'}); const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width/2, r.y + r.height/2); return [r.x + r.width/2, r.y + r.height/2, t === e || e.contains(t)]; })()`);
  if (!c) throw new Error('버튼 없음 ' + sel);
  if (c[2]) await b.click(c[0], c[1]);
  else await b.evaluate(`document.querySelector('${sel}').click(); 0`); // 가려진 경우만 폴백 (기록)
  return c[2] ? 'mouse' : 'el.click';
}
async function waitResult(b) {
  // 최대 8초 동안 전 레이어 복원을 기다린다. 복원되면 걸린 시간 기록.
  const t0 = Date.now(); let r;
  for (let i = 0; i < 32; i++) {
    await sleep(250); r = await probe(b);
    if (Object.keys(LAYERS).every(k => r[k])) { r._ms = Date.now() - t0; return r; }
  }
  r._ms = null; return r;
}

(async () => {
  const out = { base: BASE, cases: [], chain: [] };
  const b = await launch({ port: 9601 });
  await b.send('Network.setBypassServiceWorker', { bypass: true });
  await b.send('Network.setCacheDisabled', { cacheDisabled: true });
  for (const [name, th, mode, kind, target] of CASES) {
    await b.goto(BASE, 800);
    await b.evaluate(`localStorage.setItem('krrail-theme', '${th}'); 0`);
    await b.goto('about:blank', 300);
    await b.goto(BASE + '#' + mode, 800);
    await ready(b);
    // 내 위치 점을 실제로 찍어 둔다 (데이터 보존 여부도 본다)
    await b.evaluate(`(document.getElementById('locate-btn')||{click(){}}).click(); 0`); await sleep(1200);
    const before = await probe(b);
    const how = await act(b, kind, target);
    const after = await waitResult(b);
    const pass = Object.keys(LAYERS).every(k => after[k]);
    out.cases.push({ name, how, before, after, pass });
    console.log(pass ? 'PASS' : 'FAIL', name, how, 'before', JSON.stringify(before), 'after', JSON.stringify(after));
  }
  // 연쇄 시나리오: 한 페이지에서 순서대로
  await b.goto(BASE, 800); await b.evaluate(`localStorage.setItem('krrail-theme','light'); 0`);
  await b.goto('about:blank', 300); await b.goto(BASE + '#normal', 800); await ready(b);
  for (const [kind, target] of CHAIN) {
    const how = await act(b, kind, target); const after = await waitResult(b);
    const pass = Object.keys(LAYERS).every(k => after[k]);
    out.chain.push({ step: kind + ':' + target, how, after, pass });
    console.log('chain', pass ? 'PASS' : 'FAIL', kind, target, JSON.stringify(after));
  }
  out.exceptions = b.logs.filter(l => /EXC|error/i.test(l)).slice(0, 20);
  b.close();
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(out, null, 1));
  const all = [...out.cases, ...out.chain]; const fail = all.filter(x => !x.pass).length;
  console.log(`E2E-SUMMARY theme-switch: pass ${all.length - fail} fail ${fail} 미검증 0`);
  process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
