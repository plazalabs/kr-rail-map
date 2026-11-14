/* e2e: 오른쪽 창 접기·펼치기 손잡이 + Esc 로 왼쪽 패널 접기 + 지도만 보기 + 접은 상태 기억 (회장님 피드백 2026-11-15 — "지도가 한눈에 다 보여야 편하다")
 *  - PC: 떡상 패널이 열리면 왼쪽 가장자리에 손잡이 → 누르면 창 접힘(닫히지 않음) · 손잡이는 화면 오른쪽 끝 → 다시 누르면 펼침
 *  - 접은 채 다른 창(게시판)을 열면 펼친 채로 보인다
 *  - Esc: 오른쪽 창 닫힘 → 한 번 더 Esc 면 왼쪽 패널 접힘 (입력칸·메모 모드 끝내는 Esc 는 접지 않음)
 *  - 도구막대 '지도만': 왼쪽·오른쪽 한 번에 접기/펴기 · 왼쪽 접은 상태는 새로 고침 뒤에도 기억
 *  - 휴대폰: 손잡이·지도만 단추 없음(아래 시트는 grip)
 * 실행: node tests/e2e/run.js --only panel-fold
 */
'use strict';
const path = require('path'), os = require('os');
const { launch, sleep, BASE, recorder } = require('./lib/cdp');
const R = recorder('panel-fold');
const SHOTS = path.join(os.tmpdir(), 'kr-rail-map-e2e');
async function ready(b) { for (let k = 0; k < 200; k++) { await sleep(100); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady`).catch(() => false)) break; } await sleep(800); }
const STATE = `(() => { const t = document.getElementById('rpanel-toggle'); const p = document.querySelector('.rkp:not([hidden])');
  const tr = t && t.getBoundingClientRect(), pr = p && p.getBoundingClientRect();
  return { btn: !!t && !t.hidden && getComputedStyle(t).display !== 'none', btnL: tr && Math.round(tr.left), btnR: tr && Math.round(tr.right), w: innerWidth,
    panelShown: !!p && getComputedStyle(p).display !== 'none', panelL: pr && Math.round(pr.left), folded: document.body.classList.contains('rpanel-hidden'),
    exp: t && t.getAttribute('aria-expanded'), rk: window.RocketPanel && RocketPanel.isOpen(), bd: window.BoardPanel && BoardPanel.isOpen(),
    sideHidden: document.body.classList.contains('sidebar-hidden') }; })()`;
const click = (b, id) => b.evaluate(`document.getElementById('${id}').click(); true`);

(async () => {
  const b = await launch({ port: 9811, w: 1366, h: 768 });
  await b.goto(BASE, 300); await ready(b);
  const s0 = await b.evaluate(STATE);
  R.check('창이 없으면 손잡이 없음', !s0.btn, s0);
  await b.evaluate(`RocketPanel.open(); true`); await sleep(1800);
  const s1 = await b.evaluate(STATE);
  R.check('떡상 열면 손잡이가 창 왼쪽 가장자리에 붙음', s1.btn && s1.panelShown && Math.abs(s1.btnR - s1.panelL) <= 2 && s1.exp === 'true', s1);
  await b.shot(path.join(SHOTS, 'panel-fold-open.png'));
  await b.evaluate(`(() => { const li = document.querySelector('#rkp-list li button, #rkp-list li'); if (li) li.click(); return true; })()`); await sleep(800);
  const title0 = await b.evaluate(`(document.getElementById('rkp-title')||{}).textContent`);
  await click(b, 'rpanel-toggle'); await sleep(500);
  const s2 = await b.evaluate(STATE);
  R.check('손잡이 누르면 창 접힘(닫히진 않음) · 손잡이는 화면 오른쪽 끝', !s2.panelShown && s2.rk && s2.folded && s2.btn && Math.abs(s2.btnR - s2.w) <= 2 && s2.exp === 'false', s2);
  await b.shot(path.join(SHOTS, 'panel-fold-folded.png'));
  await click(b, 'rpanel-toggle'); await sleep(500);
  const s3 = await b.evaluate(STATE);
  const title1 = await b.evaluate(`(document.getElementById('rkp-title')||{}).textContent`);
  R.check('다시 누르면 펼침 · 보던 내용 그대로', s3.panelShown && !s3.folded && Math.abs(s3.btnR - s3.panelL) <= 2 && title1 === title0, { s3, title0, title1 });
  // 접은 채 게시판 열기 → 펼친 채로
  await click(b, 'rpanel-toggle'); await sleep(400);
  await b.evaluate(`document.querySelector('#tabbar [data-tab="board"]').click(); true`); await sleep(1200);
  const s4 = await b.evaluate(STATE);
  R.check('접은 채 게시판 열면 펼친 채로 보임', s4.bd && !s4.folded && s4.panelShown && s4.btn, s4);
  // Esc: 창 닫힘 → 한 번 더 Esc 면 왼쪽 패널 접힘
  await b.evaluate(`document.activeElement && document.activeElement.blur(); true`);
  await b.key('Escape', 'Escape', 27); await sleep(500);
  const s5 = await b.evaluate(STATE);
  R.check('Esc → 게시판 닫힘(포커스가 창 밖이어도) · 손잡이 사라짐 · 왼쪽 패널은 그대로', !s5.bd && !s5.btn && !s5.folded && !s5.sideHidden, s5);
  await b.key('Escape', 'Escape', 27); await sleep(500);
  const s6 = await b.evaluate(STATE);
  R.check('한 번 더 Esc → 왼쪽 패널 접힘(지도 한눈에)', s6.sideHidden, s6);
  await click(b, 'sidebar-toggle'); await sleep(400);
  await b.evaluate(`(() => { const i = document.querySelector('#sidebar input[type=search], #sidebar input'); if (i) i.focus(); return !!i; })()`);
  await b.key('Escape', 'Escape', 27); await sleep(400);
  const s7 = await b.evaluate(STATE);
  R.check('입력칸에서 Esc 는 왼쪽 패널을 접지 않음', !s7.sideHidden, s7);
  // 메모 핀 모드를 끝내는 Esc 는 왼쪽 패널을 접지 않는다 (panel-state e2e 에서 발견)
  await click(b, 'memo-btn'); await sleep(300);
  await b.evaluate(`map.getCanvas().focus(); true`);
  await b.key('Escape', 'Escape', 27); await sleep(400);
  const s8 = await b.evaluate(STATE);
  const memoOn = await b.evaluate(`document.getElementById('memo-btn').classList.contains('active')`);
  R.check('메모 모드 끝내는 Esc 는 왼쪽 패널을 접지 않음', !s8.sideHidden && !memoOn, { s8, memoOn });
  // 지도만 보기: 떡상 연 채 누르면 왼쪽·오른쪽 한 번에 접힘 → 다시 누르면 한 번에 펴짐
  await b.evaluate(`RocketPanel.open(); true`); await sleep(1500);
  await click(b, 'maponly-btn'); await sleep(500);
  const m1 = await b.evaluate(STATE);
  const mp1 = await b.evaluate(`document.getElementById('maponly-btn').getAttribute('aria-pressed')`);
  R.check('지도만 → 왼쪽·오른쪽 다 접힘, 떡상은 열린 채', m1.sideHidden && m1.folded && !m1.panelShown && m1.rk && mp1 === 'true', { m1, mp1 });
  await b.shot(path.join(SHOTS, 'panel-fold-maponly.png'));
  await click(b, 'maponly-btn'); await sleep(500);
  const m2 = await b.evaluate(STATE);
  R.check('다시 누르면 한 번에 펴짐', !m2.sideHidden && !m2.folded && m2.panelShown, m2);
  // 왼쪽 접은 상태 기억
  await b.evaluate(`RocketPanel.close(); document.getElementById('sidebar-toggle').click(); true`); await sleep(400);
  await b.goto(BASE, 300); await ready(b); await sleep(600);
  const m3 = await b.evaluate(STATE);
  const m3p = await b.evaluate(`map.getPadding().left`);
  R.check('왼쪽 패널 접은 상태를 새로 고침 뒤에도 기억 (지도 여백도 0)', m3.sideHidden && m3p === 0, { m3, m3p });
  await click(b, 'sidebar-toggle'); await sleep(400);
  await b.goto(BASE, 300); await ready(b); await sleep(600);
  const m4 = await b.evaluate(STATE);
  R.check('펴 두면 다음에도 펴진 채', !m4.sideHidden, m4);
  const exc = b.logs.filter(x => /EXC/.test(x));
  R.check('PC 예외 0', exc.length === 0, exc.slice(0, 3));
  b.close(); await sleep(500);

  const m = await launch({ port: 9812, w: 390, h: 844, mobile: true });
  await m.goto(BASE, 300); await ready(m);
  await m.evaluate(`RocketPanel.open(); true`); await sleep(1800);
  const t1 = await m.evaluate(STATE);
  const mob = await m.evaluate(`(() => { const x = document.getElementById('maponly-btn'); return !x || getComputedStyle(x).display === 'none'; })()`);
  R.check('휴대폰: 손잡이 없음(grip 사용) · 지도만 단추 숨김', !t1.btn && t1.rk && mob, { t1, mob });
  const exc2 = m.logs.filter(x => /EXC/.test(x));
  R.check('휴대폰 예외 0', exc2.length === 0, exc2.slice(0, 3));
  m.close();
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
