// 회귀(숙제 99): 지도에서 역 자리를 누르면 그 역이 잡혀야 한다 — 18px 상자 안 첫 번째가 아니라 가장 가까운 역.
// 검수(11-22, 배포본 v320): 여의도 자리를 정확히 눌렀는데 샛강 말풍선이 떴다(상자 안 순서: 샛강, 여의도).
// 경로가 없을 때도 같다(원래 있던 버그).
import { test, expect } from '@playwright/test';
import { ID, open, popup, routeGwangSam, bringIntoView } from './lib-route-tap.mjs';
test.describe.configure({ timeout: 120_000 });

async function tapAndName(page, pt) {
  const mobile = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  if (mobile) await page.touchscreen.tap(pt.x, pt.y); else await page.mouse.click(pt.x, pt.y);
  await expect(popup(page)).toBeVisible();
  return (await popup(page).innerText()).split('\n')[0].trim();
}

for (const [w, h, zoom] of [[390, 844, 11.3], [1024, 768, 11.3], [1440, 900, 11.3]]) {
  test(`[R-99] 경로 뒤 여의도 자리를 누르면 여의도 말풍선(샛강 아님) · ${w}px 줌 ${zoom}`, async ({ browser }) => {
    const { ctx, page, errs } = await open(browser, w, h);
    await routeGwangSam(page);
    const pt = await bringIntoView(page, ID.yeo, zoom);
    expect(await tapAndName(page, pt)).toBe('여의도');
    expect(errs).toEqual([]);
    await ctx.close();
  });
}

test('[R-99] 경로 없을 때 여의도 자리를 누르면 여의도 말풍선(샛강 아님) · 1440px 줌 11.3', async ({ browser }) => {
  const { ctx, page, errs } = await open(browser, 1440, 900);
  const pt = await bringIntoView(page, ID.yeo, 11.3);
  expect(await tapAndName(page, pt)).toBe('여의도');
  expect(errs).toEqual([]);
  await ctx.close();
});
