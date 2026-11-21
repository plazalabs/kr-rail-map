// 회귀(숙제 93): 몇분컷 입구 — 지도 첫 화면 입구
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

for (const [w, h] of [[360, 740], [390, 844], [1440, 900]]) {
  test(`[R-93] 지도 첫 화면 입구가 보이고 누르면 몇분컷 (${w}px)`, async ({ browser }) => {
    const mobile = w < 981;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const errs = await prep(page, { seen: false });   // 처음 온 사람 (안내 카드도 떠 있는 상태)
    await page.goto('./');
    await mapReady(page);
    const sel = mobile ? '#m-gtx' : '#toolbar .tb-gtx';
    const e = page.locator(sel);
    await expect(e).toBeVisible();
    await expect(e).toHaveAttribute('aria-label', LABEL);
    if (!mobile) await expect(e).toHaveAttribute('title', LABEL);
    const box = await e.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(mobile ? 44 : 36);
    expect(box.x >= 0 && box.x + box.width <= w && box.y >= 0, '화면 안').toBe(true);
    // 다른 쪽 입구는 숨김 (휴대폰 더보기 시트에 PC 버튼이 섞이지 않게)
    await expect(page.locator(mobile ? '#toolbar .tb-gtx' : '#m-gtx')).toBeHidden();
    if (mobile) {
      const ms = await page.locator('#m-search').boundingBox();
      expect(ms.x + ms.width <= box.x, '검색 칸과 겹치지 않음').toBe(true);
      expect(await page.locator('#m-search span').evaluate(s => s.scrollWidth <= s.clientWidth + 1), '검색 칸 글자 안 잘림').toBe(true);
    }
    expect(await e.evaluate(a => a.scrollWidth <= a.clientWidth + 1 && a.getClientRects().length === 1), '줄바꿈·잘림 없음').toBe(true);
    await e.click();
    await expect(page).toHaveURL(/gtx\.html/);
    await gtxReady(page);
    await cameFrom(page, 'entry-map');
    expect(errs).toEqual([]);
    await ctx.close();
  });
}

test('[R-93] 입구 글자 대비 — 테마 7종 모두 4.5 이상 (PC 테두리 버튼 · 휴대폰 알약)', async ({ browser }) => {
  const THEMES = ['light', 'dark', 'eclipse', 'pink', 'neon', 'hospital', 'win95'];
  for (const [w, sel, mobile] of [[1440, '#toolbar .tb-gtx', false], [390, '#m-gtx', true]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 844 }, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    await prep(page);
    await page.goto('./');
    await mapReady(page);
    for (const th of THEMES) {
      const r = await page.evaluate(([s, t]) => {
        document.body.dataset.theme = t;
        const e = document.querySelector(s), cs = getComputedStyle(e);
        const rgb = c => c.match(/[\d.]+/g).slice(0, 3).map(Number);
        const lum = c => { const v = rgb(c).map(x => x / 255).map(x => x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
        const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
        return { text: +ratio(cs.color, cs.backgroundColor).toFixed(2), border: +ratio(cs.borderTopColor, cs.backgroundColor).toFixed(2) };
      }, [sel, th]);
      expect(r.text, `${sel} ${th} 글자`).toBeGreaterThanOrEqual(4.5);
      if (!mobile) expect(r.border, `${sel} ${th} 테두리`).toBeGreaterThanOrEqual(3);
    }
    await ctx.close();
  }
});
