/* e2e: 나에게 맞는 역 찾기 (js/quiz.js, 2026-11-13)
 *  - 분석 메뉴 → 질문 1(직장 역 자동완성: '강남' Enter) → 2(45분) → 3(상관없음) → 4(지금만) → 결과 TOP 3 + 규칙 문장
 *  - TOP 3 는 Logic.pick 으로 직접 계산한 것과 같다 (CommuteMap.compute)
 *  - '지도에서 보기' → 지도가 그 역으로, 역 상세 열림
 *  - 결과 주소 ?quiz=1&d=…&t=45&b=0&u=0 로 바로 같은 결과
 *  - 휴대폰 390: 패널이 화면 안
 * 실행: node tests/e2e/run.js --only quiz
 */
'use strict';
const { launch, sleep, BASE, recorder } = require('./lib/cdp');
const R = recorder('quiz');
async function ready(b) {
  for (let i = 0; i < 120; i++) { await sleep(300); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&!!map.getSource('lines')&&typeof StationQuiz!=='undefined'`).catch(() => false)) break; }
  await sleep(800);
}
const ent = async b => { await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' }); await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); };

(async () => {
  let b = await launch({ port: 9701, w: 1440, h: 900 });
  await b.goto(BASE + '#normal', 1500); await ready(b);
  await b.evaluate(`document.getElementById('quiz-btn').click(); 0`); await sleep(400);
  const q1 = await b.evaluate(`({ open: !document.getElementById('qz-panel').hidden, h: document.querySelector('#qz-panel h2').textContent, focus: document.activeElement && document.activeElement.id })`);
  R.check('분석 메뉴 → 질문 1 (직장 역), 입력칸에 커서', q1.open && /직장/.test(q1.h) && q1.focus === 'qz-dest', q1);
  await b.type('강남'); await sleep(400); await ent(b); await sleep(400);
  const q2 = await b.evaluate(`document.querySelector('#qz-panel h2').textContent`);
  R.check("'강남' Enter → 질문 2 '강남까지 몇 분'", /강남까지 몇 분/.test(q2), q2);
  const click = async v => b.evaluate(`(() => { const x = [...document.querySelectorAll('#qz-panel .qz-opts button')].find(e => e.dataset.v === ${JSON.stringify(v)}); if (!x) return false; x.click(); return true; })()`);
  await click('45'); await sleep(200); await click('0'); await sleep(200); await click('0'); await sleep(1200);
  const res = await b.evaluate(`(() => { const p = document.getElementById('qz-panel'); return { names: [...p.querySelectorAll('.qz-res b')].map(x => x.textContent), rule: /고른 규칙/.test(p.textContent), cond: (p.querySelector('.qz-hint') || {}).textContent || '' }; })()`);
  const want = await b.evaluate(`(() => { const d = STATIONS.find(s => s.properties.name_ko === '강남' && s.properties.lines.includes('seoul-subway-line-2')) || STATIONS.find(s => s.properties.name_ko === '강남');
    const a = StationQuiz.answers(); const now = CommuteMap.compute(a.dest, 45, { withUnopened: false });
    return { dest: a.dest, top: StationQuiz.Logic.pick(now, null, null, { budget: 0, withUnopened: false, dest: a.dest }).top.map(x => x.name) }; })()`);
  R.check('결과 TOP 3 + 규칙 문장, 직접 계산과 같음', res.names.length === 3 && res.rule && res.names.join() === want.top.join(), { res, want });
  await b.evaluate(`document.querySelector('#qz-panel .qz-res button[data-id]').click(); 0`); await sleep(1300);
  const go = await b.evaluate(`({ closed: document.getElementById('qz-panel').hidden, sd: document.getElementById('sd-panel') && document.getElementById('sd-panel').classList.contains('sd-open') })`);
  R.check("'지도에서 보기' → 패널 닫히고 역 상세 열림", go.closed && go.sd, go);
  const exc = b.logs.filter(l => /EXC/.test(l));
  R.check('예외 0', exc.length === 0, exc.slice(0, 3));
  b.close();

  b = await launch({ port: 9702, w: 390, h: 844, mobile: true });
  await b.goto(BASE + '?quiz=1&d=' + encodeURIComponent(want.dest) + '&t=45&b=0&u=0#normal', 1500); await ready(b);
  let names = [];
  for (let i = 0; i < 30; i++) { names = await b.evaluate(`[...document.querySelectorAll('#qz-panel .qz-res b')].map(x => x.textContent)`).catch(() => []); if (names.length) break; await sleep(300); }
  const inView = await b.evaluate(`(() => { const r = document.getElementById('qz-panel').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1; })()`);
  R.check('결과 주소로 바로 같은 TOP 3 (휴대폰)', names.join() === want.top.join(), { names, want: want.top });
  R.check('휴대폰: 패널이 화면 안', inView);
  const exc2 = b.logs.filter(l => /EXC/.test(l));
  R.check('예외 0 (휴대폰)', exc2.length === 0, exc2.slice(0, 3));
  b.close();
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
