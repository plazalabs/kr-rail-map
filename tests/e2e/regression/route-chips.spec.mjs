// 회귀(숙제 80): 길찾기 중간 역 이름표가 줌 숫자 하나로 일괄 숨겨지던 것.
// 광운대→삼성(개통 예정 포함, 출근)은 결과가 뜨자마자 ②③ 이 사라져 번호가 1→4 로 건너뛰었다.
// 규칙: 출발·도착·환승 이름표는 항상 보이고, 나머지는 화면에서 실제로 겹칠 때만 숨긴다.
import { test, expect } from '@playwright/test';

async function boot(page) {
  await page.addInitScript(() => {
    localStorage.setItem('krrail-guide-seen', '1');
    localStorage.setItem('krrail-invest-tip-seen', '1');
    localStorage.setItem('krrail-seen', String(Date.now()));
    localStorage.setItem('umami.disabled', '1');
  });
  await page.goto('./');
  await expect(page.locator('#status')).toContainText('로드됨', { timeout: 20_000 });
}

async function route(page, from, to, unopened) {
  await page.evaluate(([from, to, unopened]) => {
    const S = ([n, l]) => STATIONS.find(s => s.properties.name_ko === n && (!l || s.properties.lines.includes(l)));
    document.getElementById('route-panel').hidden = false;
    const u = document.getElementById('route-unopened'); if (u.checked !== unopened) u.click();
    setRouteStation(document.getElementById('route-from'), S(from));
    setRouteStation(document.getElementById('route-to'), S(to));
    document.getElementById('route-go').click();
  }, [from, to, unopened]);
  await expect.poll(() => page.evaluate(() => !!map.getLayer('route-casing')), { timeout: 30_000 }).toBe(true);
  await page.evaluate(() => new Promise(r => { if (!map.isMoving()) setTimeout(r, 50); map.once('idle', () => r()); setTimeout(r, 4000); }));
  await page.waitForTimeout(400);
}

// 보이는 이름표: display 와 visibility, 그리고 지도 화면 안
const chips = page => page.evaluate(() => {
  const mr = map.getContainer().getBoundingClientRect();
  return [...document.querySelectorAll('.rt-label')].map(el => {
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    const shown = cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.05 && r.width > 0
      && r.right > mr.left && r.left < mr.right && r.bottom > mr.top && r.top < mr.bottom;
    return { n: +el.firstChild.textContent, name: el.lastChild.textContent, key: el.classList.contains('is-key'), shown,
      box: { l: r.left, t: r.top, r: r.right, b: r.bottom } };
  });
});
const hit = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

for (const vp of [{ name: '데스크톱', width: 1440, height: 900 }, { name: '휴대폰', width: 390, height: 844 }]) {
  test(`[R-80] 광운대→삼성(개통 예정 포함) 결과 직후 이름표 전부 보임 · ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await boot(page);
    await route(page, ['광운대'], ['삼성', 'seoul-subway-line-2'], true);
    const c = await chips(page);
    expect(c.length, JSON.stringify(c.map(x => x.name))).toBeGreaterThanOrEqual(3);
    expect(c.length).toBeLessThanOrEqual(8);   // 짧은 경로 시험이 맞는지(긴 경로로 바뀌면 이 시험 뜻이 달라짐)
    const hidden = c.filter(x => !x.shown).map(x => x.n + ' ' + x.name);
    expect(hidden, '숨은 이름표').toEqual([]);
  });
}

test('[R-80] 긴 경로(20역 이상) 줌 10: 보이는 이름표끼리 안 겹침, 출발·도착·환승은 어느 줌에서도 보임', async ({ page }) => {
  await boot(page);
  await route(page, ['인천', 'seoul-metropolitan-subway-line-1'], ['의정부', 'seoul-metropolitan-subway-line-1'], false);
  const all = await chips(page);
  expect(all.length).toBeGreaterThanOrEqual(20);
  for (const z of [9, 10, 11, 12, 13, 14]) {
    // 경로 가운데를 보며 줌을 바꾼다 — 이동이 끝나면 다시 계산해야 함
    await page.evaluate(z => { const b = lastRouteFit.bounds; map.jumpTo({ center: b.getCenter(), zoom: z }); }, z);
    await page.waitForTimeout(500);
    const c = await chips(page);
    const vis = c.filter(x => x.shown);
    if (z === 10) {
      expect(vis.length, '줌 10 에서도 이름표가 몇 개는 보임').toBeGreaterThan(c.filter(x => x.key).length);
      expect(vis.length, '줌 10 에서 긴 경로 칩이 다 뜨면 지도를 덮음').toBeLessThan(c.length);
    }
    const overlaps = [];
    for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
      if ((!vis[i].key || !vis[j].key) && hit(vis[i].box, vis[j].box)) overlaps.push(vis[i].name + '×' + vis[j].name);
    }
    expect(overlaps, `줌 ${z} 겹침`).toEqual([]);
    // 출발·도착·환승: 화면 안에 있는 것은 모두 보임 (display 로 숨기지 않음)
    const keyHidden = await page.evaluate(() => [...document.querySelectorAll('.rt-label.is-key')]
      .filter(el => getComputedStyle(el).display === 'none' || getComputedStyle(el).visibility === 'hidden').map(el => el.lastChild.textContent));
    expect(keyHidden, `줌 ${z} 숨은 핵심 이름표`).toEqual([]);
  }
});

test('[R-80] 경로 밖 역 이름은 길찾기 중에도 보임, 경로 역은 원래 이름 글자 대신 이름표 · 닫으면 원래대로', async ({ page }) => {
  await boot(page);
  await route(page, ['인천', 'seoul-metropolitan-subway-line-1'], ['의정부', 'seoul-metropolitan-subway-line-1'], false);
  await page.evaluate(() => map.jumpTo({ center: [126.99, 37.56], zoom: 12.5 }));
  await page.evaluate(() => new Promise(r => { map.once('idle', r); setTimeout(r, 4000); }));
  const st = await page.evaluate(() => {
    const path = new Set(lastRoute.path);
    const f = map.queryRenderedFeatures({ layers: ['station-labels'] }).map(x => x.properties.id);
    return { op: map.getPaintProperty('station-labels', 'text-opacity'), out: f.filter(id => !path.has(id)).length, on: f.filter(id => path.has(id)).length };
  });
  expect(st.op, '원래 역 이름 레이어를 통째로 끄지 않음').not.toBe(0);
  expect(st.out, '경로 밖 역 이름이 보임').toBeGreaterThan(0);
  expect(st.on, '경로 역은 원래 이름 글자 없음(선 아래라 잘림)').toBe(0);
  await page.evaluate(() => document.getElementById('route-close').click());
  await page.evaluate(() => new Promise(r => { map.once('idle', r); setTimeout(r, 4000); }));
  const back = await page.evaluate(() => ({ op: map.getPaintProperty('station-labels', 'text-opacity'), route: !!map.getLayer('route-casing'),
    n: map.queryRenderedFeatures({ layers: ['station-labels'] }).filter(x => ['시청', '서울', '종각'].includes(x.properties.name_ko)).length }));
  expect(back.route).toBe(false);
  expect(back.op).toBe(1);
  expect(back.n, '닫으면 경로였던 역 이름도 다시 보임').toBeGreaterThan(0);
});
