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

// 숙제 92: 길찾기 중에는 지도 원래 역 이름(station-labels)을 경로 밖까지 전부 숨긴다. 경로 역 이름은 번호 이름표가 맡는다.
const outLabels = page => page.evaluate(() => {
  const path = new Set(lastRoute ? lastRoute.path : []);
  const op = map.getPaintProperty('station-labels', 'text-opacity');
  const f = op === 0 ? [] : map.queryRenderedFeatures({ layers: ['station-labels'] }).map(x => x.properties.id);
  return { op, out: f.filter(id => !path.has(id)).length, on: f.filter(id => path.has(id)).length };
});
const idle = page => page.evaluate(() => new Promise(r => { map.once('idle', r); setTimeout(r, 4000); }));
const setBase = async (page, mode) => {
  await page.evaluate(m => document.querySelector('#toolbar [data-style="' + m + '"]').click(), mode);
  await expect.poll(() => page.evaluate(() => !!map.getLayer('station-labels') && map.isStyleLoaded()), { timeout: 20_000 }).toBe(true);
  await idle(page);
};

test('[R-80] 경로 밖 역 이름은 길찾기 중 안 보임 · 닫으면 다시 보임 · 배경을 바꿔도 같음', async ({ page }) => {
  test.setTimeout(120_000);   // 배경 두 번 바꿈(스타일 전체 교체)
  await boot(page);
  await route(page, ['인천', 'seoul-metropolitan-subway-line-1'], ['의정부', 'seoul-metropolitan-subway-line-1'], false);
  await page.evaluate(() => map.jumpTo({ center: [126.99, 37.56], zoom: 12.5 }));
  await idle(page);
  let st = await outLabels(page);
  expect(st.out, '길찾기 중 경로 밖 역 이름').toBe(0);
  expect(st.on, '경로 역은 원래 이름 글자 없음(이름표가 맡음)').toBe(0);
  // 길찾기 중 배경을 바꿔도(스타일 교체 → 경로 다시 그림) 경로 밖 역 이름은 안 보임
  await setBase(page, 'gray');
  await page.evaluate(() => map.jumpTo({ center: [126.99, 37.56], zoom: 12.5 }));
  await idle(page);
  st = await outLabels(page);
  expect(st.out, '배경 바꾼 뒤 길찾기 중 경로 밖 역 이름').toBe(0);
  await page.evaluate(() => document.getElementById('route-close').click());
  await idle(page);
  const back = await page.evaluate(() => ({ op: map.getPaintProperty('station-labels', 'text-opacity'), route: !!map.getLayer('route-casing'),
    n: map.queryRenderedFeatures({ layers: ['station-labels'] }).length,
    was: map.queryRenderedFeatures({ layers: ['station-labels'] }).filter(x => ['시청', '서울', '종각'].includes(x.properties.name_ko)).length }));
  expect(back.route).toBe(false);
  expect(back.op).toBe(1);
  expect(back.n, '닫으면 역 이름이 다시 보임').toBeGreaterThan(10);
  expect(back.was, '닫으면 경로였던 역 이름도 다시 보임').toBeGreaterThan(0);
  // 닫은 뒤 배경을 바꿔도 원래대로
  await setBase(page, 'normal');
  await page.evaluate(() => map.jumpTo({ center: [126.99, 37.56], zoom: 12.5 }));
  await idle(page);
  const back2 = await page.evaluate(() => ({ op: map.getPaintProperty('station-labels', 'text-opacity'), n: map.queryRenderedFeatures({ layers: ['station-labels'] }).length }));
  expect(back2.op, '글자를 끈 채로 두지 않음(배경 바꾸면 기본값 undefined = 1)').not.toBe(0);
  expect(back2.n, '닫고 배경 바꾼 뒤에도 역 이름 보임').toBeGreaterThan(10);
});

test('[R-92] 광운대→수서(개통 예정 포함): 경로 밖 역 이름 0개, ①광운대 ②청량리 ③왕십리 ④삼성 ⑤수서 이름표는 줌 10·12·14 에서 다 보이고 안 잘림', async ({ page }) => {
  test.setTimeout(300_000);   // 줌 3단계 × 역 5곳, 걸음마다 타일을 다 받을 때까지 기다림
  await page.setViewportSize({ width: 1440, height: 900 });
  await boot(page);
  await route(page, ['광운대'], ['수서'], true);
  const names = await page.evaluate(() => lastRoute.path.map(id => STATIONS.find(s => s.properties.id === id).properties.name_ko));
  expect(names).toEqual(['광운대', '청량리', '왕십리', '삼성', '수서']);
  for (const z of [10, 12, 14]) {
    for (const [i, nm] of names.entries()) {
      await page.evaluate(([i, z]) => { const s = STATIONS.find(x => x.properties.id === lastRoute.path[i]); map.jumpTo({ center: s.geometry.coordinates, zoom: z }); }, [i, z]);
      await idle(page);
      await page.waitForTimeout(300);
      const st = await outLabels(page);
      expect(st.out, `줌 ${z} (${nm} 가운데) 경로 밖 역 이름`).toBe(0);
      const chip = await page.evaluate(i => {
        const mr = map.getContainer().getBoundingClientRect();
        const el = document.querySelector('.rt-label[data-sid="' + lastRoute.path[i] + '"]');
        if (!el) return null;
        const r = el.getBoundingClientRect(), cs = getComputedStyle(el), t = el.lastChild, tr = t.getBoundingClientRect();
        return { n: el.firstChild.textContent, text: t.textContent,
          shown: cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.05 && r.width > 0,
          inside: r.left >= mr.left && r.right <= mr.right && r.top >= mr.top && r.bottom <= mr.bottom,
          clipped: tr.right > r.right + 0.5 || tr.left < r.left - 0.5 || t.scrollWidth > Math.ceil(tr.width) + 1 };
      }, i);
      expect(chip, `줌 ${z} ${nm} 이름표`).toMatchObject({ n: String(i + 1), text: nm, shown: true, inside: true, clipped: false });
    }
  }
  });
