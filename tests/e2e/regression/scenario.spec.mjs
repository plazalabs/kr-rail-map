// 회귀: 순위 기준은 "2031년까지 개통" 하나 (회장 결정, CLAUDE.md 3-1).
// 홈 카드·축지법 패널·타일 지도가 같은 기본 연도와 같은 수도권 역 수, 같은 의정부 순위를 낸다 (E-02·E-03 과 같은 비교, 홈 카드가 뜰 때까지 기다림).
import { test, expect } from '@playwright/test';

async function boot(page) {
  await page.addInitScript(() => {
    localStorage.setItem('krrail-guide-seen', '1');
    localStorage.setItem('krrail-invest-tip-seen', '1');
    localStorage.setItem('krrail-seen', String(Date.now()));
  });
  await page.goto('./');
  await expect(page.locator('#status')).toContainText('로드됨', { timeout: 20_000 });
  await expect(page.locator('#home-cards')).toContainText('개통 가정', { timeout: 10_000 });
}
const num = s => Number(String(s).replace(/,/g, ''));

test('[R-scenario] 홈 카드 = 타일 지도 기본값 (2031년까지 · 수도권 N역 · 의정부 순위)', async ({ page }) => {
  await boot(page);
  const home = await page.locator('#home-cards').innerText();
  const homeN = num(home.match(/수도권 ([\d,]+)역/)[1]);
  expect(home).toMatch(/2031년까지 개통 가정/);
  const homeUi = home.match(/의정부[\s\S]*?(\d+)위→(\d+)위/);
  await page.getByRole('button', { name: /GTX 역 타일로 한눈에 보기/ }).click();
  const mm = page.locator('#mm-panel');
  await expect(mm).toContainText('수도권');
  const tile = await mm.innerText();
  expect(num(tile.match(/수도권 ([\d,]+)역/)[1])).toBe(homeN);
  await mm.getByText('의정부', { exact: true }).click();
  const t = (await mm.innerText()).match(/순위 (\d+)위 → (\d+)위/);
  expect([t[1], t[2]]).toEqual([homeUi[1], homeUi[2]]);
});
