/* e2e: 출퇴근 비교 공유 카드 (회장님 11-14 A — js/station-share.js drawCommute, js/route-compare.js '출퇴근 카드로 공유')
 *  - '개통 예정 포함' 길찾기에 '지금 → 개통 후' 상자 아래 공유 단추, 운행 중만일 때는 없음
 *  - 단추 → 카드 값이 상자 값과 같음(지금·개통 후 분, 환승), 노선에 상태·목표 연도, 계획 노선이면 경고
 *  - 카드 1080×1350
 * 실행: node tests/e2e/run.js --only commute-card
 */
'use strict';
const { launch, sleep, BASE, recorder } = require('./lib/cdp');
const R = recorder('commute-card');

(async () => {
  const b = await launch({ port: 9813, w: 1366, h: 768 });
  await b.goto(BASE + '#normal', 1500);
  for (let i = 0; i < 150; i++) { await sleep(300); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&typeof RouteCompare!=='undefined'`).catch(() => false)) break; }
  await sleep(800);
  const id = n => `STATIONS.find(f => f.properties.name_ko === ${JSON.stringify(n)}).properties.id`;
  const run = (a, c, inc) => b.evaluate(`(() => {
    window.__cc = null; const keep = StationShareImage.saveCommute;
    StationShareImage.saveCommute = info => { window.__cc = info; return Promise.resolve(''); };
    RouteCompare.show(${id(a)}, ${id(c)}, { includeUnopened: ${inc} });
    const box = document.getElementById('route-result'), btn = box.querySelector('.rc-nf-share');
    const times = [...box.querySelectorAll('.rc-nf-time')].map(t => t.textContent);
    if (btn) btn.click();
    StationShareImage.saveCommute = keep;
    return { btn: !!btn, txt: btn ? (btn.textContent.trim() + ' | ' + btn.title) : '', times, info: window.__cc };
  })()`);

  const off = await run('덕정', '삼성', false);
  R.check("운행 중만 길찾기엔 공유 단추 없음", !off.btn, off);

  const on = await run('덕정', '삼성', true);
  const i1 = on.info || {};
  R.check("개통 예정 포함 → '출퇴근 카드로 공유' 단추", on.btn && /출퇴근 카드/.test(on.txt), on.txt);
  R.check('카드 값 = 상자 값 (지금·개통 후 분)', !!i1.now && !!i1.aft && on.times[0] === i1.now.min + '분' && on.times[1] === i1.aft.min + '분' && i1.status === 'better', { times: on.times, info: i1 });
  R.check("노선에 상태·목표 연도 'GTX-C (공사 중 · 2031년)'", (i1.lines || []).some(l => /^GTX-C \(공사 중 · 20\d\d년\)$/.test(l)) && i1.unsure === false, i1.lines);

  const plan = await run('부천종합운동장', '정부과천청사', true);
  R.check('계획 노선(GTX-D)을 타면 경고 켜짐', !!plan.info && plan.info.unsure === true && plan.info.lines.some(l => /GTX-D \(계획/.test(l)), plan.info);

  const nw = await run('은행사거리(가칭)', '광화문', true);
  R.check('지금 못 가는 역 → 새로 연결, 지금 = 없음', !!nw.info && nw.info.status === 'new' && nw.info.now === null && nw.info.aft.min > 0, nw.info);

  // 개통 후 새 길이 환승은 적지만 더 느린 경우(곡산→서울, 11-15 기준 −2분) — 상자는 '지금 = 개통 후', 설명은 '더 걸려 지금 길이 빠름', 카드는 same, 더 빠른 '지금 바로' 탭이 있음
  const wr = await b.evaluate(`(() => { const A = ${id('곡산')}, C = ${id('서울')}; const cmp = RouteCompare.compareNowFuture(A, C);
    RouteCompare.show(A, C, { includeUnopened: true }); const w = document.querySelector('#route-result .rc-nf-why');
    return { st: cmp.status, saved: cmp.savedMin, why: w ? w.textContent : '', nowTab: !!document.querySelector('#route-result .rc-tab[data-tab="now"]'), card: RouteCompare.commuteCardInfo(A, C, cmp).status }; })()`);
  R.check('더 느린 새 길 → 지금 길이 빠르다고 설명, 카드는 변화 없음, 지금 바로 탭 있음', wr.st === 'worse' && wr.nowTab && (/지금 길이 더 빠릅니다|이득이 없습니다/.test(wr.why) && !/시간은 그대로/.test(wr.why) && wr.card === 'same'), wr);
  const size = await b.evaluate(`(() => { const c = StationShareImage.drawCommute(${JSON.stringify(i1)}); return [c.width, c.height]; })()`);
  R.check('카드 1080×1350', size[0] === 1080 && size[1] === 1350, size);
  const exc = b.logs.filter(l => /EXC/.test(l));
  R.check('예외 0', exc.length === 0, exc.slice(0, 3));
  b.close();
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
