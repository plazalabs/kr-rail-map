// 회귀(숙제 101): 길찾기 중 [다른 역 보기] 버튼(경로 결과 카드 안).
// 회장님 결정(11-22): 경로만 남고 다 사라지는 화면이 이 앱의 장점 — 기본은 경로 밖 역 점 0, 버튼을 누를 때만 흐린 점(45%).
import { test, expect } from '@playwright/test';
import { ID, open, tapStation, popup, pick, fields, waitRoute, routeGwangSam, bringIntoView, dotSeen } from './lib-route-tap.mjs';
test.describe.configure({ timeout: 240_000 });   // 경로를 찾고 역 점을 화면으로 여러 번 찍는다(점 하나에 최대 6번)

const btn = page => page.locator('#route-panel').getByRole('button', { name: /^(다른 역 보기|경로만 보기)$/ });

for (const [w, h] of [[390, 844], [1440, 900]]) {
  test(`[R-101] 경로 뒤 기본은 여의도 점 숨김 · [다른 역 보기] → 보임 → 여의도 말풍선 · ${w}px`, async ({ browser }) => {
    const { ctx, page, errs } = await open(browser, w, h);
    await routeGwangSam(page);
    await expect(btn(page)).toBeVisible();
    await expect(btn(page)).toHaveText('다른 역 보기');
    const box = await btn(page).boundingBox();
    expect(box.width, '버튼 폭 44px 이상').toBeGreaterThanOrEqual(44);
    expect(box.height, '버튼 높이 44px 이상').toBeGreaterThanOrEqual(44);

    let pt = await bringIntoView(page, ID.yeo, 13);
    expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y) === map.getCanvas(), [pt.x, pt.y])).toBe(true);
    expect(await dotSeen(page, pt), '기본: 여의도 점 안 보임').toBe(false);

    await btn(page).click();
    await expect(btn(page)).toHaveText('경로만 보기');
    pt = await bringIntoView(page, ID.yeo, 13);
    expect(await dotSeen(page, pt), '[다른 역 보기] 뒤 여의도 점 보임').toBe(true);

    await tapStation(page, ID.yeo);
    await expect(popup(page)).toBeVisible();
    expect((await popup(page).innerText()).split('\n')[0].trim()).toBe('여의도');
    expect(errs, '콘솔 오류').toEqual([]);
    await ctx.close();
  });

  test(`[R-101] [경로만 보기]를 누르면 다시 숨김 · ${w}px`, async ({ browser }) => {
    const { ctx, page, errs } = await open(browser, w, h);
    await routeGwangSam(page);
    await btn(page).click();
    await expect(btn(page)).toHaveText('경로만 보기');
    await btn(page).click();
    await expect(btn(page)).toHaveText('다른 역 보기');
    const pt = await bringIntoView(page, ID.yeo, 13);
    expect(await dotSeen(page, pt), '[경로만 보기] 뒤 여의도 점 안 보임').toBe(false);
    expect(errs, '콘솔 오류').toEqual([]);
    await ctx.close();
  });

  test(`[R-101] 켠 채로 새 경로가 뜨면 다시 숨김 · 닫으면 모두 1 · ${w}px`, async ({ browser }) => {
    const { ctx, page, errs } = await open(browser, w, h);
    await routeGwangSam(page);
    // 켠 채로 여의도 [도착] → 광운대 → 여의도: 새 경로는 기본(숨김) — 삼성은 이제 경로 밖
    await btn(page).click();
    await expect(btn(page)).toHaveText('경로만 보기');
    await tapStation(page, ID.yeo); await pick(page, '도착');
    await expect(page.locator('#status')).toContainText('광운대 → 여의도', { timeout: 30_000 });
    expect(await fields(page)).toEqual({ from: '광운대', to: '여의도' });
    await waitRoute(page);
    await page.waitForTimeout(1500);
    await expect(btn(page)).toHaveText('다른 역 보기');
    const pt = await bringIntoView(page, ID.sam, 13);
    expect(await dotSeen(page, pt), '새 경로 뒤 삼성 점 안 보임').toBe(false);

    await page.locator('#route-close').click();
    expect(await page.evaluate(() => [map.getPaintProperty('rail-stations', 'circle-opacity'), map.getPaintProperty('rail-stations', 'circle-stroke-opacity')])).toEqual([1, 1]);
    expect(errs, '콘솔 오류').toEqual([]);
    await ctx.close();
  });
}

for (const theme of ['light', 'dark']) {
  test(`[R-101] [다른 역 보기] 글자 대비 4.5 이상 · ${theme} · 390·1440`, async ({ browser }) => {
    for (const [w, h] of [[390, 844], [1440, 900]]) {
      const { ctx, page } = await open(browser, w, h, { theme });
      await routeGwangSam(page);
      await expect(btn(page)).toBeVisible();
      for (let i = 0; i < 2; i++) {
        const ratio = await btn(page).evaluate(el => {
          const rgb = s => (s.match(/[\d.]+/g) || []).map(Number);
          const lum = ([r, g, b]) => { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
          const fg = rgb(getComputedStyle(el).color);
          let bg = null;
          for (let n = el; n && !bg; n = n.parentElement) { const c = rgb(getComputedStyle(n).backgroundColor); if (c.length >= 3 && (c.length < 4 || c[3] > 0.9)) bg = c; }
          bg = bg || [255, 255, 255];
          const a = lum(fg), b = lum(bg);
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        });
        expect(ratio, `${w}px ${await btn(page).innerText()} 대비`).toBeGreaterThanOrEqual(4.5);
        await btn(page).click();
      }
      await ctx.close();
    }
  });
}
