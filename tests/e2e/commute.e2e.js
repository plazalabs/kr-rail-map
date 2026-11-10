/* e2e: 통근권 찾기 (2026-11-11)
 *  - 툴바 '분석 > 통근권 찾기' → 패널, 기본 목적지 강남, 45분 안 역이 지도에 색 점으로
 *  - 목록의 분이 같은 두 역의 길찾기와 같다 (표본 3역)
 *  - 최대 시간 30분으로 줄이면 역 수가 줄어든다, 개통 예정 포함을 켜면 같거나 늘어난다
 *  - 목록 항목을 누르면 그 역의 상세가 열린다
 *  - 투자 모드: 시세(평당) 표시와 '시세 낮은 순' 정렬
 *  - Esc 로 닫으면 지도 점이 지워지고 포커스가 '분석' 버튼으로
 * 실행: node tests/e2e/run.js --only commute
 */
'use strict';
const { launch, sleep, BASE, recorder } = require('./lib/cdp');
const R = recorder('commute');

async function ready(b) {
  for (let i = 0; i < 120; i++) { await sleep(400); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&map.loaded()`).catch(() => false)) break; }
  await sleep(600);
}
async function enter(b) {
  await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
  await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
}
const summary = b => b.evaluate(`(document.getElementById('cm-summary') || {}).textContent || ''`);
const count = b => b.evaluate(`(() => { const s = map.getSource('cm-stations'); return s && s._data ? (s._data.features || []).length : -1; })()`);

(async () => {
  const b = await launch({ port: 9741, w: 1440, h: 1000, invest: true });
  await b.send('Network.setBypassServiceWorker', { bypass: true });
  await b.goto(BASE + '#normal', 800); await ready(b);

  // 1. 메뉴로 열기 (키보드)
  const dd = await b.evaluate(`(() => { const e = [...document.querySelectorAll('#toolbar .tb-dropbtn')].find(x => x.textContent.trim().startsWith('분석')); e.focus(); return document.activeElement === e; })()`);
  await enter(b); await sleep(250);
  const mb = await b.evaluate(`(() => { const e = document.getElementById('commute-btn'); if (!e) return false; e.focus(); return document.activeElement === e; })()`);
  await enter(b); await sleep(1200);
  const open = await b.evaluate(`(() => { const p = document.getElementById('cm-panel'); return !!p && p.style.display !== 'none'; })()`);
  const s1 = await summary(b), n45 = await count(b);
  R.check("분석 > 통근권 찾기 (키보드) → 패널 열림, 기본 목적지 강남", dd && mb && open && /강남/.test(s1), { dd, mb, open, s1 });
  R.check('45분 안 역이 지도에 점으로 (150개 이상)', n45 >= 150, n45);

  // 2. 목록 분 = 길찾기 분 (운행 중 노선만)
  const same = await b.evaluate(`(() => {
    const g = STATIONS.find(s => s.properties.name_ko === '강남' && s.properties.lines.includes('seoul-subway-line-2')).properties.id;
    const items = [...document.querySelectorAll('#cm-list button[data-id]')];
    const pick = [items[5], items[40], items[100]].filter(Boolean);
    return pick.map(el => { const id = el.dataset.id; const min = +el.querySelector('.cm-min').textContent.replace('분', '');
      const r = RouteFinder.findRoute(id, g, { openOnly: true }); return { id, min, route: r && r.minutes }; });
  })()`);
  R.check('목록의 분이 같은 두 역의 길찾기와 같다 (±2분)', same.length === 3 && same.every(x => x.route != null && Math.abs(x.min - x.route) <= 2), same);

  // 3. 30분으로 줄이기 · 개통 예정 포함
  await b.evaluate(`(() => { const s = document.getElementById('cm-limit'); s.value = '30'; s.dispatchEvent(new Event('change')); })()`); await sleep(800);
  const n30 = await count(b);
  R.check('30분으로 줄이면 역 수가 줄어든다', n30 > 0 && n30 < n45, { n45, n30 });
  await b.evaluate(`(() => { const c = document.getElementById('cm-unopened'); c.checked = true; c.dispatchEvent(new Event('change')); })()`); await sleep(800);
  const n30u = await count(b), s2 = await summary(b);
  R.check('개통 예정 포함을 켜면 같거나 늘고, 요약에 표시', n30u >= n30 && /개통 예정 포함/.test(s2), { n30, n30u });

  // 4. 투자 모드: 시세 표시·시세 낮은 순
  for (let i = 0; i < 40; i++) { if (await b.evaluate(`typeof StationPrice !== 'undefined' && StationPrice.isReady()`)) break; await sleep(250); }
  await b.evaluate(`(() => { const s = document.getElementById('cm-limit'); s.value = '45'; s.dispatchEvent(new Event('change')); })()`); await sleep(800);
  const pp = await b.evaluate(`[...document.querySelectorAll('#cm-list .cm-pp')].filter(e => /평당/.test(e.textContent)).length`);
  R.check('투자 모드: 목록에 평당 시세가 나온다', pp > 20, pp);
  await b.evaluate(`(() => { const s = document.getElementById('cm-sort'); s.value = 'price'; s.dispatchEvent(new Event('change')); })()`); await sleep(400);
  const asc = await b.evaluate(`(() => { const v = [...document.querySelectorAll('#cm-list .cm-pp')].map(e => e.textContent).filter(t => /평당/.test(t)).map(t => +t.replace(/[^0-9]/g, '')); return v.slice(0, 30).every((x, i, a) => i === 0 || a[i - 1] <= x) && v.length > 10; })()`);
  R.check("'시세 낮은 순' 정렬이 오름차순", asc, asc);

  // 5. 목록 항목 → 역 상세
  const name = await b.evaluate(`(() => { const e = document.querySelector('#cm-list button[data-id]'); const n = e.querySelector('span').textContent.split(' ·')[0]; e.click(); return n; })()`);
  await sleep(900);
  const sd = await b.evaluate(`(() => { const p = document.getElementById('sd-panel'); return !!p && p.classList.contains('sd-open') ? p.textContent.slice(0, 200) : ''; })()`);
  R.check('목록 항목을 누르면 그 역의 상세가 열린다', !!sd && sd.includes(name), { name });
  await b.key('Escape', 'Escape', 27); await sleep(500);

  // 6. 다시 열고 Esc 로 닫기
  await b.evaluate(`CommuteMap.show(); true`); await sleep(600);
  await b.evaluate(`document.getElementById('cm-dest').focus()`);
  await b.key('Escape', 'Escape', 27); await sleep(500);
  const closed = await b.evaluate(`document.getElementById('cm-panel').style.display === 'none'`);
  const cleared = await count(b);
  R.check('Esc 로 닫으면 패널이 닫히고 지도 점이 지워진다', closed && cleared === 0, { closed, cleared });

  // 7. 목적지 바꾸기 (동명역 표기)
  await b.evaluate(`CommuteMap.show(); true`); await sleep(500);
  await b.evaluate(`(() => { const i = document.getElementById('cm-dest'); i.value = '시청 · 부산 연제구'; i.dispatchEvent(new Event('change')); })()`); await sleep(900);
  const s3 = await summary(b);
  R.check("목적지를 '시청 · 부산 연제구' 로 바꾸면 부산 기준으로 다시 계산", /시청/.test(s3) && (await b.evaluate(`(() => { const s = map.getSource('cm-dest')._data.features[0].geometry.coordinates; return s[0] > 128.9; })()`)), s3);

  // 8. 역 상세 '이 역까지 통근권 보기' → 그 역이 목적지
  await b.evaluate(`CommuteMap.hide(); showStation(STATIONS.find(s => s.properties.name_ko === '잠실' && s.properties.lines.includes('seoul-subway-line-2')), null); true`);
  for (let i = 0; i < 30; i++) { if (await b.evaluate(`!!document.querySelector('#sd-panel .sd-commute')`)) break; await sleep(250); }
  const hasLink = await b.evaluate(`(() => { const e = document.querySelector('#sd-panel .sd-commute'); if (!e) return false; e.click(); return true; })()`);
  await sleep(1000);
  const s4 = await summary(b);
  const sdClosed = await b.evaluate(`!document.getElementById('sd-panel').classList.contains('sd-open')`);
  R.check("역 상세 '이 역까지 통근권 보기' → 그 역(잠실) 기준 통근권", hasLink && /잠실/.test(s4) && sdClosed, { hasLink, s4, sdClosed });

  const exc = b.logs.filter(l => /EXC/.test(l));
  R.check('예외 0', exc.length === 0, exc.slice(0, 3));
  b.close();
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
