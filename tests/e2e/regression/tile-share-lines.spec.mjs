// 회귀(숙제 90, 회장 결정 11-21): 타일 지도 공유 그림의 노선 묶음 이름 = LineStatus.label.
// 고치기 전: market-map.js 가 묶음 이름에 ' (계획)'을 손으로 붙여 구상 노선 GTX-E·GTX-F 가 'GTX-E (계획)',
// 공사 중 GTX-B·C 는 이름만('GTX-C'). 다른 다섯 곳은 'GTX-E (구상 · 2035)' · 'GTX-C (공사 중 · 2031)'.
// 화면 타일 지도(mm-gname)는 묶음 제목이라 이름만 — 그대로. GTX-E 묶음은 '전체' 연도 + 더보기 펼침(링크 &m=1)일 때 그림에 나온다.
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('umami.disabled', '1'); } catch (e) {}
    window.__txt = [];
    const f = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { window.__txt.push(String(t)); return f.call(this, t, ...a); };
  });
});

async function cardText(page, y) {
  await page.goto('./');
  await page.waitForFunction(() => window.MarketMap && window.MarketMap.open && typeof dataReady !== 'undefined' && dataReady, null, { timeout: 30_000 });
  await page.evaluate(y => { MarketMap.close && MarketMap.close(); MarketMap.open({ color: 'gain', size: 'equal', y, group: 'line', more: true }); }, y);   // 더보기 펼침 — GTX-D~H 묶음까지 판에
  await page.waitForFunction(() => { const m = MarketMap.model(); return m && m.groups && m.groups.length > 0; }, null, { timeout: 30_000 });
  return page.evaluate(() => {
    const groups = MarketMap.model().groups.map(G => G.name);
    window.__txt = [];
    const c = MarketMap._cardCanvas();
    return { groups, ok: !!c, txt: window.__txt.slice() };
  });
}
// 묶음 이름 글자 = '이름 ... · 타일 수' (칸이 좁으면 뒤가 잘림)
const groupLine = (txt, name) => txt.find(t => t.startsWith(name + ' ') || t === name) || '';

test('[R-90] 타일 지도 공유 그림 (전체 개통): GTX-E 묶음은 (구상 · 2035) 또는 칸이 좁으면 (구상), 공사 중은 (공사 중 · 2031)/(공사 중), (계획) 글자 없음', async ({ page }) => {
  const r = await cardText(page, 'all');
  expect(r.ok).toBe(true);
  expect(r.groups, '전체 개통 묶음').toContain('GTX-E');
  const e = groupLine(r.txt, 'GTX-E');
  expect(e, 'GTX-E 묶음 글자 ' + JSON.stringify(r.txt.filter(t => t.startsWith('GTX')))).toMatch(/^GTX-E \(구상( · 2035)?\) · \d+$/);
  const c = groupLine(r.txt, 'GTX-C');
  expect(c, 'GTX-C 묶음 글자').toMatch(/^GTX-C \(공사 중( · 2031)?\) · \d+$/);
  expect(r.txt.join('\n')).not.toMatch(/GTX-[BCEF] \(계획\)/);
});

// 칸이 좁으면 ① 'GTX-E (구상 · 2035) · 9' → ② 'GTX-E (구상) · 9' → ③ 'GTX-E · 9'. 역 수는 어떤 경우에도 자르지 않는다.
// 고치기 전(글자 줄임이 뒤부터 한 글자씩): 'GTX-B (공사 중 · 2031) · 1'(실제 14), 'GTX-E (구상 · 20'.
for (const [y, more] of [['all', true], ['all', false], ['2031', true], ['2035', true]]) {
  test(`[R-90] 타일 지도 공유 그림 (${y}${more ? ' · 펼침' : ''}): 모든 묶음 역 수 = 실제, 글자 중간 잘림 0`, async ({ page }) => {
    await page.goto('./');
    await page.waitForFunction(() => window.MarketMap && window.MarketMap.open && typeof dataReady !== 'undefined' && dataReady, null, { timeout: 30_000 });
    await page.evaluate(([y, more]) => { MarketMap.close && MarketMap.close(); MarketMap.open({ color: 'gain', size: 'equal', y, group: 'line', more }); }, [y, more]);
    await page.waitForFunction(() => { const m = MarketMap.model(); return m && m.groups && m.groups.length > 0; }, null, { timeout: 30_000 });
    const r = await page.evaluate(() => {
      const groups = MarketMap.model().groups.map(G => ({ name: G.name, n: G.tiles.length }));
      window.__txt = [];
      MarketMap._cardCanvas();
      return { groups, txt: window.__txt.slice() };
    });
    expect(r.groups.length).toBeGreaterThan(0);
    const bad = [];
    for (const G of r.groups) {
      const t = r.txt.find(s => s === G.name || s.startsWith(G.name + ' ')) || '';
      const m = t.match(/^(.*) · (\d+)$/);
      if (!m) { bad.push(`${G.name}: '${t}' — 끝에 ' · 역 수' 없음`); continue; }
      if (+m[2] !== G.n) bad.push(`${G.name}: '${t}' 역 수 ${m[2]} ≠ 실제 ${G.n}`);
      // 이름 부분은 세 꼴 중 하나: 이름 / 이름 (상태 말) / 이름 (상태 말 · 연도) — 중간 잘림 없음
      const rest = m[1] === G.name ? '' : m[1].startsWith(G.name + ' (') && m[1].endsWith(')') ? m[1].slice(G.name.length + 2, -1) : null;
      if (rest === null || (rest !== '' && !/^(운행 중|공사 중|계획|구상)( · \d{4})?$/.test(rest))) bad.push(`${G.name}: '${t}' 이름 글자 잘림`);
    }
    expect(bad).toEqual([]);
  });
}

test('[R-90] 화면 타일 지도 묶음 제목(mm-gname)은 이름만', async ({ page }) => {
  await cardText(page, 'all');
  const names = await page.locator('.mm-gname').evaluateAll(els => els.map(e => e.textContent.trim()));
  expect(names.length).toBeGreaterThan(0);
  expect(names.join(' ')).not.toMatch(/\((계획|구상|공사 중)/);
});
