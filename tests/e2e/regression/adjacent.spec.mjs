// 회귀: 인접역 방향 (숙제 40, E-20 옆). 같은 서울역에서 KTX 경부선과 경부선의 영등포가 서로 반대쪽에 보였다.
// 규칙: stops 가 있으면 stops 순서(서울 쪽 → 바깥), 없으면 서울역에 가까운 끝을 앞(←)에.
import { test, expect } from '@playwright/test';

async function openSeoul(page) {
  await page.addInitScript(() => {
    localStorage.setItem('krrail-guide-seen', '1');
    localStorage.setItem('krrail-invest-tip-seen', '1');
    localStorage.setItem('krrail-seen', String(Date.now()));
  });
  await page.goto('./');
  await expect(page.locator('#status')).toContainText('로드됨', { timeout: 20_000 });
  const box = page.getByRole('combobox', { name: '역 검색' });
  await box.fill('서울역');
  await page.waitForTimeout(400);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const sd = page.locator('#sd-panel');
  await expect(sd).toBeVisible();
  await sd.locator('summary').filter({ hasText: '인접역' }).click();
  return sd;
}

test('[R-adj] 서울역: KTX 경부선·경부선 모두 영등포는 → 쪽', async ({ page }) => {
  const sd = await openSeoul(page);
  const rows = await sd.locator('.sd-adj').allInnerTexts();
  const norm = rows.map(r => r.replace(/\s+/g, ' ').trim());
  const ktx = norm.find(r => r.startsWith('KTX 경부선'));
  const conv = norm.find(r => r.startsWith('경부선 '));
  expect(ktx, norm.join(' | ')).toMatch(/현재역 → .*영등포/);
  if (conv && /영등포/.test(conv)) expect(conv).toMatch(/현재역 → .*영등포/);
  const gtx = norm.find(r => r.startsWith('GTX-A'));
  expect(gtx).toMatch(/연신내 ← 현재역 → —/);
});
