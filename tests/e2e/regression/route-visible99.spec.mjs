// 회귀(숙제 99): 길찾기 경로가 뜬 뒤 다음 역을 지도에서 눈으로 찾아 누를 수 있어야 한다.
// 검수(11-22, 배포본 v320): 광운대 → 삼성 경로 뒤 여의도가 지도에 안 보였다(경로 밖 역 점 circle-opacity 0).
import { test, expect } from '@playwright/test';
import { ID, open, routeGwangSam, bringIntoView } from './lib-route-tap.mjs';
test.describe.configure({ timeout: 120_000 });

const setStationsVisible = (page, on) => page.evaluate(on => new Promise(res => {
  map.setLayoutProperty('rail-stations', 'visibility', on ? 'visible' : 'none');
  map.once('idle', res);
  map.triggerRepaint();
}), on);

for (const [w, h] of [[390, 844], [1440, 900]]) {
  test(`[R-99] 광운대 → 삼성 경로 뒤 여의도 역 점이 지도에 보인다 · ${w}px`, async ({ browser }) => {
    const { ctx, page, errs } = await open(browser, w, h);
    await routeGwangSam(page);
    const pt = await bringIntoView(page, ID.yeo, 13);
    // 그 자리가 다른 화면 요소에 가리지 않았는지
    expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y) === map.getCanvas(), [pt.x, pt.y])).toBe(true);
    const clip = { x: Math.round(pt.x) - 6, y: Math.round(pt.y) - 6, width: 12, height: 12 };
    // 역 점 레이어를 껐을 때·켰을 때·다시 껐을 때 그 자리를 찍는다. 두 번 끈 화면이 같을 때(타일 등이 다 그려진 뒤)만 판정한다.
    let seen = null;
    for (let i = 0; i < 6 && seen === null; i++) {
      await setStationsVisible(page, false);
      const off1 = await page.screenshot({ clip });
      await setStationsVisible(page, true);
      const on = await page.screenshot({ clip });
      await setStationsVisible(page, false);
      const off2 = await page.screenshot({ clip });
      await setStationsVisible(page, true);
      if (off1.equals(off2)) seen = !on.equals(off1);
      else await page.waitForTimeout(500);
    }
    expect(seen, '여의도 자리에 역 점이 그려져 있음').toBe(true);
    expect(errs).toEqual([]);
    await ctx.close();
  });
}
