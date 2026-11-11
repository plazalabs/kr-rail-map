/* e2e: 교통 순위표 (rank.html, 2026-11-12)
 *  - 데스크톱·휴대폰: 가로 스크롤 없음, 1~3위 카드 3장, 목록 50줄
 *  - 기준 버튼(GBD 중시)을 누르면 순위가 바뀌고 주소에 남는다
 *  - 찾기 '광운대' → 그 줄만, 더 보기 버튼 숨김
 *  - 역을 누르면 지도(index.html?st=)로 가서 그 역 상세가 열린다
 * 실행: node tests/e2e/run.js --only rank
 */
'use strict';
const { launch, sleep, BASE, recorder, outDir } = require('./lib/cdp');
const R = recorder('rank');
const RANK = BASE.replace(/index\.html.*$/, '').replace(/#.*$/, '') + 'rank.html';

async function rows(b) {
  for (let i = 0; i < 50; i++) { await sleep(200); if (await b.evaluate(`document.querySelectorAll('#list .row').length > 0`).catch(() => false)) break; }
}
const layout = b => b.evaluate(`(() => ({
  hscroll: document.documentElement.scrollWidth > innerWidth + 1,
  pod: document.querySelectorAll('#podium .pod').length,
  rows: document.querySelectorAll('#list .row').length,
  first: (document.querySelector('#podium .pod .nm') || {}).textContent,
  hint: document.getElementById('hint').textContent,
  rowFits: [...document.querySelectorAll('#list .row')].slice(0, 10).every(r => { const x = r.getBoundingClientRect(); return x.left >= 0 && x.right <= innerWidth + 1; }),
}))()`);

(async () => {
  for (const [w, h, mobile] of [[1440, 900, false], [360, 780, true]]) {
    const b = await launch({ port: 9795 + (mobile ? 1 : 0), w, h, mobile });
    await b.send('Network.setBypassServiceWorker', { bypass: true });
    await b.goto(RANK, 800); await rows(b);
    const l = await layout(b);
    R.check(`${w}px 가로 스크롤 없음·줄이 화면 안`, !l.hscroll && l.rowFits, l);
    R.check(`${w}px 1~3위 카드 3장, 목록 50줄(4~53위)`, l.pod === 3 && l.rows === 50, l);
    R.check(`${w}px 수도권 기본, 1위는 서울역`, /수도권/.test(l.hint) && l.first === '서울', l);
    if (!mobile) {
      const before = await b.evaluate(`[...document.querySelectorAll('#podium .pod .nm')].map(e => e.textContent).join(',')`);
      await b.evaluate(`document.querySelector('.seg[data-k="w"] button[data-v="gbd"]').click()`); await sleep(300);
      const after = await b.evaluate(`({ top: [...document.querySelectorAll('#podium .pod .nm')].map(e => e.textContent).join(','), url: location.search, pressed: document.querySelector('.seg[data-k="w"] button[data-v="gbd"]').getAttribute('aria-pressed') })`);
      R.check('GBD 중시를 누르면 순위가 바뀌고 주소에 w=gbd', after.top !== before && /w=gbd/.test(after.url) && after.pressed === 'true', { before, after });
      await b.evaluate(`(() => { const q = document.getElementById('q'); q.value = '광운대'; q.dispatchEvent(new Event('input')); })()`); await sleep(500);
      const s = await b.evaluate(`({ names: [...document.querySelectorAll('#list .row .nm')].map(e => e.textContent), more: document.getElementById('more').hidden, pod: document.getElementById('podium').hidden })`);
      R.check("찾기 '광운대' → 광운대가 첫 줄, 더 보기·1~3위 카드 숨김", s.names[0] === '광운대' && s.more && s.pod, s);
      await b.evaluate(`document.querySelector('.seg[data-k="t"] button[data-v="now"]').click()`); await sleep(300);
      const now = await b.evaluate(`({ chg: document.querySelectorAll('#list .badge').length, sortOff: document.getElementById('sort').disabled, tiers: document.getElementById('tiers').hidden, slope: document.getElementById('slope-sec').hidden })`);
      R.check("'지금' 시점은 ▲변동·등급 칩·TOP 10 없음, 오름 정렬 끔", now.chg === 0 && now.sortOff && now.tiers && now.slope, now);
      // 등급 칩 '떡상' → 떡상 역만, 많이 오르는 순
      await b.goto(RANK, 800); await rows(b);
      await b.evaluate(`document.querySelector('#tiers .tchip[data-tier="rocket"]').click()`); await sleep(300);
      const tr = await b.evaluate(`({ n: document.querySelectorAll('#list .row').length, allRocket: [...document.querySelectorAll('#list .row')].every(r => r.classList.contains('t-rocket')), url: location.search, sort: document.getElementById('sort').value })`);
      R.check("등급 칩 '떡상' → 떡상 역만·많이 오르는 순·주소에 tier=rocket", tr.n > 10 && tr.allRocket && /tier=rocket/.test(tr.url) && tr.sort === 'rise', tr);
      // 개통 연도 슬라이더 — 2027년(GTX-C 전)엔 광운대가 200위 밖, 2031년(GTX-B·C 개통)엔 10위 안
      const kwAt = async y => {
        await b.goto(RANK + '?q=' + encodeURIComponent('광운대') + '&y=' + y, 800); await rows(b);
        return b.evaluate(`({ rank: +document.querySelector('#list .row .rk b').firstChild.textContent, now: document.getElementById('yr-now').textContent,
          opens: document.getElementById('yr-opens').textContent, url: location.search })`);
      };
      const y27 = await kwAt(2027), y31 = await kwAt(2031);
      R.check('연도 2027: 광운대 200위 밖·동북선 개통 표시', y27.rank > 200 && /2027년까지/.test(y27.now) && /동북선/.test(y27.opens), y27);
      R.check('연도 2031: 광운대 10위 안·GTX-B·C 개통 표시', y31.rank <= 10 && /GTX-B/.test(y31.opens) && /GTX-C/.test(y31.opens), y31);
      await b.goto(RANK, 800); await rows(b);
      await b.evaluate(`(() => { const r = document.getElementById('yr'); r.value = '3'; r.dispatchEvent(new Event('input')); })()`); await sleep(300);
      const sl3 = await b.evaluate(`({ url: location.search, h: document.getElementById('slope-h').textContent })`);
      R.check('슬라이더를 밀면 주소에 y= 와 TOP 10 제목이 그 해로', /y=2031/.test(sl3.url) && /2031년까지/.test(sl3.h), sl3);
      await b.evaluate(`document.getElementById('yr-play').click()`); await sleep(1800);
      const pl = await b.evaluate(`({ btn: document.getElementById('yr-play').textContent, url: location.search })`);
      R.check('▶ 누르면 연도가 차례로 넘어간다 (멈춤 버튼 ■)', pl.btn === '■' && /y=20(27|28)/.test(pl.url), pl);
      await b.evaluate(`document.getElementById('yr-play').click()`);
      // ?open=역ID (지도 역 상세 '떡상 랭킹에서 보기') — 그 역 카드가 펼쳐져 있다. 수도권 밖(부산 서면)이면 전국으로
      await b.goto(RANK + '?open=st-355172776', 800); await rows(b);
      const o1 = await b.evaluate(`({ card: !!document.querySelector('#card-st-355172776'), q: document.getElementById('q').value })`);
      R.check('?open=광운대 → 광운대 카드가 펼쳐져 있다', o1.card && o1.q === '광운대', o1);
      await b.goto(RANK + '?open=st-5782717000', 800); await rows(b);
      const o2 = await b.evaluate(`({ card: !!document.querySelector('#card-st-5782717000'), r: document.querySelector('.seg[data-k="r"] [aria-pressed="true"]').dataset.v })`);
      R.check('?open=부산 서면 → 전국으로 바꿔 카드 펼침', o2.card && o2.r === 'all', o2);
    }
    // 줄을 누르면 역 카드가 펼쳐지고, '지도에서 보기' 를 누르면 지도에서 그 역 상세
    await b.goto(RANK, 800); await rows(b);
    const sl0 = await b.evaluate(`(() => { const s = document.querySelector('#slope svg'); return { lines: document.querySelectorAll('#slope svg a line').length, chips: document.querySelectorAll('#tiers .tchip').length,
      fits: !!s && s.getBoundingClientRect().right <= innerWidth + 1 && s.getBoundingClientRect().width > 200 }; })()`);
    R.check(`${w}px 떡상 TOP 10 선 10개·등급 칩 6개(전체+5)·그림이 화면 안`, sl0.lines === 10 && sl0.chips === 6 && sl0.fits, sl0);
    await b.goto(RANK + '?q=' + encodeURIComponent('광운대'), 800); await rows(b);
    await b.evaluate(`document.querySelector('#list .row').click()`); await sleep(300);
    const card = await b.evaluate(`(() => { const c = document.querySelector('#list .card'); if (!c) return null; const g = c.querySelector('a.go');
      return { big: c.querySelector('.big').textContent.replace(/\\s+/g, ' '), bars: c.querySelectorAll('.bar-row').length, yr: c.textContent.includes('2031년'),
        href: g && g.getAttribute('href'), exp: document.querySelector('#list .row').getAttribute('aria-expanded'), fits: c.getBoundingClientRect().right <= innerWidth + 1 }; })()`);
    R.check(`${w}px 광운대 카드: 지금 245위 → 개통 후 9위, 막대 3줄, GTX-C 2031년, 지도 링크 ?st=`,
      !!card && /245위/.test(card.big) && /9위/.test(card.big) && card.bars === 3 && card.yr && /^\.\/\?st=st-/.test(card.href || '') && card.exp === 'true' && card.fits, card);
    // 📸 공유 이미지 — 1080×1080 그림이 만들어지고, (헤드리스는 파일 공유 불가) 내려받기로 저장했다는 안내가 뜬다
    const img = await b.evaluate(`(() => { const c = RankShare.canvas('st-355172776'); return c ? { w: c.width, h: c.height, len: c.toDataURL('image/png').length } : null; })()`);
    // 내려받기는 사용자 '다운로드' 폴더가 아니라 e2e 결과 폴더로 (2026-11-12 — 처음엔 다운로드 폴더에 남았다)
    await b.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: outDir('rank') }).catch(() => {});
    await b.evaluate(`document.querySelector('#list .card [data-share]').click()`); await sleep(800);
    const msg = await b.evaluate(`(document.querySelector('#list .card .share-msg') || {}).textContent || ''`);
    R.check(`${w}px 공유 이미지 1080×1080 만들기·저장 안내`, !!img && img.w === 1080 && img.h === 1080 && img.len > 50000 && /저장했어요|공유했어요/.test(msg), { img, msg });
    await b.evaluate(`document.querySelector('#list .card a.go').click()`);
    let opened = null;
    for (let i = 0; i < 80; i++) {
      await sleep(400);
      opened = await b.evaluate(`(() => { const p = document.getElementById('sd-panel'); return p && p.classList.contains('sd-open') ? p.textContent.replace(/\\s+/g, ' ').slice(0, 80) : null; })()`).catch(() => null);
      if (opened) break;
    }
    R.check(`${w}px 순위표에서 누르면 지도에서 광운대 상세가 열린다`, !!opened && /광운대/.test(opened), opened);
    const exc = b.logs.filter(x => /EXC/.test(x));
    R.check(`${w}px 예외 0`, exc.length === 0, exc.slice(0, 3));
    b.close(); await sleep(600);
  }
  R.finish();
})().catch(e => { console.error(e); process.exit(1); });
