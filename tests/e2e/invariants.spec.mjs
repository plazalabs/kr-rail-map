// 한국철도맵 화면 불변식 테스트 (Playwright)
// 실행: npx playwright test            (로컬 서버, playwright.config.mjs 의 webServer)
//       BASE_URL=https://plazalabs.github.io/kr-rail-map/ npx playwright test   (배포본 검사)
//
// 2026-11-16 검수에서 사람이 손으로 확인한 것을 그대로 옮겼다. [E-xx] 는 docs/INVARIANTS.md 번호.
// 주의: 이 파일은 검수 때 본 DOM(id·버튼 이름)을 기준으로 쓴 초안이다. 아직 한 번도 실행하지 않았다.
//       처음 실행에서 "선택자를 못 찾음" 실패가 나오면 앱이 아니라 테스트를 고쳐라. "값이 다름" 실패만 앱 버그다.

import { test, expect } from '@playwright/test';

// ─────────────── 공통 도우미 ───────────────

const num = s => Number(String(s).replace(/,/g, ''));
const minutes = (h, m) => (h ? Number(h) * 60 : 0) + Number(m);

/** 첫 방문 안내 카드·투자 팁이 테스트를 가리지 않게 한다. firstVisit=true 면 아무것도 안 넣는다. */
async function boot(page, { firstVisit = false, invest = false } = {}) {
  if (!firstVisit) {
    await page.addInitScript(({ invest }) => {
      localStorage.setItem('krrail-guide-seen', '1');
      localStorage.setItem('krrail-invest-tip-seen', '1');
      localStorage.setItem('krrail-seen', String(Date.now()));
      if (invest) localStorage.setItem('krrail-mode', 'invest');
    }, { invest });
  }
  await page.goto('./');
  await expect(page.locator('#status')).toContainText('로드됨', { timeout: 20_000 });
}

async function search(page, q) {
  const box = page.getByRole('combobox', { name: '역 검색' });
  await box.click();
  await box.fill(q);
  await expect(page.locator('#search-results')).toBeVisible();
}

async function openStation(page, q) {
  await search(page, q);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const sd = page.locator('#sd-panel');
  await expect(sd).toBeVisible();
  return sd;
}

async function tabText(sd, name) {
  await sd.getByRole('tab', { name }).click();
  await sd.page().waitForTimeout(800);
  return sd.innerText();
}

async function openAnalysis(page, item) {
  await page.getByRole('toolbar', { name: '지도 도구' }).getByRole('button', { name: '분석' }).click();
  await page.locator('.tb-dropdown.open').getByText(item, { exact: false }).first().click();
}

/** 길찾기 실행 → { time, transfers, fare, text } (현재 선택된 탭 기준) */
function parseRoute(text) {
  const t = text.match(/총 약 (?:(\d+)시간 ?)?(\d+)분/);
  const x = text.match(/총 약[^\n]*?환승 (\d+)회/);
  const f = text.match(/예상 요금 ([\d,]+)원/);
  return { time: t ? minutes(t[1], t[2]) : NaN, transfers: x ? Number(x[1]) : NaN, fare: f ? num(f[1]) : NaN, text };
}

async function runRoute(page, from, to, { unopened = false } = {}) {
  if (!(await page.locator('#route-panel').isVisible())) {
    await page.getByRole('navigation', { name: '주요 메뉴' }).getByRole('button', { name: '길찾기' }).click();
  }
  for (const [sel, v] of [['#route-from', from], ['#route-to', to]]) {
    const el = page.locator(sel);
    await el.fill('');
    await el.fill(v);
    await page.waitForTimeout(400);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
  }
  const cb = page.locator('#route-unopened');
  if ((await cb.isChecked()) !== unopened) await cb.click();
  await page.locator('#route-go').click();
  await expect(page.locator('#route-result')).toContainText('총 약');
}

async function routeTab(page, tab) {
  await page.locator('#route-panel').getByRole('button', { name: new RegExp('^\\s*' + tab) }).first().click();
  await page.waitForTimeout(500);
  return parseRoute(await page.locator('#route-result').innerText());
}

/** 역 상세 표에서 "GBD 강남(…) 40분 9분" 의 지금 값 */
function detailNow(text, label) {
  const re = new RegExp(label + '[^\\n]*?\\)\\s+(?:(\\d+)시간 ?)?(\\d+)분');
  const m = text.match(re);
  return m ? minutes(m[1], m[2]) : NaN;
}

// ─────────────── 1. 숫자 일관성 ───────────────

test.describe('숫자 일관성', () => {
  test('[E-01] 역 총수: 헤더 = 상태줄 = 철도망 통계 = 역 상세 각주', async ({ page }) => {
    await boot(page);
    const header = num((await page.locator('#sidebar').innerText()).match(/역 ([\d,]+)개/)[1]);
    const status = num((await page.locator('#status').innerText()).match(/역 ([\d,]+)개/)[1]);
    await openAnalysis(page, '철도망 통계');
    const stats = num((await page.locator('#rs-panel').innerText()).match(/([\d,]+)\s*\n\s*역 수/)[1]);
    await page.keyboard.press('Escape');
    const sd = await openStation(page, '강남');
    const foot = num((await tabText(sd, '교통')).match(/전국 ([\d,]+)역 가운데/)[1]);
    // 검수 때: 1,249 / 1,249 / 1,208 / 1,237
    expect({ header, status, stats, foot }).toEqual({ header, status: header, stats: header, foot: header });
  });

  test('[E-02] 수도권 역 수와 시나리오: 홈 카드 = 랭킹(같은 연도) = 타일 지도 기본값', async ({ page }) => {
    await boot(page);
    const home = await page.locator('#home-cards').innerText();
    const homeN = num(home.match(/수도권 ([\d,]+)역/)[1]);
    const homeYear = home.match(/(20\d\d)년까지 개통 가정/)[1];
    await page.getByRole('button', { name: /GTX 역 타일로 한눈에 보기/ }).click();
    const tile = await page.locator('#mm-panel').innerText();
    const tileN = num(tile.match(/수도권 ([\d,]+)역/)[1]);
    // 검수 때: 홈 675(2031 가정) / 타일 696(전체 개통 가정). 같은 화면군은 같은 시나리오여야 한다.
    expect(tileN, `타일 지도는 ${tileN}역, 홈 카드는 ${homeYear}년 가정 ${homeN}역`).toBe(homeN);
  });

  test('[E-03] 의정부 순위: 홈 카드 = 랭킹 패널 = 타일 지도', async ({ page }) => {
    await boot(page);
    const home = (await page.locator('#home-cards').innerText()).match(/의정부[\s\S]*?(\d+)위→(\d+)위/);
    await page.getByRole('navigation', { name: '주요 메뉴' }).getByRole('button', { name: '개통효과' }).click();
    const rp = page.locator('#rocket-panel');
    if (!(await rp.isVisible())) await page.getByRole('navigation', { name: '주요 메뉴' }).getByRole('button', { name: '개통효과' }).click();
    await rp.getByRole('button', { name: '2031년까지 개통' }).click();
    const rank = (await rp.innerText()).match(/의정부\s+GTX-C · 2031\s+▲\d+위\s+(\d+) → (\d+)위/);
    await rp.getByRole('button', { name: '떡상 패널 닫기' }).click();
    await page.getByRole('button', { name: /GTX 역 타일로 한눈에 보기/ }).click();
    await page.locator('#mm-panel').getByText('의정부', { exact: true }).click();
    const tile = (await page.locator('#mm-panel').innerText()).match(/순위 (\d+)위 → (\d+)위/);
    // 검수 때: 448→117 / 448→117 / 448→125
    expect([rank[1], rank[2]]).toEqual([home[1], home[2]]);
    expect([tile[1], tile[2]], '타일 지도의 의정부 순위').toEqual([home[1], home[2]]);
  });

  test('[E-04] 서울역: 시세 탭과 개발 탭의 법정동이 같다', async ({ page }) => {
    await boot(page, { invest: true });
    const sd = await openStation(page, '서울역');
    const priceDong = (await tabText(sd, '시세')).match(/법정동 실거래 · (\S+) ·/)[1];
    const devText = await tabText(sd, '개발');
    const devDong = (devText.match(/[가-힣]+[구시군] ([가-힣0-9]+(?:동|가|읍|면|리)):/) || devText.match(/법정동\([^ )]+ ([^)]+)\)/))[1];
    // 검수 때: 동자동 / 남대문로5가
    expect(devDong).toBe(priceDong);
  });

  test('[E-05] 신사역 시세는 강남구 신사동이다', async ({ page }) => {
    await boot(page, { invest: true });
    const sd = await openStation(page, '신사');
    const t = await tabText(sd, '시세');
    // 검수 때: "법정동 실거래 · 신사동 · 서울 은평구"
    expect(t).toMatch(/법정동 실거래 · 신사동 · 서울 강남구/);
  });

  test('[E-06] 역 상세 "길찾기와 같은 기준" 시간 = 실제 길찾기 시간', async ({ page }) => {
    await boot(page);
    const cases = [
      { st: '서울역', label: 'GBD 강남', from: '서울역', to: '강남' },   // 검수 때 30 vs 31
      { st: '광운대', label: 'GBD 강남', from: '광운대', to: '선릉' },   // 검수 때 40 vs 45 (상세가 "지금 선릉역" 기준이라고 밝힘)
    ];
    for (const c of cases) {
      const sd = await openStation(page, c.st);
      const d = detailNow(await tabText(sd, '교통'), c.label);
      await sd.getByRole('button', { name: '닫기' }).click();
      await runRoute(page, c.from, c.to);
      const r = await routeTab(page, '최적');
      expect(r.time, `${c.st} 상세 ${d}분 vs 길찾기 ${r.time}분`).toBe(d);
    }
  });

  test('[E-07] 상태줄 요약 = 길찾기 패널 결과 (배차 넣기 켬)', async ({ page }) => {
    await boot(page);
    await page.getByRole('navigation', { name: '주요 메뉴' }).getByRole('button', { name: '길찾기' }).click();
    await page.locator('#route-band').selectOption({ index: 1 });
    if (!(await page.locator('#route-peak').isChecked())) await page.locator('#route-peak').click();
    await runRoute(page, '광운대', '강남');
    const panel = await routeTab(page, '최적');
    const status = (await page.locator('#status').innerText()).match(/약 (\d+)분/)[1];
    // 검수 때: 패널 50분(처음 기다림 3분 포함) / 상태줄 47분
    expect(Number(status)).toBe(panel.time);
  });
});

// ─────────────── 2. 길찾기 ───────────────

test.describe('길찾기', () => {
  for (const [from, to] of [['광운대', '강남'], ['서울역', '강남']]) {
    test(`[E-10] 같은 조건 2회 실행 결과가 같다: ${from}→${to}`, async ({ page }) => {
      await boot(page);
      await runRoute(page, from, to);
      const a = await page.locator('#route-result').innerText();
      await runRoute(page, from, to);
      const b = await page.locator('#route-result').innerText();
      expect(b).toBe(a);
    });

    test(`[E-11] '최적'은 다른 탭에 시간·환승·요금 모두 밀리지 않는다: ${from}→${to}`, async ({ page }) => {
      await boot(page);
      await runRoute(page, from, to);
      const best = await routeTab(page, '최적');
      for (const tab of ['최소환승', '최소요금']) {
        const o = await routeTab(page, tab);
        const dominated = o.time <= best.time && o.transfers <= best.transfers && o.fare <= best.fare &&
          (o.time < best.time || o.transfers < best.transfers || o.fare < best.fare);
        // 검수 때 광운대→강남: 최적 56분·2회·2,550원 vs 최소환승 55분·1회·1,950원
        expect(dominated, `${tab}(${o.time}분·${o.transfers}회·${o.fare}원)이 최적(${best.time}분·${best.transfers}회·${best.fare}원)보다 모든 면에서 낫다`).toBe(false);
      }
    });
  }

  test('[E-12] 최소환승은 환승 수가 같거나 적은 최적 길보다 느리지 않고, 이웃 역 하나로 크게 바뀌지 않는다 (청량리 수인분당 대기 버그)', async ({ page }) => {
    await boot(page);
    // 기준 1: 최적 길이 환승 수가 같거나 적은데 더 빠르면, 최소환승 탭이 그 길을 놓친 것
    // 검수 때: 최소환승이 승차 분만 견주어 60분 기다리는 청량리 수인분당 길을 골랐다(광운대→선릉 80분).
    // 최소환승 탭에 시간 상한은 없다 — 환승을 아끼는 대가로 더 걸리는 건 맞는 결과.
    const pairs = [['광운대', '선릉'], ['수원', '강남'], ['광운대', '강남']];
    for (const [a, b] of pairs) {
      await runRoute(page, a, b);
      const best = await routeTab(page, '최적');
      const fewer = await routeTab(page, '최소환승');
      if (best.transfers <= fewer.transfers) {
        expect(fewer.time, `${a}→${b}: 최적 ${best.time}분·${best.transfers}회가 최소환승 ${fewer.time}분·${fewer.transfers}회보다 빠름`).toBeLessThanOrEqual(best.time);
      }
    }
    // 기준 2: 이웃 역(회기↔청량리)에서 출발하면 '최적' 시간이 30분 넘게 바뀌지 않는다
    await runRoute(page, '회기', '선릉');
    const hoegi = await routeTab(page, '최적');
    await runRoute(page, '청량리', '선릉');
    const chr = await routeTab(page, '최적');
    expect(Math.abs(hoegi.time - chr.time), `회기 ${hoegi.time}분 / 청량리 ${chr.time}분`).toBeLessThanOrEqual(30);
  });

  test('[E-13] 지선 갈아타기(성수지선→2호선 본선)는 환승으로 센다', async ({ page }) => {
    await boot(page);
    await runRoute(page, '신설동', '강남');
    const r = await routeTab(page, '최적');
    if (/2호선 \d+개역/.test(r.text) && /신설동 → 서울 지하철 2호선/.test(r.text)) {
      expect(r.transfers, '신설동→강남 2호선 직행은 성수에서 갈아타야 한다').toBeGreaterThanOrEqual(1);
    }
  });
});

// ─────────────── 3. 역 상세 ───────────────

test.describe('역 상세', () => {
  test('[E-20] 서울역 GTX-A 인접역은 운행하지 않는 수서와 이어지지 않는다', async ({ page }) => {
    await boot(page);
    const sd = await openStation(page, '서울역');
    await sd.locator('summary').filter({ hasText: '인접역' }).click();
    const t = (await sd.innerText()).replace(/\s+/g, ' ');
    // 검수 때: "GTX-A 수서 ← 현재역 → 연신내"
    expect(t).not.toMatch(/GTX-A 수서 ← 현재역/);
  });

  test('[E-21] 역세권 문구가 출구 거리와 모순되지 않는다 (강남)', async ({ page }) => {
    await boot(page);
    const sd = await openStation(page, '강남');
    const t = await tabText(sd, '교통');
    const inside = Number(t.match(/1차\(250m\) 안 출구 (\d+)개/)[1]);
    const m = t.match(/출구 · (\d+)개 \(최대 (\d+)m 떨어짐\)/);
    const total = Number(m[1]), maxM = Number(m[2]);
    // 검수 때: "250m 안 출구 12개" + "출구 12개 (최대 393m)"
    if (maxM > 250) expect(inside, '250m 밖 출구가 있는데 전부 250m 안이라고 표시').toBeLessThan(total);
  });

  test('[E-22] 첫 방문자에게도 역 상세에 시세 정보가 보인다 (제품 결정 테스트)', async ({ page }) => {
    await boot(page, { firstVisit: true });
    await page.waitForTimeout(4000); // 안내 카드가 뜰 시간
    await page.keyboard.press('Escape');
    const sd = await openStation(page, '상계');
    // 검수 때: 투자 모드가 꺼져 있으면 교통·이야기 탭만 있고 시세·개발 탭이 아예 없음
    await expect(sd.getByRole('tab', { name: '시세' })).toBeVisible();
  });

  test('[E-23] 생활권 변화 카드 버튼은 눈에 보이는 반응을 준다', async ({ page }) => {
    await boot(page);
    await page.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'canShare', { value: undefined, configurable: true }); });
    await page.reload();
    const sd = await openStation(page, '광운대');
    const dl = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
    await sd.getByRole('button', { name: /생활권 변화 카드로 공유/ }).click();
    const d = await dl;
    const status = await page.locator('#status').innerText();
    // 검수 때: 3번 눌러도 토스트·미리보기·다운로드 모두 없음
    expect(d !== null || /저장|공유|복사/.test(status), '카드 버튼 무반응').toBe(true);
  });
});

// ─────────────── 4. 미래 노선·개통효과 ───────────────

test.describe('미래 노선', () => {
  test('[E-30] 개통 타임라인의 GTX-C 연도 = 랭킹의 GTX-C 연도(2031)', async ({ page }) => {
    await boot(page);
    await openAnalysis(page, '개통 타임라인');
    const t = await page.locator('#rt-panel').innerText();
    const sections = t.split(/\n(?=(?:\d{4}년[^\n]*개통 목표|개통 목표 미정)\n)/);
    const sec = sections.find(s => /\nGTX-C\n/.test('\n' + s + '\n'));
    // 검수 때: GTX-C, GTX-B, 동북선이 "개통 목표 미정"
    expect(sec, 'GTX-C 가 있는 타임라인 구간').toMatch(/^2031년/);
  });

  test('[E-31] 첫 방문자의 "나에게 맞는 역 찾기"가 0곳을 내지 않는다', async ({ page }) => {
    await boot(page, { firstVisit: true });
    await page.waitForTimeout(4000);
    await page.keyboard.press('Escape');
    await openAnalysis(page, '나에게 맞는 역 찾기');
    await page.locator('#qz-dest').fill('강남');
    await page.waitForTimeout(500);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: '다음', exact: true }).click();
    await page.getByRole('button', { name: '10억원 이하', exact: true }).click();
    const next = page.getByRole('button', { name: '다음', exact: true });
    if (await next.isVisible()) await next.click();
    await page.getByRole('button', { name: '개통 예정도 넣기', exact: true }).click();
    const result = page.getByText(/조건에 맞는 역 \d+곳/);
    await expect(result).toBeVisible({ timeout: 20_000 });
    const n = Number((await result.innerText()).match(/(\d+)곳/)[1]);
    // 검수 때: 투자 모드 꺼짐 → 12초 "계산 중" 후 0곳 / 켜짐 → 1.5초에 185곳
    expect(n).toBeGreaterThan(0);
  });

  test('[E-32] 퀴즈 결과의 "지금은 철도로 못 감" 문구는 길찾기와 모순되지 않는다', async ({ page }) => {
    await boot(page, { invest: true });
    await openAnalysis(page, '나에게 맞는 역 찾기');
    await page.locator('#qz-dest').fill('강남');
    await page.waitForTimeout(500);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: '다음', exact: true }).click();
    await page.getByRole('button', { name: '10억원 이하', exact: true }).click();
    const next = page.getByRole('button', { name: '다음', exact: true });
    if (await next.isVisible()) await next.click();
    await page.getByRole('button', { name: '개통 예정도 넣기', exact: true }).click();
    await expect(page.getByText(/조건에 맞는 역 \d+곳/)).toBeVisible({ timeout: 20_000 });
    const body = await page.locator('body').innerText();
    const names = [...body.matchAll(/\n(\d)\s*\n?([가-힣0-9·]+)\n지금은 철도로 못 감/g)].map(m => m[2]);
    await page.getByRole('button', { name: /닫기/ }).first().click().catch(() => {});
    for (const name of names) {
      await runRoute(page, name, '강남');
      const r = await routeTab(page, '최적');
      // 검수 때: 곤지암 "못 감" 이지만 지금 44분, 부천종합운동장 "못 감" 이지만 지금 49분
      expect(Number.isFinite(r.time), `${name}: "지금은 철도로 못 감"인데 길찾기는 ${r.time}분`).toBe(false);
    }
  });
});

// ─────────────── 5. UI ───────────────

test.describe('UI', () => {
  test('[E-40] 검색 후보의 역 이름은 한 줄이다 ("강/남" 꺾임 금지)', async ({ page }) => {
    await boot(page);
    await search(page, '강남');
    const broken = await page.locator('#search-results').evaluate(el => {
      const out = [];
      el.querySelectorAll('li, [role=option]').forEach(li => {
        const nameEl = li.firstElementChild || li;
        const lh = parseFloat(getComputedStyle(nameEl).lineHeight) || 20;
        if (nameEl.getBoundingClientRect().height > lh * 1.5) out.push(nameEl.innerText.replace(/\n/g, '/'));
      });
      return out;
    });
    expect(broken, `두 줄로 꺾인 이름: ${broken.join(', ')}`).toEqual([]);
  });

  test('[E-41] 역 상세와 길찾기를 같이 열어도 길찾기 입력란이 가려지지 않는다', async ({ page }) => {
    await boot(page);
    await openStation(page, '광운대');
    await page.getByRole('navigation', { name: '주요 메뉴' }).getByRole('button', { name: '길찾기' }).click();
    const box = await page.locator('#route-from').boundingBox();
    const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    expect(hit, '출발 입력란 위에 다른 패널이 덮여 있다').toBe('route-from');
  });

  test('[E-42] 모바일 390px: 44px 미만 터치 대상이 없다 (지도 저작권 링크 제외)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page);
    const small = await page.evaluate(() => {
      const r = [];
      document.querySelectorAll('button,a,[role=button],input:not([type=hidden]),select,summary,[role=tab]').forEach(e => {
        const b = e.getBoundingClientRect();
        if (!b.width || !b.height || b.bottom < 0 || b.top > innerHeight) return;
        if (e.closest('.maplibregl-ctrl-attrib')) return;
        const top = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
        if (!top || !(e.contains(top) || top.contains(e))) return;
        if (b.width < 44 || b.height < 44) r.push(`${(e.innerText || e.getAttribute('aria-label') || '').trim().slice(0, 15)} ${Math.round(b.width)}x${Math.round(b.height)}`);
      });
      return r;
    });
    // 검수 때: 지도 화면 15개 중 9개 미달
    expect(small).toEqual([]);
  });

  test('[E-43] 모바일 햄버거 버튼의 접근성 이름이 동작과 맞다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page);
    // 검수 때: 패널을 "여는" 버튼인데 이름이 "패널 접기"
    await expect(page.getByRole('button', { name: '패널 접기' })).toHaveCount(0);
  });
});
