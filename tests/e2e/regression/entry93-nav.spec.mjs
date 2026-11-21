// 회귀(숙제 93): 몇분컷 입구 — 머리 메뉴 통일
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.env.KR_RAIL_ROOT || process.cwd();
const G = JSON.parse(readFileSync(join(ROOT, 'data/gtx-card.json'), 'utf8'));
const UIJ = 'st-7777463060';          // 의정부 (카드 자료에 있음)
const SINCHON2 = 'st-l2-sinchon';     // 신촌(2호선) — 동명역 신촌(경의선) st-2346858838 과 다른 카드
const DONGNAE = 'st-289245376';       // 동래(부산) — 랭킹에는 있고 카드 자료에는 없음
const SEOMYEON = 'st-5782717000';     // 서면(부산) — 카드 자료에 없음
const NAV = [['지도', './'], ['몇분컷', 'gtx.html?ref=entry-nav'], ['축지법 랭킹', 'rank.html'], ['게시판', 'board.html'], ['자료', 'data.html']];
const LABEL = '몇분컷 — 역별 개통 전후 걸리는 시간';

async function prep(page, { seen = true } = {}) {
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !(m.location().url || '').includes('umami') && !/ERR_FAILED|tiles|arcgis|supabase/.test(m.text())) errs.push(m.text()); });
  await page.addInitScript(s => {
    localStorage.setItem('umami.disabled', '1');
    if (s) localStorage.setItem('krrail-guide-seen', '1');
    // 페이지를 넘어가도 이벤트를 모으려고 sessionStorage 에 쌓는다
    window.umami = { track: (n, d) => { const a = JSON.parse(sessionStorage.getItem('__ev') || '[]'); a.push([n, d]); sessionStorage.setItem('__ev', JSON.stringify(a)); } };
  }, seen);
  await page.route('https://cloud.umami.is/**', r => r.abort());
  return errs;
}
const mapReady = page => page.waitForFunction(() => typeof dataReady !== 'undefined' && dataReady, null, { timeout: 40_000 });
const gtxReady = page => expect(page.locator('body[data-ready="1"]')).toHaveCount(1, { timeout: 15_000 });
const events = page => page.evaluate(() => JSON.parse(sessionStorage.getItem('__ev') || '[]'));
async function cameFrom(page, where) {
  await expect.poll(async () => (await events(page)).filter(e => e[0] === '몇분컷 입구').map(e => e[1].곳)).toContain(where);
}

test('[R-93] 머리 메뉴 네 화면 + 지도 입구: 글자·순서·주소가 같고 지금 화면은 aria-current', async ({ page }) => {
  for (const [file, cur] of [['rank.html', '축지법 랭킹'], ['board.html', '게시판'], ['data.html', '자료'], ['gtx.html', '몇분컷']]) {
    await page.goto('./' + file);
    const items = await page.locator('header nav').first().locator('a').evaluateAll(as => as.map(a => [a.textContent.trim(), a.getAttribute('href'), a.getAttribute('aria-current')]));
    expect(items.map(x => [x[0], x[1]]), file).toEqual(NAV);
    expect(items.filter(x => x[2] === 'page').map(x => x[0]), file).toEqual([cur]);
    // 로고 모양도 같게 (<i> 색 막대)
    await expect(page.locator('header .logo i').first(), file).toHaveCount(1);
  }
  // 지도: 머리 메뉴 대신 입구·탭. 이름·주소가 머리 메뉴와 같은 화면으로 간다
  await prep(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  // 지도는 머리 메뉴가 없다 — 같은 이름의 입구가 머리 메뉴와 같은 화면(경로)으로 가는지 본다. ?ref= 는 들어온 곳 표시라 다르다
  const path = h => h.split('?')[0];
  const tb = page.locator('#toolbar .tb-gtx');
  await expect(tb).toHaveText(/^몇분컷/);
  expect(path(await tb.getAttribute('href'))).toBe(path(NAV[1][1]));
  expect(path(await page.locator('#m-gtx').getAttribute('href'))).toBe(path(NAV[1][1]));
  await expect(page.locator('#m-gtx')).toHaveText(NAV[1][0]);
  expect(await page.locator('#tabbar [data-tab="board"]').getAttribute('href')).toBe(NAV[3][1]);
  await expect(page.locator('#tabbar [data-tab="board"] span').first()).toHaveText(NAV[3][0]);
});

for (const w of [360, 390, 768, 1280, 1920]) {
  test(`[R-93] 머리 메뉴 ${w}px: 줄바꿈·잘림·겹침 없음, 누르는 자리 44px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 800 });
    for (const file of ['rank.html', 'board.html', 'data.html', 'gtx.html']) {
      await page.goto('./' + file);
      const r = await page.evaluate(() => {
        const nav = document.querySelector('header nav'), logo = document.querySelector('header .logo');
        const as = [...nav.querySelectorAll('a')].map(a => a.getBoundingClientRect());
        const lr = logo.getBoundingClientRect();
        const over = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        return {
          pageScroll: document.documentElement.scrollWidth > innerWidth,
          out: as.some(b => b.left < 0 || b.right > innerWidth),
          oneLine: new Set(as.map(b => Math.round(b.top))).size === 1 && [...nav.querySelectorAll('a')].every(a => a.getClientRects().length === 1),
          minH: Math.min(...as.map(b => b.height)),
          hitLogo: as.some(b => over(b, lr)),
          hitEach: as.some((b, i) => as.some((c, j) => i !== j && over(b, c))),
        };
      });
      const { minH, ...shape } = r;
      expect(shape, `${file} ${w}px`).toEqual({ pageScroll: false, out: false, oneLine: true, hitLogo: false, hitEach: false });
      expect(minH, `${file} ${w}px 높이`).toBeGreaterThanOrEqual(44);
    }
  });
}

test('[R-93] 머리 메뉴 몇분컷 → 들어온 곳 entry-nav', async ({ page }) => {
  await prep(page);
  await page.goto('./data.html');
  await page.locator('header nav a', { hasText: '몇분컷' }).click();
  await gtxReady(page);
  await cameFrom(page, 'entry-nav');
});
