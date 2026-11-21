// 회귀(숙제 77·76): rank.html 역 카드·공유 그림의 새 노선 글자.
// 77 전: 카드 연도를 노선 설명 글에서 뽑아 GTX-G '2030년'(설명 '2030년대 목표'), GTX-A 평택 연장 '2028년'(착공 구상) — open_year 는 null.
// 76 전: 공유 그림이 구상 노선도 '(계획)' — GTX-E 가 'GTX-E (계획)'.
// 86 (회장 결정 11-21): 카드·공유 그림 모두 LineStatus.label — '이름 (상태 말 · 연도)', 연도 없으면 '이름 (상태 말)'.
import { test, expect } from '@playwright/test';

const ID = { 구리: 'st-355173646', 평택지제: 'st-3406450397', 의정부: 'st-7777463060', 광운대: 'st-355172776', 수서: 'st-2346858840' };

async function openCard(page, name) {
  await page.goto('rank.html?open=' + ID[name]);
  const card = page.locator('#card-' + ID[name]);
  await expect(card).toBeVisible({ timeout: 20_000 });
  return card;
}
// 카드의 '이 역에 새로 생기는 노선' 한 줄씩 (노선 글자 그대로)
async function newLines(card) {
  return card.locator('.newlines .nl').evaluateAll(els => els.map(e => e.textContent.trim()));
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('umami.disabled', '1'); } catch (e) {}
    window.__txt = [];
    const f = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { window.__txt.push(String(t)); return f.call(this, t, ...a); };
  });
});

test('[R-77] rank.html 카드: 연도 없는 노선은 상태 말만, 연도는 open_year', async ({ page }) => {
  const g = await newLines(await openCard(page, '구리'));
  expect(g, JSON.stringify(g)).toContain('GTX-G (계획)');
  expect(g.join(' ')).not.toContain('2030');
  const p = await newLines(await openCard(page, '평택지제'));
  expect(p.find(s => s.startsWith('GTX-A 평택')), JSON.stringify(p)).toMatch(/ \((계획|구상)\)$/);
  expect(p.join(' ')).not.toContain('2028');
  const u = await newLines(await openCard(page, '의정부'));
  expect(u, JSON.stringify(u)).toContain('GTX-C (공사 중 · 2031)');
});

async function shareText(page, name) {
  await openCard(page, name);
  return page.evaluate(id => { window.__txt = []; window.RankShare.canvas(id); return window.__txt.find(t => t.startsWith('새 노선 ')) || ''; }, ID[name]);
}

test('[R-76] rank.html 공유 그림: 구상 노선은 (구상), 계획 노선은 (계획)', async ({ page }) => {
  const k = await shareText(page, '광운대');
  expect(k).toContain('GTX-E (구상 · 2035)');
  expect(k).not.toContain('GTX-E (계획');
  const s = await shareText(page, '수서');
  expect(s).toContain('GTX-D (계획 · 2035)');
});

test('[R-86] rank.html 역 카드 = 공유 그림 노선 글자: 수서 GTX-D · 구리 GTX-G · 의정부 GTX-C', async ({ page }) => {
  for (const [name, want] of [['수서', 'GTX-D (계획 · 2035)'], ['구리', 'GTX-G (계획)'], ['의정부', 'GTX-C (공사 중 · 2031)']]) {
    const card = await newLines(await openCard(page, name));
    expect(card, name + ' 카드 ' + JSON.stringify(card)).toContain(want);
    const share = await shareText(page, name);
    expect(share, name + ' 공유 그림').toContain(want);
  }
});

test('[R-76] rank.html 공유 단추를 눌러도 페이지 오류 0', async ({ page }) => {
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const card = await openCard(page, '광운대');
  await card.locator('[data-share]').click();
  await expect(card.locator('.share-msg')).not.toHaveText('', { timeout: 10_000 });
  expect(errs).toEqual([]);
  expect((await page.evaluate(() => window.__txt)).find(t => t.startsWith('새 노선 '))).toContain('GTX-E (구상 · 2035)');
});
