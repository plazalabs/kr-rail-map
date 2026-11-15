/* e2e: 맞벌이 통근권 — 두 번째 직장 (2026-11-15 킬러 아이디어 '둘 다 출근 가능한 동네')
 *  - 통근권에 '두 번째 직장' 칸: 고르면 요약 '강남·여의도 둘 다 45분 안: N역', 목록 분 옆에 '첫째·둘째' 분, 지도 직장 점 2개
 *  - 비우면 한 곳으로 돌아감 · 링크 ?cm=…&cm2=…&t=45 로 바로 열림
 * 실행: node tests/e2e/run.js --only commute-two
 */
'use strict';
const { launch, sleep, BASE, recorder } = require('./lib/cdp');
const R = recorder('commute-two');
async function ready(b) {
  for (let i = 0; i < 120; i++) { await sleep(300); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&typeof CommuteMap!=='undefined'`).catch(() => false)) break; }
  await sleep(800);
}
const ids = `(() => { const f = (n, l) => STATIONS.find(s => s.properties.name_ko === n && s.properties.lines.includes(l)).properties.id;
  return { gn: f('강남', 'seoul-subway-line-2'), yd: f('여의도', 'seoul-subway-line-5') }; })()`;
const state = `(() => { const s = document.getElementById('cm-summary'); const li = [...document.querySelectorAll('#cm-list li button')];
  // 목록은 150역까지만 그린다 — 역 수는 요약 첫 줄의 'N역'으로 센다
  const m = s ? /안: ([0-9]+)역/.exec(s.textContent) : null;
  return { sum: s ? s.textContent : '', n: m ? +m[1] : -1, both: li.slice(0, 5).map(x => (x.querySelector('.cm-both') || {}).textContent || null),
    dests: (map.getSource('cm-dest') && map.getSource('cm-dest')._data && map.getSource('cm-dest')._data.features || []).length, d2: CommuteMap.dest2() }; })()`;
(async () => {
  const b = await launch({ port: 9793, w: 1440, h: 900 });
  await b.goto(BASE + '#normal', 1500); await ready(b);
  const I = await b.evaluate(ids);
  await b.evaluate(`CommuteMap.show('${I.gn}', { limit: 45 }); 0`); await sleep(1200);
  const one = await b.evaluate(state);
  R.check('한 곳: 요약 강남까지 45분 안, 두 번째 칸 비어 있음', /강남까지 45분 안/.test(one.sum) && !one.d2 && one.both.every(x => x == null), one);
  // 두 번째 직장 칸에 '여의도' → 자동완성 고름 대신 이름 + change (동명역 없음)
  await b.evaluate(`(() => { const i = document.getElementById('cm-dest2'); i.value = '여의도'; delete i.dataset.sid; i.dispatchEvent(new Event('change')); })()`); await sleep(1200);
  const two = await b.evaluate(state);
  R.check("두 곳: 요약 '강남·여의도 둘 다 45분 안', 역 수는 한 곳보다 적음", /강남·여의도 둘 다 45분 안/.test(two.sum) && two.n > 5 && two.n < one.n && !!two.d2, { one: one.n, two: two.n, sum: two.sum });
  R.check("목록 분 옆에 '첫째·둘째' 분, 지도 직장 점 2개", two.both.every(x => /^\d+·\d+$/.test(x || '')) && two.dests === 2, two);
  await b.evaluate(`(() => { const i = document.getElementById('cm-dest2'); i.value = ''; i.dispatchEvent(new Event('change')); })()`); await sleep(1000);
  const back = await b.evaluate(state);
  R.check('두 번째 칸을 비우면 한 곳으로 돌아감', /강남까지 45분 안/.test(back.sum) && !back.d2 && back.n === one.n, back);
  // 링크로 바로
  await b.goto('about:blank', 200);
  await b.goto(BASE + `?cm=${I.gn}&cm2=${I.yd}&t=45#normal`, 1500); await ready(b);
  for (let i = 0; i < 30; i++) { if (/둘 다/.test((await b.evaluate(state)).sum)) break; await sleep(300); }
  const link = await b.evaluate(state);
  R.check('링크 ?cm=강남&cm2=여의도&t=45 → 두 곳 통근권으로 열림', /강남·여의도 둘 다 45분 안/.test(link.sum) && link.n === two.n, link);
  const exc = b.logs.filter(l => /EXC/.test(l));
  R.check('예외 0', exc.length === 0, exc.slice(0, 3));
  b.close();
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
