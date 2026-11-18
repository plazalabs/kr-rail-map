// 회귀(E-06·E-07, 숙제 14·15): 회장 결정 11-18 '모두 출근 배차'.
// 길찾기 시간대 칸을 건드리지 않으면 출근 배차로 찾고, 아래 상태줄도 같은 분·같은 시간대를 말한다.
// 역 상세 '출발' 버튼으로 넘어가도 출근. 밤에 돌려도 같아야 한다(예전 기본 '지금 시각'은 밤엔 평시).
import { test, expect } from '@playwright/test';

async function boot(page) {
  await page.addInitScript(() => {
    localStorage.setItem('krrail-guide-seen', '1');
    localStorage.setItem('krrail-invest-tip-seen', '1');
    localStorage.setItem('krrail-seen', String(Date.now()));
  });
  await page.clock.install({ time: new Date('2026-11-18T22:30:00+09:00') });   // 평일 밤 — 예전 기본이면 평시
  await page.goto('./');
  await expect(page.locator('#status')).toContainText('로드됨', { timeout: 20_000 });
}

async function pick(page, sel, v) {
  const el = page.locator(sel);
  await el.fill('');
  await el.fill(v);
  await page.waitForTimeout(400);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
}

const total = async page => (await page.locator('#route-result .total').first().innerText()).replace(/\s+/g, ' ');

test('[R-band] 길찾기 기본 = 출근 배차, 상태줄 분·시간대 = 결과 줄', async ({ page }) => {
  await boot(page);
  await page.getByRole('navigation', { name: '주요 메뉴' }).getByRole('button', { name: '길찾기' }).click();
  await expect(page.locator('#route-band')).toHaveValue('peak');
  for (const [a, b] of [['광운대', '선릉'], ['서울역', '강남'], ['수원', '강남']]) {
    await pick(page, '#route-from', a);
    await pick(page, '#route-to', b);
    await page.locator('#route-go').click();
    await page.waitForTimeout(600);
    const t = await total(page);
    expect(t, `${a}→${b}`).toMatch(/출근 배차/);
    const panelMin = Number(t.match(/총 약 (\d+)분/)[1]);
    const status = await page.locator('#status').innerText();
    expect(Number(status.match(/약 (\d+)분/)[1]), `${a}→${b} 상태줄: ${status}`).toBe(panelMin);
    expect(status, `${a}→${b} 상태줄 시간대`).toMatch(/출근 배차/);
  }
});

test('[R-band] 역 상세 → 길찾기로 넘어가도 출근 배차', async ({ page }) => {
  await boot(page);
  const box = page.getByRole('combobox', { name: '역 검색' });
  await box.fill('광운대');
  await page.waitForTimeout(400);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const sd = page.locator('#sd-panel');
  await expect(sd).toBeVisible();
  await sd.locator('button[data-act="from"]').click();
  await pick(page, '#route-to', '선릉');
  await page.locator('#route-go').click();
  await page.waitForTimeout(600);
  await expect(page.locator('#route-band')).toHaveValue('peak');
  expect(await total(page)).toMatch(/출근 배차/);
});
