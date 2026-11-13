/* e2e: 검색 팔레트 (js/app.js PALETTE, 뮤즈 TASK 1 · 2026-11-13)
 *  - 빈 검색창 클릭 → '빠른 실행' 4개(길찾기·떡상·역 타일·통근권)
 *  - '떡상' → 맨 위 'GTX 떡상 랭킹' → Enter → 떡상 패널 열림
 *  - '통근' → 통근권 찾기 / '타일' → RAIL MARKET MAP 열림
 *  - '강남에서 서울역' → 맨 위 '강남 → 서울 길찾기' → Enter → 길찾기 결과
 *  - '강남' 같은 역 이름은 예전처럼 역이 맨 위 (기능 줄이 끼어들지 않음)
 * 실행: node tests/e2e/run.js --only palette
 */
'use strict';
const { launch, sleep, BASE, recorder } = require('./lib/cdp');
const R = recorder('palette');

async function ready(b) {
  for (let i = 0; i < 120; i++) { await sleep(300); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&!!map.getSource('lines')`).catch(() => false)) break; }
  await sleep(800);
}
async function typeSearch(b, q) {
  await b.evaluate(`(() => { const s = document.getElementById('search'); s.value = ''; s.focus(); s.dispatchEvent(new Event('focus')); })()`);
  await b.type(q); await sleep(350);
  return b.evaluate(`[...document.querySelectorAll('#search-results .hit')].slice(0, 4).map(h => ({ action: h.classList.contains('hit-action'), name: (h.querySelector('.hit-name') || {}).textContent.trim() }))`);
}
const enter = async b => { await b.key('Enter', 'Enter', 13); await sleep(900); };

(async () => {
  const b = await launch({ port: 9681, w: 1440, h: 900 });
  await b.goto(BASE + '#normal', 1500); await ready(b);

  // 사람처럼 검색창을 실제로 누른다 (빈 칸)
  const sp = await b.evaluate(`(() => { const s = document.getElementById('search'); s.value = ''; s.blur(); const r = s.getBoundingClientRect(); return [r.x + 30, r.y + r.height / 2]; })()`);
  await b.click(sp[0], sp[1]); await sleep(400);
  const quick = await b.evaluate(`({ head: [...document.querySelectorAll('#search-results .hit-head')].map(h => h.textContent).join('|'),
    acts: [...document.querySelectorAll('#search-results .hit-action .hit-name')].map(h => h.textContent.trim()) })`);
  R.check("빈 검색창 → '빠른 실행' 5개", /빠른 실행/.test(quick.head) && quick.acts.length === 5 && /길찾기/.test(quick.acts[0]), quick);

  let top = await typeSearch(b, '떡상');
  R.check("'떡상' → 맨 위 'GTX 떡상 랭킹'", top[0] && top[0].action && /떡상 랭킹/.test(top[0].name), top);
  await enter(b);
  const rk = await b.evaluate(`typeof RocketPanel !== 'undefined' && RocketPanel.isOpen()`);
  R.check("Enter → 떡상 패널 열림", rk === true);
  await b.evaluate(`RocketPanel.close(); 0`); await sleep(300);

  top = await typeSearch(b, '타일');
  R.check("'타일' → 맨 위 RAIL MARKET MAP", top[0] && top[0].action && /MARKET MAP/.test(top[0].name), top);
  await enter(b);
  const mm = await b.evaluate(`typeof MarketMap !== 'undefined' && MarketMap.isOpen()`);
  R.check('Enter → 역 타일 열림', mm === true);
  await b.evaluate(`MarketMap.close(); 0`); await sleep(200);

  top = await typeSearch(b, '통근');
  R.check("'통근' → 통근권 찾기", top[0] && top[0].action && /통근권/.test(top[0].name), top);

  top = await typeSearch(b, '강남에서 서울역');
  R.check("'강남에서 서울역' → 맨 위 '강남 → 서울 길찾기'", top[0] && top[0].action && /강남 → 서울 길찾기/.test(top[0].name), top);
  await enter(b); await sleep(800);
  const rt = await b.evaluate(`({ open: !document.getElementById('route-panel').hidden, from: document.getElementById('route-from').value, to: document.getElementById('route-to').value,
    res: /총 약 \\d+분/.test(document.getElementById('route-result').textContent) })`);
  R.check('Enter → 길찾기 칸이 채워지고 결과가 나옴', rt.open && rt.from === '강남' && rt.to === '서울' && rt.res, rt);

  // I6 (2026-11-14, 감사6): '시청→강남' — 동명역이면 반대편(강남)에 가까운 서울 시청, 줄에 지역 표시
  top = await typeSearch(b, '시청→강남');
  R.check("'시청→강남' → 서울 시청(지역 표시), 부산 시청 아님", top[0] && top[0].action && /시청\(서울/.test(top[0].name) && !/부산/.test(top[0].name), top[0]);
  await enter(b); await sleep(800);
  const sc = await b.evaluate(`(() => { const s = STATIONS.find(x => x.properties.id === document.getElementById('route-from').dataset.sid); return s ? { lines: s.properties.lines, lat: s.geometry.coordinates[1] } : null; })()`);
  R.check('Enter → 출발역이 서울 시청(위도 37.5 근처)', !!sc && sc.lat > 37.4 && sc.lat < 37.7, sc);
  top = await typeSearch(b, '강남');
  R.check("'강남' → 역이 맨 위 (기능 줄 없음)", top[0] && !top[0].action && top[0].name === '강남', top);
  const exc = b.logs.filter(l => /EXC/.test(l));
  R.check('예외 0', exc.length === 0, exc.slice(0, 3));
  b.close();
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
