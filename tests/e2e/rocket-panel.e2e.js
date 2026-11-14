/* e2e: 지도 안 떡상 패널 (js/rocket-panel.js, 디자인 개편 v109, 2026-11-12)
 *  PC 1440×900
 *  - 툴바 '🚀 GTX 떡상' → 패널 열림, 처음엔 아무 역도 안 고르고 순위(TOP 10)부터 — 특정 역을 앞세우지 않는다
 *  - 지도에서 광운대를 누르면 카드(취소선 지금 순위 → 개통 후 순위), 문장형 제목, 곡선, 막대 3개
 *  - 숫자는 rank.json + js/rank.js 로 직접 계산한 값과 같다 (기본 연도)
 *  - 연도 칩 '전체' → 순위·지도 점 다시 칠함 / 기준 '강남' → 순위 바뀜
 *  - 목록 1위 누르면 그 역이 골라지고 지도가 그 역으로 간다
 *  - 패널이 열려 있을 때 지도 역을 누르면 역 상세 대신 패널이 그 역을 보여 준다
 *  - 패널이 지도 컨트롤·툴바와 겹치지 않는다
 *  - 닫으면 레이어도 꺼진다 (사이드바에서 켠 게 아니면)
 *  - ?rocket=1&st=… 주소로 바로 열린다
 *  휴대폰 390×844
 *  - 아래 시트가 툴바 위에 붙고 화면 밖으로 안 나간다, 손잡이로 접기
 * 실행: node tests/e2e/run.js --only rocket-panel
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { launch, sleep, BASE, recorder, outDir, clickStation } = require('./lib/cdp');
const R = recorder('rocket-panel');
const ROOT = path.join(__dirname, '..', '..');
global.RankTable = require(path.join(ROOT, 'js', 'rank.js'));
const RP = require(path.join(ROOT, 'js', 'rocket-panel.js'));
const DOC = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'rank.json'), 'utf8'));
const DY = RP.Logic.defaultYear(DOC);
const rows = (o) => RankTable.compute(DOC, Object.assign({ weight: 'avg', region: 'capital' }, o)).rows;
const KW = rows({ at: DY }).find(x => x.name === '광운대');
const KW_ALL = rows({ at: 'all' }).find(x => x.name === '광운대');
const KW_GBD = rows({ at: DY, weight: 'gbd' }).find(x => x.name === '광운대');
const TOP1 = RankTable.sortRows(rows({ at: DY }).filter(x => !x.isNew && x.change > 0), 'rise')[0];

async function ready(b) {
  for (let i = 0; i < 120; i++) { await sleep(300); if (await b.evaluate(`typeof dataReady!=='undefined'&&dataReady&&!!map.getSource('lines')`).catch(() => false)) break; }
  await sleep(800);
}
async function until(b, expr, n = 40) {
  for (let i = 0; i < n; i++) { if (await b.evaluate(expr).catch(() => false)) return true; await sleep(250); }
  return false;
}
const shot = async (b, name) => { try { await b.shot(path.join(outDir('rocket-panel'), name)); } catch (e) { /* 판정과 무관 */ } };
const overlap = (a, c) => !(a.right <= c.left || a.left >= c.right || a.bottom <= c.top || a.top >= c.bottom);

(async () => {
  /* ---------- PC ---------- */
  const b = await launch({ port: 9798, w: 1440, h: 900 });
  await b.send('Network.setBypassServiceWorker', { bypass: true });
  await b.goto(BASE + '#normal', 800); await ready(b);
  const pre = await b.evaluate(`({ btn: !!document.getElementById('rocket-btn'), rail: !!(document.querySelector('#tabbar [data-tab="rocket"]')||{}).offsetParent, tbVisible: !!document.getElementById('rocket-btn').offsetParent, panel: !!document.getElementById('rocket-panel'), layer: !!map.getLayer('rocket-tier') })`);
  R.check("떡상 진입점 = 왼쪽 레일 '떡상'(도구막대 버튼은 J7 로 숨김), 처음엔 패널·레이어 없음", pre.btn && pre.rail && !pre.tbVisible && !pre.panel && !pre.layer, pre);

  await b.evaluate(`document.getElementById('rocket-btn').click()`);
  await until(b, `!!document.querySelector('#rocket-panel .rkp-row') && !!map.getLayer('rocket-tier')`);
  await sleep(1200);
  const s0 = await b.evaluate(`(() => { const p = document.getElementById('rocket-panel');
    return { title: p.querySelector('#rkp-title').textContent, hero: !!p.querySelector('.rkp-hero'), hint: !!p.querySelector('.rkp-hint'), sel: RocketPanel.state().sel, tip: !!document.querySelector('.rkp-tip'),
      list: p.querySelectorAll('.rkp-row').length, first: (p.querySelector('.rkp-row b')||{}).textContent }; })()`);
  R.check(`처음엔 고른 역 없음: 질문 제목·카드 없음·말풍선 없음·TOP 10 (1위 ${TOP1.name})`, s0.title === '개통하면 우리 역은 몇 등이 될까요?' && !s0.hero && s0.hint && s0.sel === null && !s0.tip && s0.list === 10 && s0.first === TOP1.name, s0);
  await b.evaluate(`map.jumpTo({ center: STATIONS.find(s => s.properties.id === '${KW.id}').geometry.coordinates, zoom: 13 }); true`);
  await sleep(900);
  const pk = await clickStation(b, KW.id);
  await sleep(900);
  R.check('지도에서 광운대를 누르면 패널 카드가 광운대', pk.ok && await b.evaluate(`(document.querySelector('.rkp-name')||{}).textContent === '광운대'`), pk);
  const s1 = await b.evaluate(`(() => { const p = document.getElementById('rocket-panel'); const q = s => p.querySelector(s);
    return { open: !p.hidden, layer: !!map.getLayer('rocket-tier'), sel: !!map.getLayer('rocket-sel'), pressed: document.getElementById('rocket-btn').getAttribute('aria-pressed'),
      title: q('#rkp-title').textContent, was: (q('.rkp-was')||{}).textContent, now: (q('.rkp-now')||{}).textContent, name: (q('.rkp-name')||{}).textContent,
      curve: !!q('.rkp-curve path'), pts: p.querySelectorAll('.rkp-curve circle').length, bars: p.querySelectorAll('.rkp-bar').length,
      barv: [...p.querySelectorAll('.rkp-bar-v')].map(x => x.textContent), yon: (q('#rkp-chips .on')||{}).getAttribute && q('#rkp-chips .on').getAttribute('data-y'),
      list: p.querySelectorAll('.rkp-row').length, first: (q('.rkp-row b')||{}).textContent, tip: (document.querySelector('.rkp-tip')||{}).textContent,
      font: getComputedStyle(p).fontFamily, state: RocketPanel.state() }; })()`);
  R.check('패널 열림 + 떡상 레이어·고른 역 고리 켜짐 + 버튼 눌림 표시', s1.open && s1.layer && s1.sel && s1.pressed === 'true', s1);
  R.check(`기본 연도 ${DY} 칩이 켜짐`, s1.yon === DY, s1.yon);
  const kwBest = RP.Logic.bestDest(KW);
  R.check(`문장형 제목 '${RP.Logic.titleOf(KW, DY)}'`, s1.title === RP.Logic.titleOf(KW, DY) && s1.title.includes(KW.aft.times[kwBest.i] + '분'), s1.title);
  R.check(`광운대 카드: 취소선 ${KW.now.rank}위 → ${RP.Logic.rankText(KW.aft.rank, KW.tie)} (rank.json 과 같음)`, s1.name === '광운대' && s1.was === KW.now.rank + '위' && s1.now === RP.Logic.rankText(KW.aft.rank, KW.tie), s1);
  R.check('순위 곡선(지금+연도 점) + 업무지구 막대 3개', s1.curve && s1.pts === DOC.years.length + 1 && s1.bars === 3, [s1.pts, s1.bars]);
  R.check('막대 숫자 = 지금 → 개통 후 분', s1.barv.every((t, i) => t.replace(/\s/g, '') === (KW.now.times[i] + '→' + KW.aft.times[i] + '분')), s1.barv);
  R.check(`TOP 10 목록, 1위 ${TOP1.name}`, s1.list === 10 && s1.first === TOP1.name, [s1.list, s1.first]);
  R.check("지도 말풍선 '광운대 N위 → M위 ▲'", /광운대/.test(s1.tip || '') && (s1.tip || '').includes(KW.aft.rank + '위') && (s1.tip || '').includes('▲' + KW.change), s1.tip);
  R.check('글꼴 Pretendard (자체 호스팅)', /Pretendard/.test(s1.font), s1.font);
  const fontOk = await b.evaluate(`document.fonts.check('700 16px "Pretendard Variable"', '광운대')`).catch(() => false);
  R.check('Pretendard 글꼴 파일이 실제로 받아짐', fontOk === true, fontOk);
  await shot(b, 'pc-open.png');

  // 겹침: 패널 ↔ 툴바·지도 컨트롤
  const lay = await b.evaluate(`(() => { const r = e => { const x = e && e.getBoundingClientRect(); return x ? { left: x.left, right: x.right, top: x.top, bottom: x.bottom } : null; };
    return { p: r(document.getElementById('rocket-panel')), tb: r(document.getElementById('toolbar')), ctl: r(document.querySelector('.maplibregl-ctrl-top-right .maplibregl-ctrl')), vw: innerWidth, vh: innerHeight }; })()`);
  R.check('패널이 화면 안, 툴바·지도 컨트롤과 안 겹침', lay.p.right <= lay.vw && lay.p.bottom <= lay.vh && !overlap(lay.p, lay.tb) && (!lay.ctl || !overlap(lay.p, lay.ctl)), lay);

  // 연도 '전체'
  await b.evaluate(`document.querySelector('#rkp-chips [data-y="all"]').click()`); await sleep(600);
  const s2 = await b.evaluate(`({ now: document.querySelector('.rkp-now').textContent, title: document.getElementById('rkp-title').textContent, view: StationRocket.view(),
    kw: (StationRocket.features() || []).find(f => f.properties.id === RocketPanel.state().sel).properties })`);
  R.check("연도 '전체' → 순위·제목·지도 점이 '모두 개통' 값", s2.now === RP.Logic.rankText(KW_ALL.aft.rank, KW_ALL.tie) && s2.title.startsWith('모두 개통하면') && s2.view.at === 'all' && s2.kw.c === KW_ALL.change, s2);
  await b.evaluate(`document.querySelector('#rkp-chips [data-y="${DY}"]').click()`); await sleep(400);
  // 기준 '강남'
  await b.evaluate(`document.querySelector('.rkp-seg [data-w="gbd"]').click()`); await sleep(600);
  const s3 = await b.evaluate(`({ now: document.querySelector('.rkp-now').textContent, pressed: document.querySelector('.rkp-seg [data-w="gbd"]').getAttribute('aria-pressed'), view: StationRocket.view() })`);
  R.check(`기준 '강남' → ${RP.Logic.rankText(KW_GBD.aft.rank, KW_GBD.tie)} · 지도도 강남 기준`, s3.now === RP.Logic.rankText(KW_GBD.aft.rank, KW_GBD.tie) && s3.pressed === 'true' && s3.view.weight === 'gbd', s3);
  await b.evaluate(`document.querySelector('.rkp-seg [data-w="avg"]').click()`); await sleep(400);

  // 목록 1위 누르기 → 고르기 + 지도 이동
  const c0 = await b.evaluate(`map.getCenter().toArray()`);
  await b.evaluate(`document.querySelector('.rkp-row').click()`); await sleep(1600);
  const s4 = await b.evaluate(`({ sel: RocketPanel.state().sel, name: document.querySelector('.rkp-name').textContent, c: map.getCenter().toArray(), isSel: document.querySelector('.rkp-row').classList.contains('is-sel') })`);
  R.check(`목록 1위(${TOP1.name}) 누르면 카드가 그 역 + 지도 이동`, s4.sel === TOP1.id && s4.name === TOP1.name && s4.isSel && (Math.abs(s4.c[0] - c0[0]) + Math.abs(s4.c[1] - c0[1]) > 0.005), s4);

  // 지도 역 누르기 → 패널이 그 역 (역 상세는 안 열림)
  await b.evaluate(`map.jumpTo({ center: STATIONS.find(s => s.properties.id === '${KW.id}').geometry.coordinates, zoom: 13 }); true`);
  await sleep(900);
  const pt = await clickStation(b, KW.id);
  await sleep(800);
  const s5 = await b.evaluate(`({ name: document.querySelector('.rkp-name').textContent, sd: !!(document.getElementById('sd-panel') && document.getElementById('sd-panel').classList.contains('sd-open')) })`);
  R.check('패널이 열린 채 지도 광운대를 누르면 패널이 광운대 (역 상세 안 열림)', pt.ok && s5.name === '광운대' && !s5.sd, [pt, s5]);
  // '역 상세' 버튼 → 역 상세
  await b.evaluate(`document.querySelector('[data-act="detail"]').click()`); await sleep(900);
  const sd = await b.evaluate(`!!(document.getElementById('sd-panel') && document.getElementById('sd-panel').classList.contains('sd-open'))`);
  R.check("카드의 '역 상세' → 역 상세가 열림", sd === true, sd);
  await b.evaluate(`StationDetail.hide()`); await sleep(300);

  // 공유 이미지 — 패널 안에서 바로 (rank.html 로 넘어가지 않음)
  await b.send('Browser.setDownloadBehavior', { behavior: 'deny' }).catch(() => {});
  const sh = await b.evaluate(`(() => { const btn = document.querySelector('#rkp-hero [data-act="share"]'); const link = document.querySelector('#rkp-hero a[href*="rank.html"]');
    const r = RocketPanel.state(); const row = RankTable.compute(StationRocket.doc(), { weight: r.w, region: 'capital', at: r.y }).rows.find(x => x.id === r.sel);
    const c = StationShareImage.draw(row, { doc: StationRocket.doc(), y: r.y, w: r.w, wait: r.wait });
    const px = c.getContext('2d').getImageData(540, 540, 1, 1).data;
    return { btn: !!btn, link: !!link, w: c.width, h: c.height, painted: px[3] === 255, name: StationShareImage.fileName(row) }; })()`);
  R.check('카드의 📸 공유 이미지 = 패널 안 버튼 (rank.html 링크 없음), 1080×1080 그림', sh.btn && !sh.link && sh.w === 1080 && sh.h === 1080 && sh.painted && /^GTX떡상_.+위→\d+위\.png$/.test(sh.name), sh);
  const u0 = await b.evaluate('location.href');
  await b.evaluate(`document.querySelector('#rkp-hero [data-act="share"]').click(); true`); await sleep(1500);
  const sh2 = await b.evaluate(`({ url: location.href, txt: document.querySelector('#rkp-hero [data-act="share"]').textContent })`);
  R.check('누르면 같은 화면에서 저장 (주소 그대로, 저장했어요/공유했어요)', sh2.url === u0 && /저장했어요|공유했어요|공유 이미지/.test(sh2.txt), sh2);

  // 전체 순위 — 패널 안에서 (rank.html 로 넘어가지 않음, 2026-11-12)
  const url0 = await b.evaluate('location.href');
  await b.evaluate(`document.querySelector('.rkp-allbtn').click(); true`); await sleep(500);
  const f1 = await b.evaluate(`({ url: location.href, tools: !document.querySelector('.rkp-tools').hidden, n: document.querySelectorAll('.rkp-row').length,
    more: !document.querySelector('.rkp-more').hidden, h: document.getElementById('rkp-list-h').textContent, exp: document.querySelector('.rkp-allbtn').getAttribute('aria-expanded'),
    link: !!document.querySelector('#rocket-panel a[href="rank.html"]') })`);
  R.check("'전체 순위 보기' → 같은 화면(주소 그대로)에서 50역 + 더 보기 + 찾기·정렬, rank.html 링크 없음", f1.url === url0 && f1.tools && f1.n === 50 && f1.more && /^전체 \d+역/.test(f1.h) && f1.exp === 'true' && !f1.link, f1);
  await b.evaluate(`document.querySelector('.rkp-more').click(); true`); await sleep(300);
  const f2 = await b.evaluate(`document.querySelectorAll('.rkp-row').length`);
  R.check('더 보기 → 100역', f2 === 100, f2);
  await b.evaluate(`(() => { const q = document.querySelector('.rkp-q'); q.value = '광운대'; q.dispatchEvent(new Event('input')); return true; })()`); await sleep(300);
  const f3 = await b.evaluate(`[...document.querySelectorAll('.rkp-row .rkp-nm b')].map(x => x.textContent)`);
  R.check("찾기 '광운대' → 광운대만", f3.length >= 1 && f3.every(t => /광운대/.test(t)), f3);
  await b.evaluate(`(() => { const q = document.querySelector('.rkp-q'); q.value = ''; q.dispatchEvent(new Event('input')); document.querySelector('.rkp-sort [data-sort="after"]').click(); return true; })()`); await sleep(300);
  const want = RankTable.sortRows(rows({ at: DY }), 'after').slice(0, 3).map(x => [x.aft.rank, x.name]);
  const f4 = await b.evaluate(`[...document.querySelectorAll('.rkp-row')].slice(0, 3).map(x => [Number(x.querySelector('.rkp-no').textContent), x.querySelector('b').textContent])`);
  R.check('정렬 \'개통 후 순위\' → 순위표 계산과 같은 1~3위 (번호 = 순위)', JSON.stringify(f4) === JSON.stringify(want), [f4, want]);
  await b.evaluate(`document.querySelector('.rkp-row').click(); true`); await sleep(1200);
  const f5 = await b.evaluate(`({ name: (document.querySelector('.rkp-name')||{}).textContent, url: location.href })`);
  R.check('전체 목록에서 역을 누르면 카드가 그 역 (화면 그대로)', f5.name === want[0][1] && f5.url === url0, f5);
  await b.evaluate(`document.querySelector('.rkp-allbtn').click(); true`); await sleep(300);
  const f6 = await b.evaluate(`({ n: document.querySelectorAll('.rkp-row').length, tools: document.querySelector('.rkp-tools').hidden })`);
  R.check("'← TOP 10 으로' → 다시 10개", f6.n === 10 && f6.tools, f6);

  // 닫기
  await b.evaluate(`document.querySelector('.rkp-close').click()`); await sleep(500);
  const s6 = await b.evaluate(`({ hidden: document.getElementById('rocket-panel').hidden, layer: !!map.getLayer('rocket-tier'), cb: document.getElementById('layer-rocket').checked, tip: !!document.querySelector('.rkp-tip'), cls: document.body.classList.contains('rk-open'), sel: RocketPanel.state().sel })`);
  R.check('닫으면 패널·레이어·말풍선 사라지고 고른 역도 지움', s6.hidden && !s6.layer && !s6.cb && !s6.tip && !s6.cls && s6.sel === null, s6);

  // 사이드바에서 켠 레이어는 패널을 닫아도 그대로
  await b.evaluate(`document.getElementById('layer-rocket').click()`); await until(b, `!!map.getLayer('rocket-tier')`);
  await b.evaluate(`document.getElementById('rocket-btn').click()`); await until(b, `!document.getElementById('rocket-panel').hidden`);
  await sleep(500);
  await b.evaluate(`document.querySelector('.rkp-close').click()`); await sleep(400);
  const s7 = await b.evaluate(`({ layer: !!map.getLayer('rocket-tier'), view: StationRocket.view() })`);
  R.check('사이드바에서 켠 떡상 지도는 패널을 닫아도 남고, 기본 기준으로 돌아감', s7.layer && s7.view.at === 'all' && s7.view.weight === 'avg', s7);
  await b.evaluate(`document.getElementById('layer-rocket').click()`); await sleep(300);

  // 메뉴 '분석 → 🚀 GTX 떡상 랭킹' 도 패널을 연다
  await b.evaluate(`document.getElementById('rocket-menu-btn').click()`);
  const viaMenu = await until(b, `!document.getElementById('rocket-panel').hidden`);
  R.check("분석 메뉴의 '🚀 GTX 떡상 랭킹' 도 지도 안 패널을 연다", viaMenu);
  await b.evaluate(`RocketPanel.close()`);

  // 주소로 바로 열기
  await b.goto(BASE.replace(/#.*$/, '') + '?rocket=1&st=' + encodeURIComponent(TOP1.id) + '&y=all#normal', 800); await ready(b);
  await until(b, `!!document.querySelector('#rocket-panel .rkp-name')`);
  await sleep(600);
  const s8 = await b.evaluate(`({ name: (document.querySelector('.rkp-name')||{}).textContent, y: RocketPanel.state().y, sd: !!(document.getElementById('sd-panel') && document.getElementById('sd-panel').classList.contains('sd-open')) })`);
  R.check(`?rocket=1&st=…&y=all → 패널이 ${TOP1.name}·전체로 열림 (역 상세는 안 열림)`, s8.name === TOP1.name && s8.y === 'all' && !s8.sd, s8);
  b.close();

  /* ---------- 휴대폰 ---------- */
  const m = await launch({ port: 9799, w: 390, h: 844, mobile: true });
  await m.send('Network.setBypassServiceWorker', { bypass: true });
  await m.goto(BASE + '#normal', 800); await ready(m);
  await m.evaluate(`document.getElementById('rocket-btn').click()`);
  await until(m, `!!document.querySelector('#rocket-panel .rkp-row')`);
  await sleep(1300);
  // 떠오름 모션(kr-sheet-in, 24px)이 백그라운드 크롬에서 멈춰 있으면 24px 아래로 재진다 — 모션을 끝낸 뒤 잰다 (2026-11-14)
  await m.evaluate(`document.getAnimations().forEach(a => { try { a.finish(); } catch (e) {} }); true`); await sleep(100);
  const mb = await m.evaluate(`(() => { const p = document.getElementById('rocket-panel').getBoundingClientRect(); const t = ['tabbar', 'toolbar'].map(id => document.getElementById(id)).find(e => e && getComputedStyle(e).display !== 'none').getBoundingClientRect();   /* 아래 바 = 탭 바 (작업 1) */
    const bg = getComputedStyle(document.getElementById('rocket-panel')).backgroundColor;
    return { p: { left: p.left, right: p.right, top: p.top, bottom: p.bottom, h: p.height }, tbTop: t.top, vw: innerWidth, vh: innerHeight, bg, grip: !!document.querySelector('.rkp-grip').offsetParent }; })()`);
  R.check('휴대폰: 아래 시트가 툴바 바로 위·화면 안·화면 높이 65% 이하', mb.p.left >= 0 && mb.p.right <= mb.vw && Math.abs(mb.p.bottom - mb.tbTop) <= 3 && mb.p.top > 0 && mb.p.h <= mb.vh * 0.65, mb);
  R.check('휴대폰: 시트가 불투명 + 손잡이 보임', /rgb\(/.test(mb.bg) && !/rgba\(.*,\s*0(\.\d+)?\)/.test(mb.bg) && mb.grip, mb.bg);
  await shot(m, 'mobile-open.png');
  await m.evaluate(`document.querySelector('.rkp-grip').click()`); await sleep(500);
  const peek = await m.evaluate(`({ h: document.getElementById('rocket-panel').getBoundingClientRect().height, exp: document.querySelector('.rkp-grip').getAttribute('aria-expanded') })`);
  R.check('휴대폰: 손잡이로 접으면 낮아짐 (200px 이하)', peek.h <= 200 && peek.exp === 'false', peek);
  await shot(m, 'mobile-peek.png');
  const exc = b.logs.concat(m.logs).filter(x => /EXC/.test(x));
  R.check('예외 0', exc.length === 0, exc.slice(0, 3));
  m.close();
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
