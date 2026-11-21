// 회귀(숙제 81): GTX 입구 gtx.html — 입력 하나 → 카드 하나. 숫자는 data/gtx-card.json 그대로.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.env.KR_RAIL_ROOT || process.cwd();
const D = JSON.parse(readFileSync(join(ROOT, 'data/gtx-card.json'), 'utf8'));
const BANNED = ['떡상', '계단', '때문에', '오를', '사세요', '매수', '매도', '투자 추천'];
// 데이터에서 고른 역 (11-21 자료): 판단 보류 = 보산(동 거래 10건 미만), 시세 자료 없음 = 한성대입구
const HOLD = '보산', NONE = '한성대입구';

async function open(page, errs) {
  page.on('pageerror', e => errs.push(String(e)));
  // umami 는 시험에서 막는다(배포본 통계 오염 방지) — 그 요청 실패 글은 오류로 안 센다
  page.on('console', m => { if (m.type() === 'error' && !(m.location().url || '').includes('umami') && !/ERR_FAILED/.test(m.text())) errs.push(m.text()); });
  page.on('requestfailed', r => { if (!r.url().includes('umami')) errs.push('요청 실패 ' + r.url()); });
  await page.addInitScript(() => {
    localStorage.setItem('umami.disabled', '1');
    window.__ev = []; window.umami = { track: (n, d) => window.__ev.push([n, d]) };
  });
  await page.route('https://cloud.umami.is/**', r => r.abort());
  await page.goto('./gtx.html');
  await expect(page.locator('body[data-ready="1"]')).toHaveCount(1, { timeout: 15_000 });
}
const search = async (page, q) => { await page.locator('#q').fill(q); await page.locator('#q').press('Enter'); };

test('[R-81] 의정부 입력 → 큰 숫자·칩 두 개·면책, 금지어 없음, 콘솔 오류 0', async ({ page }) => {
  const errs = [];
  await open(page, errs);
  await search(page, '의정부');
  const card = page.locator('#card');
  await expect(card).toBeVisible();
  const x = D.s['st-7777463060'], d = D.dest[x.d];
  await expect(card.locator('.big-main')).toHaveText(`${d.name} ${x.aft[x.d]}분컷`);
  await expect(card.locator('.chip.acc')).toContainText('접근성 크게 개선');
  await expect(card.locator('.chip.mk')).toHaveCount(1);
  await expect(card).toContainText('접근성 순위와 시세는 다른 지표 · 집값 예측 아님');
  const text = await card.innerText();
  expect(BANNED.filter(w => text.includes(w))).toEqual([]);
  expect(errs).toEqual([]);
});

test('[R-81] 시세 칩: 판단 보류 역·자료 없는 역 글자', async ({ page }) => {
  await open(page, []);
  await search(page, HOLD);
  await expect(page.locator('#card .chip.mk')).toContainText('판단 보류');
  await page.locator('#card .chip.mk').click();
  await expect(page.locator('#card .chip-note')).toContainText('거래가 적어 비교하지 않아요');
  await search(page, NONE);
  await expect(page.locator('#card .chip.mk')).toContainText('시세 자료 없음');
  await page.locator('#card .chip.mk').click();
  await expect(page.locator('#card .chip-note')).toContainText('실거래 자료가 없어요');
});

test('[R-81] TOP3 누르면 그 역 카드', async ({ page }) => {
  const top = JSON.parse(readFileSync(join(ROOT, 'data/rank-top.json'), 'utf8')).top;
  await open(page, []);
  await page.locator('#top3-list button').nth(1).click();
  await expect(page.locator('#card')).toHaveAttribute('data-st', top[1].id);
  await expect(page.locator('#card .st')).toContainText(top[1].n);
});

test('[R-81] 공유 단추 → share_card 이벤트 1회 (card-gtx)', async ({ page }) => {
  await open(page, []);
  await search(page, '의정부');
  const dl = page.waitForEvent('download').catch(() => null);
  await page.locator('#card .actions .primary').click();
  await dl;
  await expect.poll(() => page.evaluate(() => window.__ev.filter(e => e[0] === 'share_card').length)).toBe(1);
  expect(await page.evaluate(() => window.__ev.find(e => e[0] === 'share_card')[1])).toEqual({ 종류: 'card-gtx' });
});

test('[R-81] 자세히 보기: 전세가율이 없으면 0% 가 아니라 비율 없음 (보산 j=[null,1])', async ({ page }) => {
  await open(page, []);
  await search(page, HOLD);
  await page.locator('#card details summary').click();
  const det = await page.locator('#card details').innerText();
  expect(det).not.toContain('0%');
  expect(det).toContain('비율 없음 (짝 3개 미만)');
});

test('[R-81] 자세히 보기: 중위 평당가는 시세 라벨과 같은 반기(전용면적 기준) · 계산 방법 링크는 data.html 절', async ({ page }) => {
  await open(page, []);
  await search(page, '의정부');
  await page.locator('#card details summary').click();
  const k = D.k[D.s['st-7777463060'].k];
  await expect(page.locator('#card details')).toContainText('중위 평당가 ' + k.pp.toLocaleString('ko-KR') + '만 원 (전용면적 기준, 2026 상반기)');
  await expect(page.locator('#card details a', { hasText: '계산 방법' })).toHaveAttribute('href', 'data.html#gtx-card');
});

// 회귀(숙제 84): 몇분컷 — 큰 줄 '{업무지구} N분컷'(같음은 '컷' 없음), 작은 줄 '지금 N분 · …', 휴대폰에서 큰 줄 한 줄
const SAME = 'st-355172808', NEW = 'st-dongbuk-1', LONG = 'st-355172769';   // 오류동(같음) · 동명초교(가칭)(새로 생김) · 회기(가장 긴 큰 줄)
const openSt = async (page, id) => { await open(page, []); await page.goto('./gtx.html?st=' + id); await expect(page.locator('#card[data-st="' + id + '"]')).toBeVisible(); };

test('[R-84] 줄어듦: 의정부 큰 줄 = 업무지구 N분컷, 작은 줄 = 지금 N분 · 라벨 · 개통 가정', async ({ page }) => {
  const id = 'st-7777463060', x = D.s[id], d = D.dest[x.d];
  await openSt(page, id);
  await expect(page.locator('#card .big-main')).toHaveText(`${d.name} ${x.aft[x.d]}분컷`);
  await expect(page.locator('#card .big small')).toHaveText(`지금 ${x.now[x.d]}분 · ${d.label} · ${D.year}년까지 개통 가정`);
});

test('[R-84] 같음: 컷 없음 · 개통 후에도 같음', async ({ page }) => {
  const x = D.s[SAME], d = D.dest[x.d];
  expect(x.kd).toBe('same');
  await openSt(page, SAME);
  await expect(page.locator('#card .big-main')).toHaveText(`${d.name} ${x.now[x.d]}분`);
  expect(await page.locator('#card .big').innerText()).not.toContain('컷');
  await expect(page.locator('#card .big small')).toHaveText(`개통 후에도 같음 · ${d.label} · ${D.year}년까지 개통 가정`);
});

test('[R-84] 새로 생김: 업무지구 N분컷 · 지금은 철도로 못 감', async ({ page }) => {
  const x = D.s[NEW], d = D.dest[x.d];
  expect(x.kd).toBe('new');
  await openSt(page, NEW);
  await expect(page.locator('#card .big-main')).toHaveText(`${d.name} ${x.aft[x.d]}분컷`);
  await expect(page.locator('#card .big small')).toHaveText(`지금은 철도로 못 감 · ${d.label} · ${D.year}년까지 개통 가정`);
});

for (const w of [360, 390]) {
  test(`[R-84] ${w}px: 큰 줄이 한 줄 (가장 긴 조합 회기·의정부)`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 800 });
    for (const id of [LONG, 'st-7777463060']) {
      await openSt(page, id);
      const m = await page.locator('#card .big-main').evaluate(e => { const cs = getComputedStyle(e); return { h: e.getBoundingClientRect().height, lh: parseFloat(cs.lineHeight), sw: e.scrollWidth, cw: e.clientWidth }; });
      expect(m.h).toBeLessThanOrEqual(m.lh * 1.2);
      expect(m.sw).toBeLessThanOrEqual(m.cw + 1);
    }
  });
}

test('[R-84] gtx.html 제목·og·twitter 에 GTX 없음, 몇분컷 있음 · 공유 그림 이름 줄', async ({ page }) => {
  const html = readFileSync(join(ROOT, 'gtx.html'), 'utf8');
  const tags = [/<title>([^<]*)<\/title>/, /property="og:title" content="([^"]*)"/, /property="og:image:alt" content="([^"]*)"/, /name="twitter:title" content="([^"]*)"/]
    .map(r => (r.exec(html) || [, ''])[1]);
  for (const t of tags) { expect(t).not.toContain('GTX'); }
  expect(tags[0]).toContain('몇분컷');
  expect(tags[1]).toContain('몇분컷');
  expect((/<h1>([^<]*)<\/h1>/.exec(html) || [, ''])[1]).not.toContain('GTX');
  await openSt(page, 'st-7777463060');
  await expect(page).toHaveTitle(/몇분컷/);
  const src = readFileSync(join(ROOT, 'js/gtx-page.js'), 'utf8');
  expect(src).toContain("'몇분컷 · 한국철도맵 · plazalabs.github.io/kr-rail-map/gtx.html'");
});
