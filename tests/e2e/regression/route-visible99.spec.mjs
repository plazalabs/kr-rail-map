// 회귀(숙제 99): 길찾기 경로가 뜬 뒤 다음 역을 지도에서 눈으로 찾아 누를 수 있어야 한다.
// 검수(11-22, 배포본 v320): 광운대 → 삼성 경로 뒤 여의도가 지도에 안 보였다(경로 밖 역 점 circle-opacity 0).
// 숙제 101(회장님 결정 11-22): 기본은 다시 숨김 — [다른 역 보기]를 누른 뒤 보이는지 본다.
import { test, expect } from '@playwright/test';
import { ID, open, routeGwangSam, bringIntoView, dotSeen } from './lib-route-tap.mjs';
test.describe.configure({ timeout: 120_000 });

for (const [w, h] of [[390, 844], [1440, 900]]) {
  test(`[R-99] 광운대 → 삼성 경로 뒤 [다른 역 보기]를 누르면 여의도 역 점이 지도에 보인다 · ${w}px`, async ({ browser }) => {
    const { ctx, page, errs } = await open(browser, w, h);
    await routeGwangSam(page);
    await page.locator('#route-panel').getByRole('button', { name: '다른 역 보기', exact: true }).click();
    const pt = await bringIntoView(page, ID.yeo, 13);
    // 그 자리가 다른 화면 요소에 가리지 않았는지
    expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y) === map.getCanvas(), [pt.x, pt.y])).toBe(true);
    const seen = await dotSeen(page, pt);
    expect(seen, '여의도 자리에 역 점이 그려져 있음').toBe(true);
    expect(errs).toEqual([]);
    await ctx.close();
  });
}
