// 회귀(숙제 85, 회장 결정 11-21): 화면 글자 '떡상' → '축지법'(랭킹·TOP 10·지도·패널), 단계 이름 → '축지법급'.
// 화면에 나오는 것만 센다: 보이는 글자(innerText) + aria-label + title 속성 + 문서 제목. 주석·금지어 목록·umami 이벤트 이름은 세지 않는다.
// 순위 숫자는 그대로 — 축지법 패널 TOP 10 = rank.html TOP 10 = 홈 카드(rank-top.json).
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.env.KR_RAIL_ROOT || process.cwd();
const TOP = JSON.parse(readFileSync(join(ROOT, 'data/rank-top.json'), 'utf8')).top;
const OLD = '떡상';

async function seen(page) {
  await page.addInitScript(() => {
    localStorage.setItem('krrail-guide-seen', '1');
    localStorage.setItem('krrail-invest-tip-seen', '1');
    localStorage.setItem('krrail-seen', String(Date.now()));
    localStorage.setItem('umami.disabled', '1');
  });
  await page.route('https://cloud.umami.is/**', r => r.abort());
}
// 화면 글자 모으기: 보이는 글자 + aria-label + title 속성 + 문서 제목
const screenText = page => page.evaluate(() => [document.title, document.body.innerText,
  ...[...document.querySelectorAll('[aria-label],[title]')].flatMap(e => [e.getAttribute('aria-label') || '', e.getAttribute('title') || ''])].join('\n'));
const hits = t => t.split('\n').filter(l => l.includes('떡상'));

for (const f of ['rank.html', 'data.html', 'board.html', '404.html']) {
  test(`[R-85] ${f}: 화면 글자·aria-label·title 에 '떡상' 0`, async ({ page }) => {
    await seen(page);
    await page.goto('./' + f);
    await page.waitForLoadState('networkidle');
    if (f === 'rank.html') await expect(page.locator('.tchip').first()).toBeVisible({ timeout: 20_000 });
    expect(hits(await screenText(page))).toEqual([]);
  });
}

test("[R-85] index: 첫 화면·축지법 패널·지도 범례·역 상세·빠른 실행에 '떡상' 0, '축지법' 있음", async ({ page }) => {
  await seen(page);
  await page.goto('./');
  await expect(page.locator('#status')).toContainText('로드됨', { timeout: 20_000 });
  const all = [await screenText(page)];
  // 빠른 실행(검색창) 힌트
  const box = page.getByRole('combobox', { name: '역 검색' });
  await box.fill('순위');
  await page.waitForTimeout(400);
  all.push(await screenText(page));
  await box.fill('');
  await page.keyboard.press('Escape');
  // 축지법 패널 + 지도 범례(지도 레이어 켜짐)
  await page.getByRole('navigation', { name: '주요 메뉴' }).getByRole('button', { name: '개통효과' }).click();
  const rp = page.locator('#rocket-panel');
  await expect(rp).toContainText('의정부', { timeout: 20_000 });
  all.push(await screenText(page));
  const panel = await rp.evaluate(e => e.innerText + '\n' + e.getAttribute('aria-label'));
  expect(panel).toContain('축지법 랭킹');
  expect(panel).toContain('축지법급');
  // 사이드바 '개통 효과 지도' 범례 (켜면 보이는 글자)
  const leg = await page.locator('#rk-legend').evaluate(e => e.textContent);
  all.push(leg);
  expect(leg).toContain('축지법급');
  await rp.getByRole('button', { name: '축지법 패널 닫기' }).click();
  // 역 상세 접근성 칸: '축지법 랭킹에서 보기'
  await box.fill('의정부');
  await page.waitForTimeout(400);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const sd = page.locator('#sd-panel');
  await expect(sd).toContainText('랭킹에서 보기', { timeout: 20_000 });
  await expect(sd).toContainText('축지법 랭킹에서 보기');
  all.push(await screenText(page));
  expect(hits(all.join('\n'))).toEqual([]);
});

test('[R-85] 값은 그대로: 축지법 패널 TOP 10 = rank.html TOP 10, 맨 앞 3곳 = 홈 카드(rank-top.json)', async ({ page }) => {
  await seen(page);
  await page.goto('./?rocket=1');
  const rp = page.locator('#rocket-panel');
  await expect(rp.locator('#rkp-list li').first()).toBeVisible({ timeout: 20_000 });
  const names = (await rp.locator('#rkp-list .rkp-nm b').allTextContents()).slice(0, 10);
  const ranks = (await rp.locator('#rkp-list .rkp-rt small').allTextContents()).slice(0, 10);
  await page.goto('./rank.html');
  await expect(page.locator('#slope svg')).toBeVisible({ timeout: 20_000 });
  const slope = await page.locator('#slope .nm').allTextContents();
  expect(names.slice(0, 10)).toEqual(slope.slice(0, 10).map(s => s.trim()));
  expect(names.slice(0, 3)).toEqual(TOP.map(t => t.n));
  for (let i = 0; i < 3; i++) expect(ranks[i]).toBe(`${TOP[i].now} → ${TOP[i].aft}위`);
});
