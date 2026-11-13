/* e2e: 동명역 지역 표시 (IMPL9 건 3)
 *  - 길찾기 자동완성·상단 검색 결과에서, 이름이 겹치는 역 중 지역을 확정한 역에만 '· 서울 중구' 를 붙인다
 *  - 지역을 확정하지 못한 동명역(부산·대전 시청 등)과 이름이 안 겹치는 역(강남)에는 붙이지 않는다
 *  기대값은 data/station-region.json 에서 읽는다(역 ID 기준). 화면 항목은 노선 표기로 역을 맞춘다.
 * 실행: node tests/e2e/run.js --only region-labels
 */
'use strict';
const { launch, sleep, BASE, recorder } = require('./lib/cdp');
const R = recorder('region-labels');

async function ready(b) {
  for (let i = 0; i < 120; i++) { await sleep(400); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&map.loaded()&&regionOf.size>0`).catch(() => false)) break; }
  await sleep(500);
}
async function typeInto(b, id, text) {
  const c = await b.evaluate(`(() => { const e = document.getElementById('${id}'); e.scrollIntoView({block:'center'}); const r = e.getBoundingClientRect(); return [r.x + 20, r.y + r.height/2]; })()`);
  await b.click(c[0], c[1]); await sleep(60);
  await b.evaluate(`(() => { const e = document.getElementById('${id}'); e.value = ''; 0 })()`);
  await b.type(text); await sleep(400);
}

(async () => {
  const b = await launch({ port: 9671, w: 1440, h: 1000 });
  await b.send('Network.setBypassServiceWorker', { bypass: true });
  await b.send('Network.setCacheDisabled', { cacheDisabled: true });
  await b.goto(BASE + '#normal', 800); await ready(b);

  // 기대값: 이름별로 [역 ID, 노선 표기, 지역|null]
  const expect = name => b.evaluate(`STATIONS.filter(s => s.properties.name_ko === ${JSON.stringify(name)}).map(s => ({ id: s.properties.id,
    lines: (s.properties.lines || []).map(l => (typeof lineLabelOf === 'function' ? lineLabelOf(l) : (lineNameOf.get(l) || l))).slice(0, 3).join('·'), region: regionOf.get(s.properties.id) || null }))`);
  // 길찾기 자동완성
  await b.evaluate(`document.getElementById('route-panel').hidden = false; 0`);
  for (const name of ['시청', '양평', '교대', '강남']) {
    const want = await expect(name);
    await typeInto(b, 'route-from', name);
    const items = await b.evaluate(`[...document.getElementById('route-from').parentElement.querySelectorAll('.ac-list:not([hidden]) .ac-item')]
      .filter(e => (e.childNodes[0] && e.childNodes[0].textContent.trim()) === ${JSON.stringify(name)})
      .map(e => ({ lines: (e.querySelector('.ac-lines') || {}).textContent || '', region: e.querySelector('.ac-region') ? e.querySelector('.ac-region').textContent.replace(/^·\\s*/, '') : null }))`);
    const ok = want.length === items.length && want.every(w => items.some(it => it.lines === w.lines && it.region === w.region));
    R.check(`자동완성 '${name}': 역마다 지역 표시가 기대와 같음 (${want.filter(w => w.region).length}/${want.length} 표시)`, ok, { want, items });
  }
  // 상단 검색
  for (const name of ['시청', '양평', '강남']) {
    const want = await expect(name);
    await typeInto(b, 'search', name);
    const hits = await b.evaluate(`[...document.querySelectorAll('#search-results .hit')].filter(h => h.querySelector('.hit-name').textContent === ${JSON.stringify(name)})
      .map(h => ({ lines: [...h.querySelectorAll('.hit-lines span')].map(s => s.textContent).join(''), region: h.querySelector('.hit-region') ? h.querySelector('.hit-region').textContent.replace(/^·\\s*/, '') : null }))`);
    const regionsWant = want.map(w => w.region).sort().join('|'), regionsGot = hits.map(h => h.region).sort().join('|');
    R.check(`검색 '${name}': 지역 표시 집합이 기대와 같음`, hits.length === want.length && regionsWant === regionsGot, { want: want.map(w => w.region), got: hits });
    await b.key('Escape', 'Escape', 27); await sleep(150);
  }
  // 표본 고정값 (지도 데이터가 바뀌면 다시 확인할 값)
  const sicheong = (await expect('시청')).map(w => w.region).filter(Boolean);
  // 2026-11-11: 부산·대전 시청은 주소데이터로 확정 못 했지만 OSM 행정경계로 채웠다 (data/build_station_region.py)
  R.check("표본: 시청 → '서울 중구'·'부산 연제구'·'대전 서구'", JSON.stringify([...sicheong].sort()) === JSON.stringify(['대전 서구', '부산 연제구', '서울 중구']), sicheong);
  const yp = (await expect('양평')).map(w => w.region).sort();
  R.check("표본: 양평 → '경기 양평군'·'서울 영등포구'", JSON.stringify(yp) === JSON.stringify(['경기 양평군', '서울 영등포구']), yp);
  const nonDup = await b.evaluate(`(() => { const c = {}; STATIONS.forEach(s => c[s.properties.name_ko] = (c[s.properties.name_ko] || 0) + 1);
    return [...regionOf.keys()].filter(id => { const s = STATIONS.find(x => x.properties.id === id); return !s || c[s.properties.name_ko] < 2; }).length; })()`);
  R.check('지역이 붙는 역은 모두 이름이 겹치는 역', nonDup === 0, nonDup);
  const exc = b.logs.filter(l => /EXC/.test(l));
  R.check('예외 0', exc.length === 0, exc.slice(0, 3));
  b.close();
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
