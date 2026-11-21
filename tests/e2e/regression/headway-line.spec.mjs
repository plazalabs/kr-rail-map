// 회귀(숙제 60·73): 역 상세 경유 노선마다 배차 한 줄 "배차 출근 약 ○분 / 평시 약 ○분".
// 값은 data/headways.json(출근)·headways-off.json(평시)의 역 값 — 화면 글자만 반올림(1분 미만은 1). 자료 없는 노선·역은 줄을 숨긴다.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.env.KR_RAIL_ROOT || process.cwd();
const J = p => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const PEAK = J('data/headways.json'), OFF = J('data/headways-off.json');
const raw = (doc, lid, nm) => ((doc.lines[lid] || {}).stations || {})[nm];
const txt = v => (v == null ? '—' : (v >= 999 ? '열차 없음' : '약 ' + Math.max(1, Math.round(v)) + '분'));

async function openStation(page, q) {
  await page.addInitScript(() => {
    localStorage.setItem('krrail-guide-seen', '1');
    localStorage.setItem('krrail-invest-tip-seen', '1');
    localStorage.setItem('krrail-seen', String(Date.now()));
  });
  await page.goto('./');
  await expect(page.locator('#status')).toContainText('로드됨', { timeout: 20_000 });
  const box = page.getByRole('combobox', { name: '역 검색' });
  await box.fill(q);
  await page.waitForTimeout(400);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const sd = page.locator('#sd-panel');
  await expect(sd).toBeVisible();
  return sd;
}

test('[R-hw] 서울역: 노선마다 배차 줄 = 자료 값 그대로, 자료 없는 노선은 줄 없음', async ({ page }) => {
  const sd = await openStation(page, '서울역');
  await page.waitForTimeout(1500);   // 평시 자료는 따로 받는다
  for (const [lid, nm] of [['seoul-metropolitan-subway-line-1', '수도권 전철 1호선'], ['seoul-metropolitan-subway-line-4', '수도권 전철 4호선'], ['arex', null]]) {
    const row = sd.locator(`.sd-line[data-lid="${lid}"]`);
    const hw = row.locator('.sd-hw');
    await expect(hw, lid).toBeVisible();
    await expect(hw, lid).toHaveText(`배차 출근 ${txt(raw(PEAK, lid, '서울'))} / 평시 ${txt(raw(OFF, lid, '서울'))}`);
  }
  // 소수점 배차 글자가 역 상세 어디에도 없다
  expect(await sd.innerText()).not.toMatch(/\d+\.\d+분/);
  // KTX 경부선은 배차 자료가 없다 → 줄을 숨김
  const ktx = sd.locator('.sd-line[data-lid="gyeongbu-line-ktx"] .sd-hw');
  await expect(ktx).toHaveCount(0);
});

test('[R-hw] 자료가 하나도 없는 역(정선)은 배차 줄이 없다', async ({ page }) => {
  const sd = await openStation(page, '정선');
  await page.waitForTimeout(1500);
  await expect(sd.locator('.sd-hw')).toHaveCount(0);
});
