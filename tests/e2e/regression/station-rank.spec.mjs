// 회귀(숙제 64, 회장 결정 11-18): 의정부 역 상세 순위 = 홈 카드 = 떡상 랭킹, 기준은 숫자와 같은 줄.
// 배포본: 홈·랭킹 "2031년까지 · 수도권 675역 · 448→117위" / 역 상세 "전국 127위 · GBD 중시 134위 · 개통 단축 16위".
import { test, expect } from '@playwright/test';

test('[R-64] 의정부: 역 상세 "2031년까지 개통 · 수도권 675역 중 117위" = 홈 카드 = 랭킹', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('krrail-guide-seen', '1');
    localStorage.setItem('krrail-invest-tip-seen', '1');
    localStorage.setItem('krrail-seen', String(Date.now()));
  });
  await page.goto('./');
  await expect(page.locator('#status')).toContainText('로드됨', { timeout: 20_000 });
  await expect(page.locator('#home-cards')).toContainText('의정부', { timeout: 20_000 });
  const home = await page.locator('#home-cards').innerText();
  const [, hYear] = home.match(/(20\d\d)년까지 개통 가정/);
  const [, hN] = home.match(/수도권 ([\d,]+)역/);
  const [, , hAft] = home.match(/의정부[\s\S]*?(\d+)위→(\d+)위/);

  await page.getByRole('navigation', { name: '주요 메뉴' }).getByRole('button', { name: '개통효과' }).click();
  const rp = page.locator('#rocket-panel');
  await expect(rp).toContainText('의정부', { timeout: 20_000 });
  const [, , rAft] = (await rp.innerText()).match(/의정부\s+GTX-C · 2031\s+▲\d+위\s+(\d+) → (\d+)위/);
  await rp.getByRole('button', { name: '떡상 패널 닫기' }).click();

  const box = page.getByRole('combobox', { name: '역 검색' });
  await box.fill('의정부');
  await page.waitForTimeout(400);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const sd = page.locator('#sd-panel');
  await expect(sd).toContainText('년까지 개통 · 수도권', { timeout: 20_000 });
  const line = (await sd.locator('.sa-sum').allInnerTexts()).find(t => /년까지 개통 · /.test(t));
  const m = line.match(/(20\d\d)년까지 개통 · 수도권 ([\d,]+)역 중 (\d+)위/);
  expect(m, line).not.toBeNull();
  expect({ year: m[1], n: m[2], rank: m[3] }).toEqual({ year: hYear, n: hN, rank: hAft });
  expect(m[3]).toBe(rAft);
  // 연도·범위 없는 옛 순위 말이 남지 않는다
  expect(await sd.innerText()).not.toMatch(/GBD 중시 \d+위|개통 단축 \d+위/);
});
