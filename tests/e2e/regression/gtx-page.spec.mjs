// 회귀(숙제 81): GTX 입구 gtx.html — 입력 하나 → 카드 하나. 숫자는 data/gtx-card.json 그대로.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.env.KR_RAIL_ROOT || process.cwd();
const D = JSON.parse(readFileSync(join(ROOT, 'data/gtx-card.json'), 'utf8'));
const BANNED = ['떡상', '계단', '때문에', '오를', '사세요', '매수', '매도', '투자 추천'];
// 데이터에서 고른 역 (11-21 자료): 판단 보류 = 보산(동 거래 10건 미만), 시세 자료 없음 = 한성대입구
const HOLD = '보산', NONE = '한성대입구';

async function open(page, errs) {
  page.on('pageerror', e => errs.push(String(e)));
  // umami 는 시험에서 막는다(배포본 통계 오염 방지) — 그 요청 실패 글은 오류로 안 센다
  page.on('console', m => { if (m.type() === 'error' && !(m.location().url || '').includes('umami') && !/ERR_FAILED/.test(m.text())) errs.push(m.text()); });
  page.on('requestfailed', r => { if (!r.url().includes('umami')) errs.push('요청 실패 ' + r.url()); });
  await page.addInitScript(() => {
    localStorage.setItem('umami.disabled', '1');
    window.__ev = []; window.umami = { track: (n, d) => window.__ev.push([n, d]) };
  });
  await page.route('https://cloud.umami.is/**', r => r.abort());
  await page.goto('./gtx.html');
  await expect(page.locator('body[data-ready="1"]')).toHaveCount(1, { timeout: 15_000 });
}
const search = async (page, q) => { await page.locator('#q').fill(q); await page.locator('#q').press('Enter'); };

test('[R-81] 의정부 입력 → 큰 숫자·칩 두 개·면책, 금지어 없음, 콘솔 오류 0', async ({ page }) => {
  const errs = [];
  await open(page, errs);
  await search(page, '의정부');
  const card = page.locator('#card');
  await expect(card).toBeVisible();
  const x = D.s['st-7777463060'], d = D.dest[x.d];
  await expect(card.locator('.big')).toContainText(`${d.name}까지 지금 ${x.now[x.d]}분 → 개통 후 ${x.aft[x.d]}분`);
  await expect(card.locator('.chip.acc')).toContainText('접근성 크게 개선');
  await expect(card.locator('.chip.mk')).toHaveCount(1);
  await expect(card).toContainText('접근성 순위와 시세는 다른 지표 · 집값 예측 아님');
  const text = await card.innerText();
  expect(BANNED.filter(w => text.includes(w))).toEqual([]);
  expect(errs).toEqual([]);
});

test('[R-81] 시세 칩: 판단 보류 역·자료 없는 역 글자', async ({ page }) => {
  await open(page, []);
  await search(page, HOLD);
  await expect(page.locator('#card .chip.mk')).toContainText('판단 보류');
  await page.locator('#card .chip.mk').click();
  await expect(page.locator('#card .chip-note')).toContainText('거래가 적어 비교하지 않아요');
  await search(page, NONE);
  await expect(page.locator('#card .chip.mk')).toContainText('시세 자료 없음');
  await page.locator('#card .chip.mk').click();
  await expect(page.locator('#card .chip-note')).toContainText('실거래 자료가 없어요');
});

test('[R-81] TOP3 누르면 그 역 카드', async ({ page }) => {
  const top = JSON.parse(readFileSync(join(ROOT, 'data/rank-top.json'), 'utf8')).top;
  await open(page, []);
  await page.locator('#top3-list button').nth(1).click();
  await expect(page.locator('#card')).toHaveAttribute('data-st', top[1].id);
  await expect(page.locator('#card .st')).toContainText(top[1].n);
});

test('[R-81] 공유 단추 → share_card 이벤트 1회 (card-gtx)', async ({ page }) => {
  await open(page, []);
  await search(page, '의정부');
  const dl = page.waitForEvent('download').catch(() => null);
  await page.locator('#card .actions .primary').click();
  await dl;
  await expect.poll(() => page.evaluate(() => window.__ev.filter(e => e[0] === 'share_card').length)).toBe(1);
  expect(await page.evaluate(() => window.__ev.find(e => e[0] === 'share_card')[1])).toEqual({ 종류: 'card-gtx' });
});
