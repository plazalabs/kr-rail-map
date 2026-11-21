// 회귀(숙제 93): 몇분컷 입구 — 역 상세·랭킹·안내 카드 바로가기
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
const gtxReady = page => expect(page.locator('body[data-ready="1"]')).toHaveCount(1, { timeout: 30_000 });
const events = page => page.evaluate(() => JSON.parse(sessionStorage.getItem('__ev') || '[]'));
async function cameFrom(page, where) {
  await expect.poll(async () => (await events(page)).filter(e => e[0] === '몇분컷 입구').map(e => e[1].곳)).toContain(where);
}

test('[R-93] 역 상세 바로가기: 의정부 → 몇분컷 의정부 카드 · 동명역 신촌(2호선) · 카드 자료 없는 역엔 없음', async ({ page }) => {
  const errs = await prep(page);
  await page.goto('./');
  await mapReady(page);
  const openSt = async id => { await page.evaluate(i => window.KR_openStationById(i), id); };
  await openSt(SEOMYEON);
  await expect(page.locator('#sd-panel').first()).toBeVisible();
  await page.waitForTimeout(1500);   // 카드 자료 목록을 받을 시간
  await expect(page.locator('.sd-gtx')).toHaveCount(0);
  await openSt(SINCHON2);
  await expect(page.locator('.sd-gtx')).toHaveAttribute('href', `gtx.html?st=${SINCHON2}&ref=entry-station`);
  await openSt(UIJ);
  const a = page.locator('.sd-gtx');
  await expect(a).toHaveAttribute('href', `gtx.html?st=${UIJ}&ref=entry-station`);
  await expect(a).toHaveText('몇분컷 카드로 보기 →');
  await a.click();
  await gtxReady(page);
  await expect(page.locator('#card')).toHaveAttribute('data-st', UIJ);
  await expect(page.locator('#card .st')).toContainText('의정부');
  await cameFrom(page, 'entry-station');
  expect(errs).toEqual([]);
});

test('[R-93] 동명역: 신촌(2호선) 바로가기는 신촌(경의선)이 아니라 그 카드', async ({ page }) => {
  await prep(page);
  await page.goto(`./gtx.html?st=${SINCHON2}&ref=entry-station`);
  await gtxReady(page);
  await expect(page.locator('#card')).toHaveAttribute('data-st', SINCHON2);
  expect(G.s['st-2346858838'].n).toBe(G.s[SINCHON2].n);
});

test('[R-93] 랭킹 카드 바로가기: 의정부 있음 → 카드 · 동래(카드 자료 없음) 없음', async ({ page }) => {
  const errs = await prep(page);
  await page.goto(`./rank.html?r=all&open=${DONGNAE}`);
  await expect(page.locator(`#card-${DONGNAE}`)).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(`#card-${DONGNAE} .gtx-go`)).toHaveCount(0);
  await page.goto(`./rank.html?open=${UIJ}`);
  const a = page.locator(`#card-${UIJ} .gtx-go`);
  await expect(a).toHaveAttribute('href', `gtx.html?st=${UIJ}&ref=entry-rank`);
  await expect(a).toHaveText('몇분컷 카드로 보기 →');
  await a.click();
  await gtxReady(page);
  await expect(page.locator('#card')).toHaveAttribute('data-st', UIJ);
  await cameFrom(page, 'entry-rank');
  expect(errs).toEqual([]);
});

test('[R-93] 첫 방문 안내 카드: 의정부 → 답 끝 링크 → 몇분컷 카드 · 서면은 링크 없음 · 질문·목록 그대로', async ({ page }) => {
  const errs = await prep(page, { seen: false });
  await page.goto('./');
  await mapReady(page);
  const card = page.locator('#guide-card');
  await expect(card).toBeVisible({ timeout: 30_000 });
  const before = await card.locator('.gd-q, .gd-sub, .gd-list, .gd-foot').evaluateAll(es => es.map(e => e.textContent));
  const pick = async (id, name) => page.evaluate(([i, n]) => { const inp = document.getElementById('gd-st'); inp.value = n; inp.dataset.sid = i; inp.dispatchEvent(new Event('ac:pick')); }, [id, name]);
  await pick(SEOMYEON, '서면');
  await expect(card.locator('.gd-ans')).not.toBeEmpty({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await expect(card.locator('.gd-gtx')).toHaveCount(0);
  await pick(UIJ, '의정부');
  await expect(card.locator('.gd-num')).toBeVisible({ timeout: 30_000 });
  const a = card.locator('.gd-gtx');
  await expect(a).toHaveAttribute('href', `gtx.html?st=${UIJ}&ref=entry-guide`);
  await expect(a).toHaveText('몇분컷 카드로 보기 →');
  expect(await card.locator('.gd-q, .gd-sub, .gd-list, .gd-foot').evaluateAll(es => es.map(e => e.textContent))).toEqual(before);
  await a.click();
  await gtxReady(page);
  await expect(page.locator('#card')).toHaveAttribute('data-st', UIJ);
  await cameFrom(page, 'entry-guide');
  expect(errs).toEqual([]);
});
