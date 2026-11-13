/* e2e: 휴대폰 아래 탭 5칸 (디자인 결함 전수 수정 작업 1, 2026-11-12)
 *  - 390×844 휴대폰 흉내: 탭 5칸(길찾기·떡상·시세·게시판·더보기)이 화면 맨 아래, 툴바는 숨김
 *  - 탭을 진짜로 눌러서(좌표 클릭) 길찾기 패널·떡상 패널이 열리고 그 탭에 선택 표시
 *  - 시세 = 투자 모드 켜지고 전세가율 색칠·범례
 *  - 더보기 = 툴바가 시트로 뜨고, 안의 버튼(노선도)을 누르면 시트가 닫힘, Esc 로도 닫힘
 *  - 1440 PC: 탭 바가 왼쪽 세로 레일(노선·길찾기·떡상·시세·게시판·사용법), 툴바 보임, 레일 '노선'으로 사이드바 접고 펴기
 *  - 사용법(휴대폰 더보기 시트 / PC 레일)으로 안내 카드 다시 열기, 최근 본 역(빈 검색창)
 * 실행: node tests/e2e/run.js --only tabbar
 */
'use strict';
const { launch, sleep, BASE, recorder } = require('./lib/cdp');
const R = recorder('tabbar');

async function ready(b) {
  for (let i = 0; i < 120; i++) { await sleep(400); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady`).catch(() => false)) return true; }
  return false;
}
const center = sel => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`;
async function settle(b) { for (let i = 0; i < 30; i++) { await sleep(100); if (await b.evaluate(`!document.getAnimations().some(a => a.playState === 'running')`).catch(() => true)) return; } }
async function tap(b, sel) { await settle(b); const p = await b.evaluate(center(sel)); if (p) await b.click(p.x, p.y); await sleep(500); await settle(b); return !!p; }
const cur = t => `document.querySelector('#tabbar [data-tab="${t}"]').getAttribute('aria-current') === 'true'`;

(async () => {
  const b = await launch({ port: 9851, w: 390, h: 844, mobile: true });
  await b.send('Network.setBypassServiceWorker', { bypass: true });
  await b.goto(BASE + '#normal', 800);
  R.check('자료 준비', await ready(b));

  const lay = await b.evaluate(`(() => {
    const bar = document.getElementById('tabbar'); const r = bar.getBoundingClientRect();
    const tabs = [...bar.querySelectorAll('[data-tab]')].filter(e => getComputedStyle(e).display !== 'none').map(e => (e.querySelector('span') || e).textContent.trim());
    return { tabs, bottom: Math.round(r.bottom), h: Math.round(r.height), vis: getComputedStyle(bar).display,
      tb: getComputedStyle(document.getElementById('toolbar')).display };
  })()`);
  R.check('탭 5칸 이름', lay.tabs.join(',') === '길찾기,떡상,시세,게시판,더보기', lay.tabs);
  R.check('탭 바가 화면 맨 아래', lay.vis !== 'none' && lay.bottom === 844 && lay.h >= 56, lay);
  R.check('평소엔 툴바 숨김', lay.tb === 'none', lay.tb);

  // 맨 위 검색 칸 (시안 C): 보이고, 누르면 서랍이 열리고 진짜 검색창에 커서
  const ms = await b.evaluate(`(() => { const r = document.getElementById('m-search').getBoundingClientRect(); return { top: Math.round(r.top), w: Math.round(r.width), vis: getComputedStyle(document.getElementById('m-search')).display !== 'none' }; })()`);
  R.check('휴대폰 맨 위 검색 칸 보임', ms.vis && ms.top <= 12 && ms.w > 200, ms);
  await tap(b, '#m-search'); await sleep(400);
  R.check('검색 칸 누르면 서랍 열리고 검색창에 커서', await b.evaluate(`document.body.classList.contains('drawer-open') && document.activeElement === document.getElementById('search')`));
  await b.evaluate(`window.UI && UI.closeDrawer(); document.activeElement && document.activeElement.blur(); true`); await sleep(400); await settle(b);
  await tap(b, '#tabbar [data-tab="route"]');
  R.check('길찾기 탭 → 길찾기 패널 열림 + 선택 표시', await b.evaluate(`!document.getElementById('route-panel').hidden && ${cur('route')}`));
  await tap(b, '#tabbar [data-tab="rocket"]');
  await sleep(1200);
  R.check('떡상 탭 → 떡상 패널 열림 + 선택 표시', await b.evaluate(`(() => { const p = document.getElementById('rocket-panel'); return !!p && !p.hidden && ${cur('rocket')}; })()`));
  await settle(b);
  const over = await b.evaluate(`(() => { const p = document.getElementById('rocket-panel').getBoundingClientRect(); const t = document.getElementById('tabbar').getBoundingClientRect(); return Math.round(p.bottom - t.top); })()`);
  R.check('떡상 시트가 탭 바를 가리지 않음 (겹침 2px 이하)', over <= 2, over);
  await b.evaluate(`document.querySelector('#rocket-panel .rkp-close') && document.querySelector('#rocket-panel .rkp-close').click(); true`);
  await sleep(400);

  await tap(b, '#tabbar [data-tab="price"]');
  await sleep(1500);
  R.check('시세 탭 → 투자 모드 + 전세가율 색칠·범례', await b.evaluate(`KR_MODE.isInvest() && document.getElementById('layer-jeonse').checked && !document.getElementById('jn-legend').hidden && ${cur('price')}`));

  await tap(b, '#tabbar [data-tab="more"]');
  const sheet = await b.evaluate(`(() => { const t = document.getElementById('toolbar'); const r = t.getBoundingClientRect(); const bar = document.getElementById('tabbar').getBoundingClientRect();
    return { disp: getComputedStyle(t).display, above: r.bottom <= bar.top + 1, ids: ['route-btn','diagram-btn','locate-btn','mode-btn'].every(id => { const e = document.getElementById(id); return e && e.getBoundingClientRect().width > 0; }) }; })()`);
  R.check('더보기 → 툴바가 탭 바 위 시트로', sheet.disp !== 'none' && sheet.above && sheet.ids, sheet);
  R.check('더보기 시트에 사용법 버튼', await b.evaluate(`(() => { const e = document.getElementById('guide-btn'); return !!e && e.getBoundingClientRect().width > 0; })()`));
  await b.key('Escape', 'Escape', 27); await sleep(300);
  R.check('Esc → 시트 닫힘', await b.evaluate(`getComputedStyle(document.getElementById('toolbar')).display === 'none'`));
  await tap(b, '#tabbar [data-tab="more"]');
  await tap(b, '#diagram-btn');
  await sleep(800);
  R.check('시트 안 버튼(노선도) 누르면 시트 닫힘', await b.evaluate(`!document.body.classList.contains('tb-more-open')`));

  const exc = b.logs.filter(l => /EXC/.test(l));
  R.check('예외 0', exc.length === 0, exc.slice(0, 3));
  await b.close();

  const d = await launch({ port: 9852, w: 1440, h: 1000 });
  await d.send('Network.setBypassServiceWorker', { bypass: true });
  await d.goto(BASE + '#normal', 800);
  await ready(d);
  const rail = await d.evaluate(`(() => { const t = document.getElementById('tabbar'); const r = t.getBoundingClientRect();
    return { disp: getComputedStyle(t).display, x: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height), vh: innerHeight,
      tabs: [...t.querySelectorAll('[data-tab]')].filter(e => getComputedStyle(e).display !== 'none').map(e => (e.querySelector('span') || e).textContent.trim()),
      tb: getComputedStyle(document.getElementById('toolbar')).display, sbLeft: Math.round(document.getElementById('sidebar').getBoundingClientRect().left) }; })()`);
  R.check('PC: 왼쪽 세로 레일 + 툴바 보임', rail.disp !== 'none' && rail.x === 0 && rail.w <= 72 && rail.h === rail.vh && rail.tb !== 'none' && rail.sbLeft >= rail.w, rail);
  R.check('PC 레일 항목', rail.tabs.join(',') === '노선,길찾기,떡상,시세,게시판,사용법', rail.tabs);
  const sideP = await d.evaluate(center('#tabbar [data-tab="side"]'));
  await d.click(sideP.x, sideP.y); await sleep(500);
  const hid = await d.evaluate(`document.body.classList.contains('sidebar-hidden') && getComputedStyle(document.getElementById('sidebar')).display === 'none'`);
  await d.click(sideP.x, sideP.y); await sleep(500);
  const back = await d.evaluate(`!document.body.classList.contains('sidebar-hidden') && document.querySelector('#tabbar [data-tab="side"]').getAttribute('aria-current') === 'true'`);
  R.check('PC 레일 노선 → 사이드바 접고 다시 펴기', hid && back, { hid, back });
  await d.evaluate(`localStorage.setItem('krrail-guide-seen', '1'); true`);
  const helpP = await d.evaluate(center('#tabbar [data-tab="help"]'));
  await d.click(helpP.x, helpP.y); await sleep(500);
  R.check('PC 레일 사용법 → 안내 카드 다시 열림 (이미 본 사람도)', await d.evaluate(`!!document.getElementById('guide-card')`));
  await d.evaluate(`window.Guide && Guide.close(); true`);
  // 최근 본 역: 역 하나 열고, 빈 검색창 누르면 그 역이 맨 위
  await d.evaluate(`localStorage.removeItem('krrail-recent-stations'); showStation(STATIONS.find(f => f.properties.name_ko === '서울') || STATIONS[0], null); true`);
  await sleep(600);
  await d.evaluate(`document.getElementById('search').value = ''; document.getElementById('search').blur(); true`);
  const sp = await d.evaluate(center('#search'));
  await d.click(sp.x, sp.y); await sleep(400);
  const rec = await d.evaluate(`({ head: !!document.querySelector('#search-results .hit-head'), first: (document.querySelector('#search-results .hit:not(.hit-action) .hit-name') || {}).textContent || null })   // 2026-11-13: 맨 위는 '빠른 실행'(검색 팔레트), 그 아래 최근 본 역`);
  R.check('빈 검색창 → 최근 본 역 (방금 연 역이 맨 위)', rec.head && rec.first === '서울', rec);
  // 작업 7: 직접 고른 테마가 없으면 기기 '어둡게' 설정을 따른다, 직접 고른 게 있으면 그게 우선
  await d.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await d.evaluate(`localStorage.removeItem('krrail-theme'); true`);
  await d.goto('about:blank', 200); await d.goto(BASE + '#normal', 800); await ready(d);   // 같은 주소면 새로 안 읽으므로 빈 쪽을 거친다
  R.check('기기 어둡게 + 고른 테마 없음 → 어두운 테마', await d.evaluate(`document.body.dataset.theme`) === 'dark');
  await d.evaluate(`localStorage.setItem('krrail-theme', 'light'); true`);
  await d.goto('about:blank', 200); await d.goto(BASE + '#normal', 800); await ready(d);   // 같은 주소면 새로 안 읽으므로 빈 쪽을 거친다
  R.check('직접 고른 밝은 테마가 기기 설정보다 우선', await d.evaluate(`document.body.dataset.theme`) === 'light');
  await d.evaluate(`localStorage.removeItem('krrail-theme'); true`);
  await d.close();
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
