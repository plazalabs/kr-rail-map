/* e2e: 과업 측정 이벤트(A③) + 공유 카드 ② 생활권 변화(B) — 종합피드백 12장, 2026-11-14
 *  - Umami 대신 기록용 umami.track 을 걸고: 길찾기 결과 → '길찾기 결과', 시세 탭 → '시세 상세', 첫 화면 TOP3 카드 → 'TOP3 카드'
 *  - 같은 단계는 한 번만, 첫방문·걸린시간 값이 붙는다
 *  - 역 상세 교통 탭 '도심 접근성' 아래 '생활권 변화 카드로 공유' 단추 + 카드 1080×1350 (눈 확인 scratch/share/life.png)
 * 실행: node tests/e2e/run.js --only task-life
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { launch, sleep, BASE, recorder } = require('./lib/cdp');
const R = recorder('task-life');

async function ready(b) {
  for (let i = 0; i < 120; i++) { await sleep(400); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&map.loaded()`).catch(() => false)) break; }
  await sleep(600);
}
const EV = `(window.__ev || []).filter(e => e[0] === '과업').map(e => e[1].단계)`;

(async () => {
  const b = await launch({ port: 9871, w: 1440, h: 900, invest: true });
  try {
    await b.send('Network.setBypassServiceWorker', { bypass: true });
    await b.goto(BASE + '#normal', 800); await ready(b);
    await b.evaluate(`window.__ev = []; window.umami = { track: (n, d) => __ev.push([n, d]) }; true`);
    R.check('KRTrack.task 있음', await b.evaluate(`typeof KRTrack === 'function' && typeof KRTrack.task === 'function'`));

    // 1) 첫 화면 TOP3 카드
    for (let i = 0; i < 30; i++) { if (await b.evaluate(`!!document.querySelector('.hc-top button')`)) break; await sleep(300); }
    const hasTop = await b.evaluate(`(() => { const x = document.querySelector('.hc-top button'); if (!x) return false; x.click(); return true; })()`);
    await sleep(800);
    const e1 = await b.evaluate(EV);
    R.check("TOP3 카드 누르면 과업 'TOP3 카드'", hasTop && e1.includes('TOP3 카드'), { hasTop, e1 });
    await b.evaluate(`(() => { if (window.RocketPanel && RocketPanel.close) RocketPanel.close(); const c = document.querySelector('#rocket-panel .rkp-close'); if (c) c.click(); })(); true`);

    // 2) 역 상세 → 시세 탭
    await b.evaluate(`showStation(STATIONS.find(s => s.properties.name_ko === '종로3가'), null); true`);
    for (let i = 0; i < 40; i++) { await sleep(250); if (await b.evaluate(`!!document.querySelector('#sd-panel .sd-tabs')`)) break; }
    await sleep(500);
    await b.evaluate(`(() => { const t = document.querySelector('#sd-panel .sd-tab[data-tab=p]'); if (t) t.click(); })(); true`);
    await sleep(300);
    await b.evaluate(`(() => { const t = document.querySelector('#sd-panel .sd-tab[data-tab=p]'); if (t) t.click(); })(); true`);
    const e2 = await b.evaluate(EV);
    R.check("시세 탭 → 과업 '시세 상세' (두 번 눌러도 한 번)", e2.filter(x => x === '시세 상세').length === 1, e2);

    // 3) 교통 탭 '생활권 변화 카드로 공유' 단추 + 카드
    await b.evaluate(`(() => { const t = document.querySelector('#sd-panel .sd-tab[data-tab=t]'); if (t) t.click(); })(); true`);
    for (let i = 0; i < 30; i++) { if (await b.evaluate(`!!document.querySelector('#sd-panel .sd-life')`)) break; await sleep(300); }
    const btn = await b.evaluate(`(() => { const x = document.querySelector('#sd-panel .sd-life'); return x ? { text: x.textContent, vis: x.offsetParent !== null } : null; })()`);
    R.check("교통 탭에 '생활권 변화 카드로 공유' 단추", btn && btn.vis && /생활권 변화 카드/.test(btn.text), btn);
    const card = await b.evaluate(`(() => {
      const sid = STATIONS.find(s => s.properties.name_ko === '종로3가').properties.id;
      const s2 = STATIONS.find(s => s.properties.name_ko === '의정부' && StationAccess.of(s.properties.id)); window.__life2 = s2 ? StationShareImage.drawLife({ name: '의정부', rows: StationAccess.of(s2.properties.id).rows, asof: StationAccess.asof() }, {}).toDataURL('image/png') : '';
      const ac = StationAccess.of(sid); if (!ac) return null;
      const c = StationShareImage.drawLife({ name: '종로3가', rows: ac.rows, asof: StationAccess.asof() }, {});
      const s = StationShareImage.lifeSummary(ac.rows);
      return { w: c.width, h: c.height, url: c.toDataURL('image/png'), rows: ac.rows.length, s: { now: s.n30now, aft: s.n30aft }, asof: StationAccess.asof() };
    })()`);
    R.check('카드 1080×1350 · 업무지구 5곳 · 기준일', card && card.w === 1080 && card.h === 1350 && card.rows === 5 && /^\d{4}-\d{2}-\d{2}$/.test(card.asof), card && { w: card.w, h: card.h, rows: card.rows, asof: card.asof, s: card.s });
    if (card) {
      const out = path.join(__dirname, '..', '..', 'scratch', 'share'); fs.mkdirSync(out, { recursive: true });
      fs.writeFileSync(path.join(out, 'life.png'), Buffer.from(card.url.split(',')[1], 'base64'));
      const u2 = await b.evaluate('window.__life2 || ""'); if (u2) fs.writeFileSync(path.join(out, 'life2.png'), Buffer.from(u2.split(',')[1], 'base64'));
    }
    // 신규 연결·긴 이름도 그려지는지 (가짜 값)
    const fake = await b.evaluate(`(() => { const rows = [
        { id: 'cbd', name: '시청', now: null, after: 48, save: null, isNew: true }, { id: 'ybd', name: '여의도', now: 130, after: 60, save: 70 },
        { id: 'gbd', name: '강남', now: 40, after: 40, save: 0 }, { id: 'seoul', name: '서울', now: 25, after: 18, save: 7 }, { id: 'pangyo', name: '판교', now: null, after: null, save: null } ];
      const c = StationShareImage.drawLife({ name: '아주아주긴이름의가상역이름입니다정말로', rows, asof: '2026-11-14' }, { wait: true });
      const s = StationShareImage.lifeSummary(rows);
      return { w: c.width, n30now: s.n30now, n30aft: s.n30aft, best: s.best && s.best.id }; })()`);
    R.check('가짜 값(신규·120분 넘음·자료 없음·긴 이름): 그려지고 요약 1곳→1곳(서울 25→18분)·최대 단축 여의도', fake && fake.w === 1080 && fake.n30now === 1 && fake.n30aft === 1 && fake.best === 'ybd', fake);

    // 4) 길찾기 결과
    await b.evaluate(`(() => { const st = n => STATIONS.find(s => s.properties.name_ko === n);
      setRouteStation(document.getElementById('route-from'), st('강남')); setRouteStation(document.getElementById('route-to'), st('역삼'));
      document.getElementById('route-go').click(); })(); true`);
    for (let i = 0; i < 30; i++) { await sleep(300); if (await b.evaluate(`${EV}.includes('길찾기 결과')`)) break; }
    const e4 = await b.evaluate(`(window.__ev || []).filter(e => e[0] === '과업')`);
    R.check("길찾기 결과 → 과업 '길찾기 결과'", e4.some(e => e[1].단계 === '길찾기 결과'), e4.map(e => e[1].단계));
    R.check('과업마다 첫방문·걸린시간 값', e4.length >= 3 && e4.every(e => ['예', '아니오', '모름'].includes(e[1].첫방문) && /안$|넘게$/.test(e[1].걸린시간)), e4.map(e => e[1]));
  } catch (e) {
    R.check('실행 오류', false, String(e && e.stack || e).slice(0, 300));
  } finally {
    b.close(); await sleep(800);
    R.finish();
  }
})();
