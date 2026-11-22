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

// 숙제 99: 지도에서 광운대 [출발] → 삼성 [도착]으로 경로를 만든다
export async function routeGwangSam(page) {
  // 1024px 는 툴바가 두 줄이라 지도 위쪽 가운데에서 연 말풍선이 길찾기 패널 밑에 깔린다(TODO 100) — 경로는 아래쪽에서 눌러 만든다
  const where = (await page.evaluate(() => innerWidth)) === 1024 ? 'bottom' : 'center';
  await tapStation(page, ID.gwang, { where });
  await pick(page, '출발');
  await tapStation(page, ID.sam, { where });
  await pick(page, '도착');
  await waitRoute(page);
  // 휴대폰은 경로를 그린 뒤 0.45·1초에 경로로 다시 맞춘다(refitLastRoute) — 그 뒤에 사람이 지도를 움직인다
  await page.waitForTimeout(1500);
}

// 역을 지도에서 가리지 않는 자리로 옮기고(사람이 지도를 끌어 그쪽을 보는 것) 화면 좌표를 돌려준다.
// tapStation 과 달리 '그 역이 첫 번째로 잡힐 때까지' 기다리지 않는다 — 사람처럼 그 자리를 그대로 누르게.
export async function bringIntoView(page, id, zoom) {
  const target = await spot(page, 'center');
  expect(target, '지도에서 보이는 자리').not.toBeNull();
  return page.evaluate(([id, tx, ty, zoom]) => new Promise(res => {
    const s = STATIONS.find(f => f.properties.id === id);
    const r = map.getCanvas().getBoundingClientRect();
    map.jumpTo({ center: s.geometry.coordinates, zoom });
    const p = map.project(s.geometry.coordinates);
    map.panBy([p.x - (tx - r.x), p.y - (ty - r.y)], { duration: 0 });
    map.once('idle', () => { const q = map.project(s.geometry.coordinates); res({ x: r.x + q.x, y: r.y + q.y }); });
  }), [id, target[0], target[1], zoom]);
}

// 숙제 99·101: 화면 좌표 pt 자리에 역 점이 그려져 있는지 — 역 점 레이어를 껐을 때·켰을 때·다시 껐을 때 그 자리를 찍어 비교한다.
// 두 번 끈 화면이 같을 때(타일 등이 다 그려진 뒤)만 판정한다. 판정 못 하면 null.
const setStationsVisible = (page, on) => page.evaluate(on => new Promise(res => {
  map.setLayoutProperty('rail-stations', 'visibility', on ? 'visible' : 'none');
  map.once('idle', res);
  map.triggerRepaint();
}), on);
export async function dotSeen(page, pt) {
  const clip = { x: Math.round(pt.x) - 6, y: Math.round(pt.y) - 6, width: 12, height: 12 };
  for (let i = 0; i < 6; i++) {
    await setStationsVisible(page, false);
    const off1 = await page.screenshot({ clip });
    await setStationsVisible(page, true);
    const on = await page.screenshot({ clip });
    await setStationsVisible(page, false);
    const off2 = await page.screenshot({ clip });
    await setStationsVisible(page, true);
    if (off1.equals(off2)) return !on.equals(off1);
    await page.waitForTimeout(500);
  }
  return null;
}
