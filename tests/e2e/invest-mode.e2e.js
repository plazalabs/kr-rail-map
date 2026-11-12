/* e2e: 투자 모드 스위치 (2026-11-09 회장님 결정 — 기본 꺼짐 + 역 상세 맨 아래 '투자 모드 켜기' 한 줄)
 *  A. 처음 온 사람: 철도 모드. 투자분석 메뉴 없음, 시세·단지·공급 파일을 안 받음, 역 상세에 시세·공급 절 없음, 안내 줄 있음
 *  B. 안내 줄 실클릭 → 투자 모드: 시세 절이 뜨고, 안내 줄이 사라지고, 스위치 눌림 표시, 저장됨
 *  C. 새로고침해도 투자 모드 유지
 *  D. 툴바 스위치 실클릭 → 철도 모드로: 열린 패널에서 시세가 사라짐
 *  E. 공유 링크 ?mode=invest: 그 방문만 투자 모드, 받은 사람 저장값(rail)은 그대로
 * 실행: node tests/e2e/run.js --only invest-mode
 */
'use strict';
const { launch, sleep, BASE, recorder, outDir, ensureToolbar } = require('./lib/cdp');
const path = require('path');
const R = recorder('invest-mode');
const OUT = outDir('invest-mode');
const INVEST_FILES = ['station-price.json', 'station-complex.json', 'station-dev.json', 'station-market.json'];

async function ready(b) {
  for (let i = 0; i < 120; i++) { await sleep(400); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&map.loaded()&&!!map.getLayer('rail-lines')`).catch(() => false)) break; }
  await sleep(600);
}
async function waitFor(b, expr, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await b.evaluate(expr).catch(() => false)) return Date.now() - t0; await sleep(200); }
  return null;
}
async function press(b, sel) {
  await ensureToolbar(b, sel);   // 980px 이하: 툴바는 더보기 시트 안 (작업 1)
  const i = await b.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({block:'center', inline:'nearest'});
    const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width/2, r.y + r.height/2);
    return { x: r.x + r.width/2, y: r.y + r.height/2, on: !!t && (t === e || e.contains(t)), top: t && (t.id || t.className || t.tagName) }; })()`);
  if (!i) return { ok: false, why: '요소 없음' };
  if (!i.on) return { ok: false, why: '가려짐(' + i.top + ')' };
  await b.click(i.x, i.y); await sleep(300);
  return { ok: true };
}
const reqCount = f => `performance.getEntriesByType('resource').filter(e => e.name.split('?')[0].endsWith('/data/${f}')).length`;
const openGangnam = `(() => { const s = STATIONS.find(x => x.properties.name_ko === '강남' && x.properties.lines.includes('seoul-subway-line-2')); StationDetail.show(s); 0 })()`;
const HAS_PRICE = `!!document.querySelector('#sd-panel.sd-open .sd-price')`;
const HAS_DEV = `[...document.querySelectorAll('#sd-panel .sd-sec h3')].some(h => h.textContent === '앞으로 들어올 세대')`;
const HAS_MARKET = `!!document.querySelector('#sd-panel .sd-market-sec')`;
const HAS_ACCESS = `[...document.querySelectorAll('#sd-panel .sd-sec h3')].some(h => h.textContent === '도심 접근성')`;
const HAS_HINT = `!!document.querySelector('#sd-panel .sd-mode-on')`;

(async () => {
  // ── A·B·C·D: 한 프로필에서 (새로고침 포함)
  const b = await launch({ port: 9721, w: 1440, h: 1000 });
  await b.send('Network.setBypassServiceWorker', { bypass: true });
  await b.send('Network.setCacheDisabled', { cacheDisabled: true });
  await b.goto(BASE + '#normal', 800); await ready(b);

  const st0 = await b.evaluate(`({ mode: document.body.dataset.mode, pressed: document.getElementById('mode-btn').getAttribute('aria-pressed'),
    investHidden: document.getElementById('invest-btn').hidden, investShown: getComputedStyle(document.getElementById('invest-btn')).display !== 'none',
    saved: localStorage.getItem('krrail-mode') })`);
  R.check('A. 처음 온 사람 = 철도 모드 (스위치 안 눌림, 저장값 없음)', st0.mode === 'rail' && st0.pressed === 'false' && st0.saved === null, st0);
  R.check('A. 철도 모드에서 투자분석 메뉴 숨김', st0.investHidden && !st0.investShown, st0);

  // 미리 받기(IMPL10)가 끝날 시간을 준다 — 도심 접근성(access.json)은 받고, 투자 자료 3종은 안 받아야 한다
  await waitFor(b, `${reqCount('access.json')} > 0`, 20000); await sleep(3000);
  const pre = await b.evaluate(`({ access: ${reqCount('access.json')}, ${INVEST_FILES.map(f => `'${f}': ${reqCount(f)}`).join(', ')} })`);
  R.check('A. 철도 모드: 시세·단지·공급·실거래7종 파일 요청 0건', INVEST_FILES.every(f => pre[f] === 0), pre);
  R.check('A. 철도 모드: 도심 접근성(철도 정보)은 미리 받음', pre.access === 1, pre);

  await b.evaluate(openGangnam);
  await waitFor(b, HAS_ACCESS, 10000);
  const a1 = await b.evaluate(`({ price: ${HAS_PRICE}, dev: ${HAS_DEV}, market: ${HAS_MARKET}, access: ${HAS_ACCESS}, hint: ${HAS_HINT},
    hintText: (document.querySelector('#sd-panel .sd-mode-on')||{}).textContent || null,
    hintLast: (() => { const h = document.querySelector('#sd-body .sd-mode-hint'); return !!h && !h.nextElementSibling; })() })`);
  R.check('A. 역 상세: 시세·공급·실거래7종 절 없음, 도심 접근성은 있음', !a1.price && !a1.dev && !a1.market && a1.access, a1);
  R.check("A. 역 상세 맨 아래에 '투자 모드 켜기' 안내 한 줄", a1.hint && a1.hintLast && /투자 모드 켜기/.test(a1.hintText || ''), a1);
  await b.shot(path.join(OUT, 'rail-mode.png'));

  // B. 안내 줄 실클릭
  const p1 = await press(b, '#sd-panel .sd-mode-on');
  const priceMs = await waitFor(b, HAS_PRICE, 20000);
  const b1 = await b.evaluate(`({ mode: document.body.dataset.mode, pressed: document.getElementById('mode-btn').getAttribute('aria-pressed'),
    hint: ${HAS_HINT}, dev: ${HAS_DEV}, investShown: getComputedStyle(document.getElementById('invest-btn')).display !== 'none', saved: localStorage.getItem('krrail-mode') })`);
  R.check('B. 안내 줄 실클릭 → 시세 절이 뜸', p1.ok && priceMs !== null, { press: p1, priceMs });
  R.check('B. 투자 모드: 안내 줄 사라짐, 스위치 눌림, 투자분석 메뉴 보임, 저장됨',
    b1.mode === 'invest' && b1.pressed === 'true' && !b1.hint && b1.investShown && b1.saved === 'invest', b1);
  await waitFor(b, HAS_DEV, 15000);
  R.check("B. 투자 모드: '앞으로 들어올 세대' 절도 뜸", await b.evaluate(HAS_DEV));
  const cntB = await b.evaluate(`[${INVEST_FILES.map(reqCount).join(', ')}]`);
  R.check('B. 투자 자료 4종(시세·단지·공급·실거래7종)을 파일마다 1번 받음', cntB.every(n => n === 1), cntB);
  // 실거래 7종 절 (2026-11-09) — 7줄, 칸마다 숫자·'거래 적음'·'자료 없음' 중 하나, 수익률 없음
  const mkMs = await waitFor(b, `!!document.querySelector('#sd-panel .sd-market-sec')`, 15000);
  const mk = await b.evaluate(`(() => { const rows = [...document.querySelectorAll('#sd-panel .mk-table tr')];
    return { rows: rows.map(r => r.dataset.kind), cells: rows.map(r => r.querySelector('td').textContent.slice(0, 40)),
      yield: /수익률/.test((document.querySelector('#sd-panel .sd-market-sec')||{}).textContent || '') }; })()`);
  R.check("B. 투자 모드: '실거래 (7종)' 절에 7줄", mkMs !== null && mk.rows.length === 7, mk);
  R.check('B. 7종 칸은 값·거래 적음·자료 없음 중 하나, 수익률 표시 없음',
    mk.cells.every(c => /만|거래 적음|자료 없음/.test(c)) && !mk.yield, mk);
  await b.shot(path.join(OUT, 'invest-mode.png'));

  // C. 새로고침
  await b.goto(BASE + '#normal', 800); await ready(b);
  const c1 = await b.evaluate(`({ mode: document.body.dataset.mode, pressed: document.getElementById('mode-btn').getAttribute('aria-pressed') })`);
  await b.evaluate(openGangnam);
  const priceC = await waitFor(b, HAS_PRICE, 20000);
  R.check('C. 새로고침 뒤에도 투자 모드 유지, 시세 절 표시', c1.mode === 'invest' && c1.pressed === 'true' && priceC !== null, { c1, priceC });

  // D. 툴바 스위치 실클릭 → 철도 모드. 역 상세 패널은 원래부터 데스크톱에서 툴바 오른쪽(도구·분석·저장 포함)을
  //    덮으므로, 패널을 닫고 누른 뒤 다시 연다.
  await b.evaluate(`StationDetail.hide(), 0`); await sleep(400);
  const p2 = await press(b, '#mode-btn');
  await b.evaluate(openGangnam);
  const goneMs = await waitFor(b, `${HAS_ACCESS} && !(${HAS_PRICE}) && ${HAS_HINT}`, 5000);
  const d1 = await b.evaluate(`({ mode: document.body.dataset.mode, pressed: document.getElementById('mode-btn').getAttribute('aria-pressed'), saved: localStorage.getItem('krrail-mode'),
    dev: ${HAS_DEV}, investShown: getComputedStyle(document.getElementById('invest-btn')).display !== 'none' })`);
  R.check('D. 툴바 스위치 실클릭 → 다시 연 역 상세에 시세 없고 안내 줄 다시 나옴', p2.ok && goneMs !== null, { press: p2, goneMs });
  // 열린 패널도 모드가 바뀌면 바로 다시 그려진다 (안내 줄로 켠 B 와 반대 방향)
  await b.evaluate(`KR_MODE.set('invest'), 0`);
  const backMs = await waitFor(b, HAS_PRICE, 5000);
  await b.evaluate(`KR_MODE.set('rail'), 0`);
  const offMs = await waitFor(b, `!(${HAS_PRICE}) && ${HAS_HINT}`, 5000);
  R.check('D. 패널이 열린 채 모드가 바뀌면 바로 다시 그림 (켜기·끄기)', backMs !== null && offMs !== null, { backMs, offMs });
  R.check('D. 철도 모드로 저장, 공급 절·투자분석 메뉴도 숨김', d1.mode === 'rail' && d1.pressed === 'false' && d1.saved === 'rail' && !d1.dev && !d1.investShown, d1);
  const exc = b.logs.filter(l => /EXC/.test(l));
  R.check('예외 0 (A~D)', exc.length === 0, exc.slice(0, 3));
  b.close(); await sleep(1000);

  // ── E. 공유 링크 ?mode=invest — 받은 사람 저장값(rail)은 그대로
  const e = await launch({ port: 9722, w: 1440, h: 1000 });
  await e.send('Network.setBypassServiceWorker', { bypass: true });
  await e.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { if (!sessionStorage.getItem('__seeded')) { localStorage.setItem('krrail-mode', 'rail'); sessionStorage.setItem('__seeded', '1'); } } catch (e) {}` });
  const url = BASE.includes('?') ? BASE + '&mode=invest' : BASE + '?mode=invest';
  await e.goto(url + '#normal', 800); await ready(e);
  await e.evaluate(openGangnam);
  const priceE = await waitFor(e, HAS_PRICE, 20000);
  const e1 = await e.evaluate(`({ mode: document.body.dataset.mode, saved: localStorage.getItem('krrail-mode'), fromUrl: KR_MODE.fromUrl })`);
  R.check('E. ?mode=invest 링크 → 그 방문은 투자 모드, 시세 표시', e1.mode === 'invest' && e1.fromUrl === true && priceE !== null, { e1, priceE });
  R.check('E. 받은 사람 저장값은 rail 그대로', e1.saved === 'rail', e1);
  await e.goto(BASE + '#normal', 800); await ready(e);
  const e2 = await e.evaluate(`document.body.dataset.mode`);
  R.check('E. 링크 없이 다시 열면 원래대로 철도 모드', e2 === 'rail', e2);
  const excE = e.logs.filter(l => /EXC/.test(l));
  R.check('예외 0 (E)', excE.length === 0, excE.slice(0, 3));
  e.close();
  R.finish();
})().catch(err => { console.error(err); process.exit(1); });
