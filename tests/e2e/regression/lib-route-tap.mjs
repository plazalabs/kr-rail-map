// 숙제 96·97 회귀 시험 공용: 지도에서 역을 실제로 눌러(PC 클릭 · 휴대폰 탭) 말풍선을 쓴다.
import { expect } from '@playwright/test';

export const ID = { gwang: 'st-355172776', sam: 'st-6033315003', yeo: 'st-6039313670' };

export async function open(browser, w, h, { theme } = {}) {
  const mobile = w < 981;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block', locale: 'ko-KR' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !(m.location().url || '').includes('umami') && !/ERR_FAILED|ERR_NAME|tiles|arcgis|supabase|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await page.addInitScript(t => {
    localStorage.setItem('krrail-guide-seen', '1');
    localStorage.setItem('krrail-invest-tip-seen', '1');
    localStorage.setItem('krrail-seen', String(Date.now()));
    localStorage.setItem('umami.disabled', '1');
    if (t) localStorage.setItem('krrail-theme', t);
  }, theme || null);
  await page.route('https://cloud.umami.is/**', r => r.abort());
  await page.goto('./');
  await expect(page.locator('#status')).toContainText('로드됨', { timeout: 30_000 });
  return { ctx, page, errs, mobile };
}

// 지도에서 보이는(다른 화면 요소에 가리지 않은) 자리 — 'center' 면 지도 위쪽 가운데, 'left'·'right'·'bottom' 은 가장자리
export async function spot(page, where) {
  return page.evaluate(where => {
    const cv = map.getCanvas(), W = innerWidth, H = innerHeight;
    const free = (x, y) => { const e = document.elementFromPoint(x, y); return e === cv; };
    const scanX = (y, from, step) => { for (let x = from; x > 0 && x < W; x += step) if (free(x, y) && free(x + step * 16, y)) return x + step * 16; return null; };
    if (where === 'center') {
      for (let y = Math.round(H * 0.3); y < H; y += 10) if (free(W / 2, y)) return [Math.round(W / 2), y];
    }
    if (where === 'left' || where === 'right') {
      for (const y of [Math.round(H * 0.45), Math.round(H * 0.3), Math.round(H * 0.6), Math.round(H * 0.2)]) {
        const x = where === 'left' ? scanX(y, 1, 1) : scanX(y, W - 2, -1);
        if (x != null) return [x, y];
      }
    }
    if (where === 'bottom') {
      for (const x of [Math.round(W * 0.4), Math.round(W * 0.6), Math.round(W * 0.25)]) {
        for (let y = H - 2; y > H / 2; y--) if (free(x, y) && free(x, y - 16)) return [x, y - 16];
      }
    }
    return null;
  }, where);
}

// 역 id 를 지도 화면의 target 자리로 옮기고, 클릭으로 잡힐 때까지 기다린 뒤 실제로 누른다
export async function tapStation(page, id, { where = 'center', zoom = 13 } = {}) {
  const target = await spot(page, where);
  expect(target, '지도에서 누를 자리').not.toBeNull();
  const t0 = Date.now();
  let pt = null;
  while (Date.now() - t0 < 15_000) {
    pt = await page.evaluate(([id, tx, ty, zoom]) => {
      const s = STATIONS.find(f => f.properties.id === id);
      const r = map.getCanvas().getBoundingClientRect();
      let p = map.project(s.geometry.coordinates);
      if (Math.abs(map.getZoom() - zoom) > 0.01 || Math.abs(r.x + p.x - tx) > 2 || Math.abs(r.y + p.y - ty) > 2) {
        map.jumpTo({ center: s.geometry.coordinates, zoom });
        p = map.project(s.geometry.coordinates);
        map.panBy([p.x - (tx - r.x), p.y - (ty - r.y)], { duration: 0 });
        p = map.project(s.geometry.coordinates);
      }
      const hit = map.queryRenderedFeatures([[p.x - 18, p.y - 18], [p.x + 18, p.y + 18]], { layers: ['rail-stations'] });
      return { x: r.x + p.x, y: r.y + p.y, first: hit.length ? hit[0].properties.id : null };
    }, [id, target[0], target[1], zoom]);
    if (pt.first === id) break;
    await page.waitForTimeout(150);
  }
  expect(pt.first, '역이 클릭으로 잡힘').toBe(id);
  const mobile = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  if (mobile) await page.touchscreen.tap(pt.x, pt.y); else await page.mouse.click(pt.x, pt.y);
  return pt;
}

export const popup = page => page.locator('.st-popup');
export async function pick(page, name) {
  const b = popup(page).getByRole('button', { name, exact: true });
  await expect(b).toBeVisible();
  await b.click();
}

export const fields = page => page.evaluate(() => ({ from: document.getElementById('route-from').value, to: document.getElementById('route-to').value }));

export async function waitRoute(page) {
  await expect.poll(() => page.evaluate(() => !!map.getLayer('route-casing')), { timeout: 30_000 }).toBe(true);
}
