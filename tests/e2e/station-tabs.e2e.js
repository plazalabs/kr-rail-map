/* e2e: 역 상세 탭 4개 (F3, 시안 C — 2026-11-13)
 *  - 투자 모드: 탭 [교통 | 시세 | 개발 | 이야기], 처음엔 교통. 접근성·노선은 교통, 전세가율·실거래는 시세, 공급은 개발, 이야기는 이야기 탭에
 *  - 고르지 않은 탭 패널은 hidden (보이지 않고 Tab 으로도 안 들어감), 탭 버튼은 role=tab · aria-selected · aria-controls
 *  - 키보드 ←/→ 로 탭 이동, 고른 탭은 다른 역을 열어도 유지
 *  - 출발·도착 단추는 어느 탭에서든 화면 안(맨 아래 고정)
 *  - 철도 모드: 시세·개발 탭이 없고 투자 모드 안내는 교통 탭에. 시세 탭을 기억하고 있다가 철도 모드가 되면 교통으로
 *  - 휴대폰(390×844)에서도 탭이 보이고 눌린다
 * 실행: node tests/e2e/run.js --only station-tabs
 */
'use strict';
const { launch, sleep, BASE, recorder } = require('./lib/cdp');
const R = recorder('station-tabs');

async function ready(b) {
  for (let i = 0; i < 120; i++) { await sleep(400); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&map.loaded()`).catch(() => false)) break; }
  await sleep(600);
}
async function open(b, name, line, waitSel) {
  await b.evaluate(`showStation(STATIONS.find(s => s.properties.name_ko === ${JSON.stringify(name)}${line ? ` && s.properties.lines.includes(${JSON.stringify(line)})` : ''}), null); true`);
  for (let i = 0; i < 40; i++) { await sleep(250); if (await b.evaluate(`!!document.querySelector(${JSON.stringify(waitSel || '#sd-panel .sd-tabs')})`)) break; }
  await sleep(300);
}
const STATE = `(() => {
  const P = document.getElementById('sd-panel');
  const tabs = [...P.querySelectorAll('.sd-tab')].map(t => ({ k: t.dataset.tab, label: t.textContent.trim(), sel: t.getAttribute('aria-selected'), role: t.getAttribute('role'), ctl: t.getAttribute('aria-controls'), ti: t.tabIndex }));
  const panes = Object.fromEntries([...P.querySelectorAll('.sd-pane')].map(p => [p.dataset.pane, { hidden: p.hidden, role: p.getAttribute('role'), text: p.textContent.replace(/\\s+/g, ' ').slice(0, 2000) }]));
  const act = P.querySelector('.sd-actions [data-act=from]');
  const r = act && act.getBoundingClientRect(); const pr = P.getBoundingClientRect();
  return { tabs, panes, tablist: !!P.querySelector('[role=tablist]'), actIn: !!r && r.height > 0 && r.top >= pr.top && r.bottom <= Math.min(pr.bottom, innerHeight) + 1,
    visible: [...P.querySelectorAll('.sd-pane')].filter(p => p.offsetParent !== null).map(p => p.dataset.pane) };
})()`;

(async () => {
  const b = await launch({ port: 9861, w: 1440, h: 900, invest: true });
  await b.send('Network.setBypassServiceWorker', { bypass: true });
  await b.goto(BASE + '#normal', 800); await ready(b);
  await open(b, '일산', 'gyeongui-jungang-line', '#sd-panel .sd-jeonse-sec .jn-pct');
  let s = await b.evaluate(STATE);
  R.check('투자 모드: 탭 4개 [교통 시세 개발 이야기] + tablist', s.tablist && s.tabs.map(t => t.label).join(',') === '교통,시세,개발,이야기', s.tabs.map(t => t.label));
  R.check('처음엔 교통 탭만 보이고 나머지 패널은 hidden', s.tabs[0].sel === 'true' && s.visible.join() === 't' && s.panes.p.hidden && s.panes.d.hidden && s.panes.k.hidden, s.visible);
  R.check('탭 ARIA: role=tab · aria-controls → tabpanel · 고른 탭만 tabIndex 0', s.tabs.every(t => t.role === 'tab' && s.panes[t.ctl.replace('sd-pane-', '')] && s.panes[t.ctl.replace('sd-pane-', '')].role === 'tabpanel') && s.tabs.filter(t => t.ti === 0).length === 1, s.tabs);
  R.check('교통 탭: 도심 접근성 · 경유 노선 · 인접역 · 출구', /도심 접근성/.test(s.panes.t.text) && /경유 노선/.test(s.panes.t.text) && /인접역/.test(s.panes.t.text) && /출구/.test(s.panes.t.text), s.panes.t.text.slice(0, 160));
  R.check('시세 탭: 전세가율 · 실거래 (교통 탭엔 없음)', /전세가율/.test(s.panes.p.text) && /실거래/.test(s.panes.p.text) && !/전세가율 \(전세/.test(s.panes.t.text), s.panes.p.text.slice(0, 160));
  R.check('개발 탭: 공급 절 또는 자료 없음 한 줄', s.panes.d.text.length > 5, s.panes.d.text.slice(0, 120));
  R.check('이야기 탭: 이 역 이야기 자리', s.panes.k.text.length > 5, s.panes.k.text.slice(0, 120));
  R.check('출발·도착 단추가 화면 안 (교통 탭)', s.actIn);

  // 시세 탭 누르기 → 시세만 보임 · 단추는 여전히 화면 안
  await b.evaluate(`document.querySelector('#sd-panel .sd-tab[data-tab=p]').click(); true`); await sleep(300);
  s = await b.evaluate(STATE);
  R.check('시세 탭을 누르면 시세 패널만 보인다', s.visible.join() === 'p' && s.tabs[1].sel === 'true' && s.tabs[1].ti === 0, s.visible);
  const jn = await b.evaluate(`(document.querySelector('#sd-panel .sd-jeonse-sec') || {}).innerText || ''`);
  R.check('시세 탭에서 전세가율이 눈에 보인다(innerText)', /\d+%/.test(jn), jn.slice(0, 80));
  R.check('출발·도착 단추가 화면 안 (시세 탭)', s.actIn);

  // 키보드: 시세 탭에 포커스 → → 개발, ← ← 교통 → End 이야기
  await b.evaluate(`document.querySelector('#sd-panel .sd-tab[data-tab=p]').focus(); true`);
  await b.key('ArrowRight', 'ArrowRight', 39); await sleep(200);
  const k1 = await b.evaluate(`({ a: document.activeElement.dataset.tab, v: [...document.querySelectorAll('#sd-panel .sd-pane')].filter(p => !p.hidden).map(p => p.dataset.pane).join() })`);
  await b.key('ArrowLeft', 'ArrowLeft', 37); await b.key('ArrowLeft', 'ArrowLeft', 37); await sleep(200);
  const k2 = await b.evaluate(`document.activeElement.dataset.tab`);
  await b.key('End', 'End', 35); await sleep(200);
  const k3 = await b.evaluate(`document.activeElement.dataset.tab`);
  R.check('키보드 → / ← / End 로 탭 이동(포커스·패널 함께)', k1.a === 'd' && k1.v === 'd' && k2 === 't' && k3 === 'k', { k1, k2, k3 });

  // 고른 탭 기억: 시세 고르고 다른 역 → 시세 탭 그대로
  await b.evaluate(`StationDetail.selectTab('p'); true`); await sleep(200);
  await open(b, '잠실', 'seoul-subway-line-2');
  s = await b.evaluate(STATE);
  R.check('시세 탭을 고른 채 다른 역(잠실)을 열면 시세 탭 유지', s.visible.join() === 'p' && /전세가율|실거래/.test(s.panes.p.text), s.visible);

  // 가격 흐름 (G2): 시세 탭 안, 반기 막대 8개, 마감 전 반기는 흐리게(*), 인과 아님 안내, 막대가 실제로 보임
  for (let i = 0; i < 30; i++) { if (await b.evaluate(`!!document.querySelector('#sd-pane-p .sd-trend-sec')`)) break; await sleep(250); }
  const tr = await b.evaluate(`(() => { const sec = document.querySelector('#sd-pane-p .sd-trend-sec'); if (!sec) return null;
    const cols = [...sec.querySelectorAll('.pt-col')]; const bars = cols.map(c => c.querySelector('.pt-bar i')).filter(Boolean).map(i => i.getBoundingClientRect().height);
    return { n: cols.length, partial: sec.querySelectorAll('.pt-partial').length, aria: cols.map(c => c.getAttribute('aria-label')).slice(-1)[0], sum: (sec.querySelector('.pt-sum') || {}).textContent || '',
      note: sec.querySelector('.pt-note').textContent, maxBar: Math.max(0, ...bars), inT: !!document.querySelector('#sd-pane-t .sd-trend-sec') }; })()`);
  R.check('가격 흐름: 시세 탭에 반기 막대 8개 · 마감 전 반기 1개 흐리게 · 교통 탭엔 없음', !!tr && tr.n === 8 && tr.partial === 1 && !tr.inT && tr.maxBar > 30, tr);
  const ov = await b.evaluate(`[...document.querySelectorAll('#sd-pane-p .pt-v, #sd-pane-p .pt-h')].filter(e => e.scrollWidth > e.parentElement.clientWidth + 1 || e.getBoundingClientRect().right > document.querySelector('#sd-panel').getBoundingClientRect().right).map(e => e.textContent)`);
  R.check('가격 흐름: 막대 위 값·반기 글자가 칸 밖으로 안 넘침 (PC)', ov.length === 0, ov);
  R.check("가격 흐름: 변화율 한 줄 + '7~9월만' · '철도 개통의 효과를 뜻하지 않습니다' 안내 + 막대마다 낭독용 이름", !!tr && /%/.test(tr.sum) && /7~9월만/.test(tr.note) && /효과를 뜻하지 않습니다/.test(tr.note) && /26 하반기\(7~9월만\)/.test(tr.aria), tr);
  const exc1 = b.logs.filter(l => /EXC/.test(l));
  b.close(); await sleep(800);

  // 철도 모드: 시세·개발 탭 없음 · 투자 모드 안내는 교통 탭
  const r = await launch({ port: 9862, w: 1440, h: 900 });
  await r.send('Network.setBypassServiceWorker', { bypass: true });
  await r.goto(BASE + '#normal', 800); await ready(r);
  await open(r, '일산', 'gyeongui-jungang-line');
  s = await r.evaluate(STATE);
  R.check('철도 모드: 탭 2개 [교통 이야기]', s.tabs.map(t => t.label).join(',') === '교통,이야기', s.tabs.map(t => t.label));
  R.check('철도 모드: 투자 모드 안내가 교통 탭에 보인다', await r.evaluate(`(() => { const e = document.querySelector('#sd-pane-t .sd-mode-on'); return !!e && e.offsetParent !== null; })()`));
  R.check('없는 탭 고르기는 false', await r.evaluate(`StationDetail.selectTab('p') === false`));
  const exc2 = r.logs.filter(l => /EXC/.test(l));
  r.close(); await sleep(800);

  // 휴대폰
  const m = await launch({ port: 9863, w: 390, h: 844, mobile: true, invest: true });
  await m.send('Network.setBypassServiceWorker', { bypass: true });
  await m.goto(BASE + '#normal', 800); await ready(m);
  await open(m, '강남', 'seoul-subway-line-2');
  const mt = await m.evaluate(`(() => { const t = document.querySelector('#sd-panel .sd-tab[data-tab=d]'); if (!t) return null; const r = t.getBoundingClientRect(); return { inVp: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth, h: r.height }; })()`);
  R.check('휴대폰: 탭 줄이 화면 안, 누를 만한 높이(≥32px)', !!mt && mt.inVp && mt.h >= 32, mt);
  await m.evaluate(`document.querySelector('#sd-panel .sd-tab[data-tab=d]').click(); true`); await sleep(300);
  s = await m.evaluate(STATE);
  R.check('휴대폰: 개발 탭 누르면 개발만 · 단추는 화면 안', s.visible.join() === 'd' && s.actIn, { v: s.visible, actIn: s.actIn });
  await m.evaluate(`StationDetail.selectTab('p'); 0`); await sleep(300);
  for (let i = 0; i < 30; i++) { if (await m.evaluate(`!!document.querySelector('#sd-pane-p .pt-col')`)) break; await sleep(250); }
  const mov = await m.evaluate(`(() => { const c = [...document.querySelectorAll('#sd-pane-p .pt-v, #sd-pane-p .pt-h')]; return { n: c.length, over: c.filter(e => e.scrollWidth > e.parentElement.clientWidth + 1 || e.getBoundingClientRect().right > innerWidth).map(e => e.textContent) }; })()`);
  R.check('휴대폰: 가격 흐름 막대 글자가 칸·화면 밖으로 안 넘침', mov.n === 16 && mov.over.length === 0, mov);
  const exc3 = m.logs.filter(l => /EXC/.test(l));
  m.close();

  const exc = exc1.concat(exc2, exc3);
  R.check('예외 0', exc.length === 0, exc.slice(0, 3));
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
