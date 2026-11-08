/* e2e: 위성·일반·다크·흑백에서 역 이름·출구 번호 글자가 화면에 나옴 (버그 ⑦, IMPL6)
 * 출처: 2026-11-07 세션 점검 스크립트 impl6.js (실제 마우스·키 이벤트, 헤드리스 Chrome).
 * 실행: node tests/e2e/run.js --only satellite-labels  (또는 E2E_BASE=<주소> node 이 파일)
 */
// IMPL6 재현·검증: 위성 모드 글자(symbol) 레이어 표시 여부 + 일반·다크·흑백 회귀
// cdp.js·impl1.js 방식 재사용. 판정 = 레이어 존재 + 화면에 실제로 배치된 글자 수(queryRenderedFeatures)
// 사용: TAG=before|after node impl6.js [BASE]
const { launch, sleep, BASE, outDir } = require('./lib/cdp');
const path = require('path'), fs = require('fs');
const OUT = outDir('satellite-labels');
const SYMBOLS = ['station-labels', 'station-exit-labels'];
// 보기: 서울역 일대 줌 13(역 이름), 강남역 줌 17.5(출구 번호)
const VIEWS = [['역이름z13', [126.9707, 37.5547], 13], ['출구z17.5', [127.0276, 37.4979], 17.5]];
const CASES = [ // [이름, 테마, 해시]
  ['위성(직접 열기)', 'light', 'satellite'],
  ['일반', 'light', 'normal'],
  ['다크', 'dark', 'normal'],
  ['흑백', 'light', 'gray'],
];

async function ready(b) {
  for (let i = 0; i < 80; i++) { await sleep(400); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&map.loaded()&&!!map.getLayer('rail-lines')`).catch(() => false)) break; }
  // 출구는 지연 로딩(IMPL12 건 4) — 여기서는 미리 받지 않는다. 줌 17.5 로 가면 자동으로 받는지 measure() 에서 본다.
}
async function idle(b) { await b.evaluate(`new Promise(r => { if (map.loaded()) setTimeout(r, 300); map.once('idle', () => r()); setTimeout(r, 8000); })`); await sleep(400); }
async function measure(b, tagName) {
  const res = {};
  for (const [vn, c, z] of VIEWS) {
    await b.evaluate(`map.jumpTo({ center: [${c}], zoom: ${z} }); 0`);
    if (z >= 16) for (let i = 0; i < 40; i++) { if (await b.evaluate(`!!map.getLayer('station-exit-labels')`).catch(() => false)) break; await sleep(250); }
    await idle(b);
    res[vn] = await b.evaluate(`(() => { const o = {}; for (const id of ${JSON.stringify(SYMBOLS)}) { const L = map.getLayer(id);
      o[id] = L ? { n: map.queryRenderedFeatures({ layers: [id] }).length, color: JSON.stringify(map.getPaintProperty(id, 'text-color') ?? null), halo: JSON.stringify(map.getPaintProperty(id, 'text-halo-color') ?? null), haloW: JSON.stringify(map.getPaintProperty(id, 'text-halo-width') ?? null) } : null; }
      o._glyphs = map.getStyle().glyphs || null; o._key = appliedStyleKey; return o; })()`);
    await b.shot(path.join(OUT, `${tagName}-${vn}.png`));
  }
  return res;
}

(async () => {
  const out = { base: BASE, cases: {}, transition: null };
  const b = await launch({ port: 9631, w: 1280, h: 860 });
  await b.send('Network.setBypassServiceWorker', { bypass: true });
  await b.send('Network.setCacheDisabled', { cacheDisabled: true });
  for (const [name, th, hash] of CASES) {
    await b.goto(BASE, 600); await b.evaluate(`localStorage.setItem('krrail-theme', '${th}'); 0`);
    await b.goto('about:blank', 200); await b.goto(BASE + '#' + hash, 800); await ready(b);
    out.cases[name] = await measure(b, name.replace(/[()]/g, ''));
    const r = out.cases[name];
    console.log(name, 'glyphs=' + (r['역이름z13']._glyphs ? 'O' : 'X'),
      '| 역이름 z13:', r['역이름z13']['station-labels'] ? r['역이름z13']['station-labels'].n + '개' : '레이어없음',
      '| 출구번호 z17.5:', r['출구z17.5']['station-exit-labels'] ? r['출구z17.5']['station-exit-labels'].n + '개' : '레이어없음',
      '| 역이름 paint', r['역이름z13']['station-labels'] ? `color=${r['역이름z13']['station-labels'].color} halo=${r['역이름z13']['station-labels'].halo}/${r['역이름z13']['station-labels'].haloW}` : '-',
      '| 출구 paint', r['출구z17.5']['station-exit-labels'] ? `color=${r['출구z17.5']['station-exit-labels'].color} halo=${r['출구z17.5']['station-exit-labels'].halo}/${r['출구z17.5']['station-exit-labels'].haloW}` : '-');
  }
  // 전환으로 위성 진입 (일반 → 위성 버튼 실클릭) 후 글자
  await b.goto(BASE, 600); await b.evaluate(`localStorage.setItem('krrail-theme', 'light'); 0`);
  await b.goto('about:blank', 200); await b.goto(BASE + '#normal', 800); await ready(b);
  const c = await b.evaluate(`(() => { const e = document.querySelector('#toolbar [data-style=satellite]'); const r = e.getBoundingClientRect(); return [r.x + r.width/2, r.y + r.height/2]; })()`);
  await b.click(c[0], c[1]); await sleep(1500);
  out.transition = await measure(b, '일반→위성');
  const t = out.transition;
  console.log('일반→위성 전환', '| 역이름 z13:', t['역이름z13']['station-labels'] ? t['역이름z13']['station-labels'].n + '개' : '레이어없음',
    '| 출구번호 z17.5:', t['출구z17.5']['station-exit-labels'] ? t['출구z17.5']['station-exit-labels'].n + '개' : '레이어없음');
  out.errors = b.logs.filter(l => /EXC|\[error\]/.test(l)).map(s => s.split('\n')[0]).slice(0, 10);
  console.log('콘솔 오류', out.errors.length, out.errors.slice(0, 3).join(' | '));
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(out, null, 1));
  b.close();
  // 판정: 모든 경우에 글꼴(glyphs)이 있고 역 이름(z13)·출구 번호(z17.5)가 화면에 1개 이상, 콘솔 오류 0
  const judged = [...Object.entries(out.cases), ['일반→위성 전환', out.transition]].map(([n, r]) => {
    const a = r['역이름z13']['station-labels'], e = r['출구z17.5']['station-exit-labels'];
    return [n, !!r['역이름z13']._glyphs && !!a && a.n > 0 && !!e && e.n > 0];
  });
  judged.push(['콘솔 오류 0', out.errors.length === 0]);
  const fail = judged.filter(j => !j[1]);
  judged.forEach(j => console.log(j[1] ? '[PASS]' : '[FAIL]', j[0]));
  console.log(`E2E-SUMMARY satellite-labels: pass ${judged.length - fail.length} fail ${fail.length} 미검증 0`);
  process.exitCode = fail.length ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
