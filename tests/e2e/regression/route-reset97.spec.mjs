// 회귀(숙제 97): 경로를 본 뒤 다른 역을 찍으면 이전 출발·도착이 원하지 않게 남던 것.
// 회장님 실사용(11-22): 광운대 → 삼성 뒤 여의도를 '출발'로 하면 여의도 → 삼성, '도착'으로 하면 광운대 → 여의도가 바로 찾아졌다.
// 규칙(회장님 결정 11-22, 숙제 102로 바뀜): 두 칸이 다 찬 뒤 [출발] = 출발만 바꿔 다시 찾음 · [도착] = 도착만 바꿔 다시 찾음.
import { test, expect } from '@playwright/test';
import { ID, open, tapStation, popup, pick, fields, waitRoute } from './lib-route-tap.mjs';
test.describe.configure({ timeout: 120_000 });   // 지도에서 역을 여러 번 눌러 경로를 두세 번 찾는다

async function gwangSam(page) {
  await tapStation(page, ID.gwang); await pick(page, '출발');
  await tapStation(page, ID.sam); await pick(page, '도착');
  await waitRoute(page);
  expect(await fields(page)).toEqual({ from: '광운대', to: '삼성' });
}

for (const [w, h] of [[390, 844], [1440, 900]]) {
  test(`[R-97] 광운대 → 삼성 뒤 여의도 [출발] → 여의도 → 삼성 경로 · ${w}px`, async ({ browser }) => {
    const { ctx, page, errs } = await open(browser, w, h);
    await gwangSam(page);
    await tapStation(page, ID.yeo); await pick(page, '출발');
    await expect(page.locator('#status')).toContainText('여의도 → 삼성', { timeout: 30_000 });
    expect(await fields(page)).toEqual({ from: '여의도', to: '삼성' });
    await expect(page.locator('#route-result')).not.toContainText('광운대');
    expect(errs, '콘솔 오류').toEqual([]);
    await ctx.close();
  });

  test(`[R-97] 광운대 → 삼성 뒤 여의도 [도착] → 광운대 → 여의도 경로 · ${w}px`, async ({ browser }) => {
    const { ctx, page, errs } = await open(browser, w, h);
    await gwangSam(page);
    await tapStation(page, ID.yeo); await pick(page, '도착');
    await expect(page.locator('#status')).toContainText('광운대 → 여의도', { timeout: 30_000 });
    expect(await fields(page)).toEqual({ from: '광운대', to: '여의도' });
    expect(errs, '콘솔 오류').toEqual([]);
    await ctx.close();
  });
}

test('[R-97] 이어 가기: 경로 뒤 삼성 [출발] → 여의도 [도착] = 삼성 → 여의도', async ({ browser }) => {
  const { ctx, page, errs } = await open(browser, 1440, 900);
  await gwangSam(page);
  await tapStation(page, ID.sam); await pick(page, '출발');
  // 숙제 102: [출발]은 도착을 남긴다 — 삼성 → 삼성은 같은 역 안내
  expect(await fields(page)).toEqual({ from: '삼성', to: '삼성' });
  await expect(page.locator('#route-result')).toContainText('출발역과 도착역이 같아요');
  await tapStation(page, ID.yeo); await pick(page, '도착');
  await expect(page.locator('#status')).toContainText('삼성 → 여의도', { timeout: 30_000 });
  expect(errs, '콘솔 오류').toEqual([]);
  await ctx.close();
});

test('[R-97] 같은 역을 출발·도착 둘 다로 고르면 경로를 안 찾고 한 줄 안내', async ({ browser }) => {
  const { ctx, page, errs } = await open(browser, 390, 844);
  await tapStation(page, ID.yeo); await pick(page, '출발');
  await tapStation(page, ID.yeo); await pick(page, '도착');
  await expect(page.locator('#route-result')).toContainText('출발역과 도착역이 같아요');
  expect(await page.evaluate(() => !!map.getLayer('route-casing'))).toBe(false);
  expect(errs, '콘솔 오류').toEqual([]);
  await ctx.close();
});

test('[R-97] 도착 먼저 골라도 된다: 삼성 [도착] → 광운대 [출발] = 광운대 → 삼성', async ({ browser }) => {
  const { ctx, page, errs } = await open(browser, 1440, 900);
  await tapStation(page, ID.sam); await pick(page, '도착');
  expect(await fields(page)).toEqual({ from: '', to: '삼성' });
  await tapStation(page, ID.gwang); await pick(page, '출발');
  await waitRoute(page);
  await expect(page.locator('#status')).toContainText('광운대 → 삼성');
  expect(errs, '콘솔 오류').toEqual([]);
  await ctx.close();
});
