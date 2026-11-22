// 회귀(숙제 102): 경로를 본 뒤 다른 역을 [출발]로 고르면 출발만 바꾸고 도착은 그대로 둔 채 바로 다시 찾는다.
// 회장님 실사용(11-22): 광운대 → 삼성 뒤 석계를 [출발]로 누르면 삼성이 사라져 삼성을 다시 찾아 눌러야 했다(97 규칙).
import { test, expect } from '@playwright/test';
import { ID, open, tapStation, pick, fields, waitRoute } from './lib-route-tap.mjs';
test.describe.configure({ timeout: 120_000 });

const SEOKGYE = 'st-6041673026';

for (const [w, h] of [[390, 844], [1440, 900]]) {
  test(`[R-102] 광운대 → 삼성 뒤 석계 [출발] → 석계 → 삼성 경로, 도착 칸 = 삼성 · ${w}px`, async ({ browser }) => {
    const { ctx, page, errs } = await open(browser, w, h);
    await tapStation(page, ID.gwang); await pick(page, '출발');
    await tapStation(page, ID.sam); await pick(page, '도착');
    await waitRoute(page);
    expect(await fields(page)).toEqual({ from: '광운대', to: '삼성' });
    await tapStation(page, SEOKGYE); await pick(page, '출발');
    await expect(page.locator('#status')).toContainText('석계 → 삼성', { timeout: 30_000 });
    expect(await fields(page)).toEqual({ from: '석계', to: '삼성' });
    await waitRoute(page);
    expect(errs, '콘솔 오류').toEqual([]);
    await ctx.close();
  });
}
