/* e2e: 교통 순위표 (rank.html, 2026-11-12)
 *  - 데스크톱·휴대폰: 가로 스크롤 없음, 1~3위 카드 3장, 목록 50줄
 *  - 기준 버튼(GBD 중시)을 누르면 순위가 바뀌고 주소에 남는다
 *  - 찾기 '광운대' → 그 줄만, 더 보기 버튼 숨김
 *  - 역을 누르면 지도(index.html?st=)로 가서 그 역 상세가 열린다
 * 실행: node tests/e2e/run.js --only rank
 */
'use strict';
const { launch, sleep, BASE, recorder } = require('./lib/cdp');
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
      const now = await b.evaluate(`({ chg: document.querySelectorAll('#list .chg').length, sortOff: document.getElementById('sort').disabled })`);
      R.check("'지금' 시점은 ▲변동 없음·오름 정렬 끔", now.chg === 0 && now.sortOff, now);
    }
    // 역을 누르면 지도에서 그 역 상세
    await b.goto(RANK + '?q=' + encodeURIComponent('광운대'), 800); await rows(b);
    const href = await b.evaluate(`document.querySelector('#list .row').getAttribute('href')`);
    R.check(`${w}px 광운대 줄 링크가 ?st=역ID`, /^\.\/\?st=st-/.test(href), href);
    await b.evaluate(`document.querySelector('#list .row').click()`);
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
