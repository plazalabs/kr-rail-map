// 회귀(숙제 96): 지도에서 역을 누르면 말풍선 [출발][도착][역 정보] — 입력 칸에 치지 않고 지도만으로 길찾기.
// 회장님 실사용(11-22): 광운대 → 삼성을 하려면 입력 칸에 쳐야 했다(역 누르기 → 역 상세 → 버튼, 역마다 두 단계).
import { test, expect } from '@playwright/test';
import { ID, open, tapStation, popup, pick, fields, waitRoute } from './lib-route-tap.mjs';
test.describe.configure({ timeout: 120_000 });   // 지도에서 역을 여러 번 눌러 경로를 두세 번 찾는다

for (const [w, h] of [[360, 740], [390, 844], [1440, 900]]) {
  test(`[R-96] 지도에서 광운대 [출발] → 삼성 [도착] → 경로 (입력 칸에 안 침) · ${w}px`, async ({ browser }) => {
    const { ctx, page, errs } = await open(browser, w, h);
    await tapStation(page, ID.gwang);
    await expect(popup(page)).toBeVisible();
    await expect(popup(page)).toContainText('광운대');
    await expect(page.locator('#sd-panel.sd-open')).toHaveCount(0);   // 바로 역 상세가 열리지 않는다
    await pick(page, '출발');
    await expect(popup(page)).toHaveCount(0);
    expect(await fields(page)).toEqual({ from: '광운대', to: '' });
    await tapStation(page, ID.sam);
    await expect(popup(page)).toContainText('삼성');
    await pick(page, '도착');
    await waitRoute(page);
    expect(await fields(page)).toEqual({ from: '광운대', to: '삼성' });
    await expect(page.locator('#status')).toContainText('광운대 → 삼성');
    expect(errs, '콘솔 오류').toEqual([]);
    await ctx.close();
  });

  test(`[R-96] 말풍선: 버튼 44px · 출발 채움/도착 테두리 · 가장자리 역도 안 잘림 · ${w}px`, async ({ browser }) => {
    const { ctx, page, errs } = await open(browser, w, h);
    for (const where of ['left', 'right', 'bottom']) {
      await tapStation(page, ID.yeo, { where });
      await expect(popup(page)).toBeVisible();
      await page.waitForTimeout(250);
      const r = await page.evaluate(() => {
        const box = document.querySelector('.st-popup').closest('.maplibregl-popup').getBoundingClientRect();
        const tab = document.getElementById('tabbar');
        const tr = tab && getComputedStyle(tab).display !== 'none' ? tab.getBoundingClientRect() : null;
        const tabTop = tr && tr.top > innerHeight / 2 ? tr.top : innerHeight;   // 휴대폰 아래 탭 바만 (PC 는 왼쪽 레일)
        const btns = [...document.querySelectorAll('.st-popup button')].map(b => {
          const q = b.getBoundingClientRect(), cs = getComputedStyle(b);
          return { name: b.textContent.trim(), w: q.width, h: q.height, bg: cs.backgroundColor, border: cs.borderTopColor };
        });
        return { l: box.left, t: box.top, r: box.right, b: box.bottom, W: innerWidth, tabTop, btns };
      });
      expect(r.l, where + ' 왼쪽').toBeGreaterThanOrEqual(0);
      expect(r.r, where + ' 오른쪽').toBeLessThanOrEqual(r.W);
      expect(r.t, where + ' 위').toBeGreaterThanOrEqual(0);
      expect(r.b, where + ' 아래(탭 바 위)').toBeLessThanOrEqual(r.tabTop);
      expect(r.btns.map(b => b.name)).toEqual(['출발', '도착', '역 정보']);
      for (const b of r.btns) { expect(b.w, b.name).toBeGreaterThanOrEqual(44); expect(b.h, b.name).toBeGreaterThanOrEqual(44); }
      // 출발 = 파란 채움(역 상세 '여기서 출발'과 같은 색), 도착 = 테두리(채움 아님)
      const accent = await page.evaluate(() => { const d = document.createElement('div'); d.style.background = 'var(--accent,#1a73e8)'; document.body.appendChild(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c; });
      expect(r.btns[0].bg, '출발 = 파란 채움(--accent)').toBe(accent);
      expect(r.btns[1].bg, '도착은 채움이 아님').not.toBe(accent);
      expect(r.btns[1].border, '도착 테두리').not.toBe('rgba(0, 0, 0, 0)');
      await expect(popup(page).getByRole('button', { name: '출발', exact: true }).locator('svg')).toHaveCount(1);
      await expect(popup(page).getByRole('button', { name: '도착', exact: true }).locator('svg')).toHaveCount(1);
      await page.keyboard.press('Escape');
      await expect(popup(page)).toHaveCount(0);
    }
    expect(errs, '콘솔 오류').toEqual([]);
    await ctx.close();
  });
}

test('[R-96] [역 정보] → 지금 역 상세 그대로 · 지도 빈 곳·Esc 로 닫힘 · 지도 옮기면 역을 따라감', async ({ browser }) => {
  const { ctx, page, errs } = await open(browser, 1440, 900);
  await tapStation(page, ID.yeo);
  await pick(page, '역 정보');
  const sd = page.locator('#sd-panel.sd-open');
  await expect(sd).toBeVisible();
  await expect(sd).toContainText('여의도');
  await expect(sd.getByRole('button', { name: /여기서 출발/ })).toBeVisible();
  await expect(sd.getByRole('button', { name: /여기로 도착/ })).toBeVisible();
  await expect(popup(page)).toHaveCount(0);
  await page.keyboard.press('Escape');
  // 지도 빈 곳을 누르면 닫힌다
  await tapStation(page, ID.yeo);
  await expect(popup(page)).toBeVisible();
  const empty = await page.evaluate(() => {   // 역도 말풍선도 없는 지도 빈 곳
    const cv = map.getCanvas(), r = cv.getBoundingClientRect(), pop = document.querySelector('.maplibregl-popup');
    for (let y = 120; y < innerHeight - 60; y += 40) for (let x = r.left + 40; x < r.right - 40; x += 40) {
      if (document.elementFromPoint(x, y) !== cv || (pop && pop.contains(document.elementFromPoint(x, y)))) continue;
      const q = [x - r.left, y - r.top];
      if (!map.queryRenderedFeatures([[q[0] - 30, q[1] - 30], [q[0] + 30, q[1] + 30]], { layers: ['rail-stations'] }).length) return [x, y];
    }
    return null;
  });
  expect(empty).not.toBeNull();
  await page.mouse.click(empty[0], empty[1]);
  await expect(popup(page)).toHaveCount(0);
  // 지도를 조금 옮기면 말풍선이 역을 따라간다
  const pt = await tapStation(page, ID.yeo);
  await expect(popup(page)).toBeVisible();
  const before = await popup(page).boundingBox();
  await page.evaluate(() => map.panBy([60, 40], { duration: 0 }));
  await page.waitForTimeout(200);
  const after = await popup(page).boundingBox();
  expect(Math.round(before.x - after.x), '가로로 따라감').toBe(60);
  expect(Math.round(before.y - after.y), '세로로 따라감').toBe(40);
  // 역이 화면 밖으로 나가면 닫힌다
  await page.evaluate(([x]) => map.panBy([x + 2000, 0], { duration: 0 }), [pt.x]);
  await expect(popup(page)).toHaveCount(0);
  expect(errs, '콘솔 오류').toEqual([]);
  await ctx.close();
});

test('[R-96] 어두운 테마에서도 말풍선 글자·버튼이 보인다', async ({ browser }) => {
  const { ctx, page, errs } = await open(browser, 390, 844, { theme: 'dark' });
  await tapStation(page, ID.gwang);
  await expect(popup(page)).toBeVisible();
  const c = await page.evaluate(() => {
    const lum = s => { const m = s.match(/[\d.]+/g).map(Number); const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const card = document.querySelector('.st-popup').closest('.maplibregl-popup-content');
    const bg = getComputedStyle(card).backgroundColor;
    const out = { bg: lum(bg), name: ratio(getComputedStyle(document.querySelector('.st-popup .st-name')).color, bg), btns: [] };
    for (const b of document.querySelectorAll('.st-popup button')) {
      const cs = getComputedStyle(b), bb = cs.backgroundColor === 'rgba(0, 0, 0, 0)' ? bg : cs.backgroundColor;
      out.btns.push([b.textContent.trim(), ratio(cs.color, bb)]);
    }
    return out;
  });
  expect(c.bg, '어두운 바탕').toBeLessThan(0.2);
  expect(c.name).toBeGreaterThanOrEqual(4.5);
  for (const [n, r] of c.btns) expect(r, n).toBeGreaterThanOrEqual(4.5);
  expect(errs, '콘솔 오류').toEqual([]);
  await ctx.close();
});
