/* e2e: 개통 전/후 지도 공유 카드 (회장님 11-14 B — js/station-share.js drawReach, js/commute.js '개통 전/후 지도 카드로 공유')
 *  - 통근권 요약 아래 공유 단추, 누르면 카드 값 = 고른 목적지·고른 분
 *  - 지금(운행 중만) ⊆ 개통 후(모두) — 새 노선이 생겨서 원래 닿던 역이 빠지면 안 됨, 같은 역은 개통 후가 더 늦으면 안 됨
 *  - 지금 개수 = 패널에서 '개통 예정 포함' 끄고 본 개수 (카드와 화면이 같은 계산)
 *  - 카드 1080×1350, 예외 0
 * 실행: node tests/e2e/run.js --only reach-card
 */
'use strict';
const { launch, sleep, BASE, recorder } = require('./lib/cdp');
const R = recorder('reach-card');

(async () => {
  const b = await launch({ port: 9814, w: 1366, h: 768 });
  await b.goto(BASE + '#normal', 1500);
  for (let i = 0; i < 150; i++) { await sleep(300); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&typeof CommuteMap!=='undefined'`).catch(() => false)) break; }
  await sleep(800);

  const run = (n, lim) => b.evaluate(`(() => {
    const s = STATIONS.find(f => f.properties.name_ko === ${JSON.stringify(n)});
    CommuteMap.show(s.properties.id);
    const sel = document.getElementById('cm-limit'); sel.value = '${lim}'; sel.dispatchEvent(new Event('change'));
    window.__rc = null; const keep = StationShareImage.saveReach;
    StationShareImage.saveReach = info => { window.__rc = info; return Promise.resolve(''); };
    const btn = document.querySelector('.cm-reach-share');
    if (btn) btn.click();
    StationShareImage.saveReach = keep;
    const info = window.__rc;
    if (!info) return { btn: !!btn, info: null };
    const aft = new Map(info.aft.map(r => [r.id, r.min]));
    const missing = info.now.filter(r => !aft.has(r.id)).map(r => r.name);
    const slower = info.now.filter(r => aft.has(r.id) && aft.get(r.id) > r.min).map(r => r.name + ' ' + r.min + '→' + aft.get(r.id));
    const sum = StationShareImage.reachSummary(info);
    const cv = StationShareImage.drawReach(info);
    return { btn: !!btn, txt: btn.textContent.trim(), name: info.name, limit: info.limit, n: info.now.length, m: info.aft.length,
      added: sum.added.length, missing, slower, size: [cv.width, cv.height],
      overLimit: info.aft.filter(r => r.min > info.limit).length + info.now.filter(r => r.min > info.limit).length };
  })()`);

  for (const [n, lim] of [['광화문', 30], ['삼성', 45]]) {
    const r = await run(n, lim);
    R.check(`${n} ${lim}분: 공유 단추 있음`, r.btn && /지도 카드/.test(r.txt || ''), r.txt);
    R.check(`${n} ${lim}분: 카드 값 = 고른 목적지·분`, r.name === n && r.limit === lim, { name: r.name, limit: r.limit });
    R.check(`${n} ${lim}분: 지금 ⊆ 개통 후 (빠지는 역 없음)`, Array.isArray(r.missing) && r.missing.length === 0, r.missing);
    R.check(`${n} ${lim}분: 개통 후가 더 늦어지는 역 없음`, Array.isArray(r.slower) && r.slower.length === 0, r.slower);
    R.check(`${n} ${lim}분: 새로 닿는 역 = 개통 후 − 지금`, r.added === r.m - r.n && r.m >= r.n, { n: r.n, m: r.m, added: r.added });
    R.check(`${n} ${lim}분: 모든 역이 제한 시간 안`, r.overLimit === 0, r.overLimit);
    R.check(`${n} ${lim}분: 카드 1080×1350`, r.size && r.size[0] === 1080 && r.size[1] === 1350, r.size);
  }

  // 화면과 같은 계산인지 — '개통 예정 포함' 끄고 compute 개수 = 카드의 지금 개수
  const same = await b.evaluate(`(() => {
    const s = STATIONS.find(f => f.properties.name_ko === '광화문');
    const a = CommuteMap.compute(s.properties.id, 30, { withUnopened: false }).length;
    CommuteMap.show(s.properties.id);
    const sel = document.getElementById('cm-limit'); sel.value = '30'; sel.dispatchEvent(new Event('change'));
    return { a, b: CommuteMap.reachCardInfo().now.length };
  })()`);
  R.check('지금 개수 = 운행 중만 계산 개수', same.a === same.b && same.a > 0, same);

  const exc = b.logs.filter(l => /EXC/.test(l));
  R.check('예외 0', exc.length === 0, exc.slice(0, 3));
  b.close();
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
