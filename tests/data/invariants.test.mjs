// 한국철도맵 데이터 불변식 테스트 (브라우저 없이 data/ 파일만 검사)
// 실행: node --test tests/data/
// 원칙: 화면에 나가는 숫자는 전부 data/ 에서 나온다. 데이터가 틀리면 화면도 틀린다.
// 각 테스트 이름 앞의 [D-xx] 는 docs/INVARIANTS.md 의 번호와 같다.
//
// 2026-11-16 검수 시점 기준 예상 결과는 docs/INVARIANTS.md 표에 적어 두었다.
// 처음 돌리면 빨간불이 여러 개 나오는 것이 정상이다. 하나씩 초록으로 바꾸는 것이 작업 순서다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.env.KR_RAIL_ROOT || process.cwd();
const DATA = join(ROOT, 'data');

function load(name) {
  const p = join(DATA, name);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

const stations = load('stations.geojson');
const lines = load('lines.geojson');
const price = load('station-price.json');
const dev = load('station-dev.json');
const access = load('access.json');
const rank = load('rank.json');
const rankTop = load('rank-top.json');
const indexHtml = existsSync(join(ROOT, 'index.html')) ? readFileSync(join(ROOT, 'index.html'), 'utf8') : '';

const ST = stations.features;
const LN = lines.features;
const nameOf = Object.fromEntries(ST.map(f => [f.properties.id, f.properties.name_ko]));
const coordOf = Object.fromEntries(ST.map(f => [f.properties.id, f.geometry.coordinates]));
const lineIds = new Set(LN.map(f => f.properties.id));

function km(a, b) {
  const R = 6371, r = x => x * Math.PI / 180;
  const dLat = r(b[1] - a[1]), dLon = r(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a[1])) * Math.cos(r(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function lineLengthKm(f) {
  const g = f.geometry;
  const parts = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
  let s = 0;
  for (const p of parts) for (let i = 1; i < p.length; i++) s += km(p[i - 1], p[i]);
  return s;
}
const fmt = n => n.toLocaleString('ko-KR');
function failList(title, rows, max = 30) {
  return `${title} (${rows.length}건)\n  - ` + rows.slice(0, max).join('\n  - ') + (rows.length > max ? `\n  ... 외 ${rows.length - max}건` : '');
}

// ─────────────────────────────────────────────────────────────
// 1. 역·노선 "우주"(universe) 단일화
// ─────────────────────────────────────────────────────────────

test('[D-01] 역 id 는 유일하다', () => {
  const ids = ST.map(f => f.properties.id);
  assert.equal(new Set(ids).size, ids.length, '중복된 역 id 가 있다');
});

test('[D-02] 접근성(access.json)·순위(rank.json)는 모든 역을 포함하거나, 빠진 역을 명시적으로 제외 목록에 둔다', () => {
  // 검수 때 화면 숫자: 헤더 1,249 / 역 상세 각주 "전국 1,237역" → 12역 차이의 원인이 여기다.
  const excluded = new Set((access.excluded || []).map(e => e.id || e));
  const missing = ST.filter(f => !access.stations[f.properties.id] && !excluded.has(f.properties.id))
    .map(f => `${f.properties.name_ko} [${f.properties.line_id}]`);
  assert.equal(missing.length, 0, failList('access.json 에 없고 excluded 에도 없는 역', missing));
  assert.equal(rank.rows.length + excluded.size, ST.length, `rank.rows ${rank.rows.length} + excluded ${excluded.size} ≠ 역 ${ST.length}`);
});

test('[D-03] 공유 메타(og/twitter description)의 노선·역 수가 데이터와 같다', () => {
  if (!indexHtml) return;
  const want = [`${LN.length}개 노선`, `${fmt(ST.length)}개 역`];
  for (const prop of ['og:description', 'twitter:description', 'description']) {
    const m = indexHtml.match(new RegExp(`(?:property|name)="${prop}" content="([^"]+)"`));
    if (!m) continue;
    for (const w of want) assert.ok(m[1].includes(w), `${prop} 에 "${w}" 가 없다: ${m[1]}`);
  }
  // og.png 이미지 안의 숫자(검수 때 "82개 노선 · 1,245개 역")는 이미지라 자동 검사 불가 → docs/INVARIANTS.md 수동 점검표 M-01
});

test('[D-04] "역 수"의 정의가 하나다 (같은 이름 역 처리 규칙 명시)', () => {
  // 검수 때: 철도망 통계 1,208 = 역 이름 고유 개수, 헤더 1,249 = 역 id 개수. 정의가 둘이다.
  const uniqueNames = new Set(ST.map(f => f.properties.name_ko)).size;
  const def = stations.count_definition; // 예: { "역": "id", "note": "같은 이름이라도 다른 도시는 다른 역" }
  assert.ok(def, `stations.geojson 에 count_definition 이 없다. 현재 id 기준 ${ST.length}, 이름 기준 ${uniqueNames}. 하나로 정하고 모든 화면이 그 값을 쓰게 하라`);
});

// ─────────────────────────────────────────────────────────────
// 2. 노선 데이터
// ─────────────────────────────────────────────────────────────

test('[D-10] 노선 이름(name_ko)은 유일하다', () => {
  const seen = {};
  for (const f of LN) (seen[f.properties.name_ko] ||= []).push(f.properties.id);
  const dup = Object.entries(seen).filter(([, a]) => a.length > 1).map(([n, a]) => `${n}: ${a.join(', ')}`);
  assert.equal(dup.length, 0, failList('이름이 같은 노선 (검수 때 "서해선" 2개)', dup));
});

test('[D-11] 노선 status 는 정해진 값만 쓴다', () => {
  const allowed = new Set(['open', 'construction', 'planned', 'proposed']);
  const bad = LN.filter(f => !allowed.has(f.properties.status)).map(f => `${f.properties.name_ko}: ${f.properties.status}`);
  assert.equal(bad.length, 0, failList('허용되지 않은 status', bad));
});

test('[D-12] 모든 역의 lines 는 실제 노선 id 를 가리킨다', () => {
  const bad = [];
  for (const f of ST) for (const l of (f.properties.lines || [f.properties.line_id])) if (!lineIds.has(l)) bad.push(`${f.properties.name_ko}: ${l}`);
  assert.equal(bad.length, 0, failList('없는 노선을 가리키는 역', bad));
});

test('[D-13] 노선 stops 에 적힌 역은 그 노선 소속 역으로 존재한다', () => {
  const bad = [];
  for (const f of LN) {
    const stops = f.properties.stops;
    if (!stops) continue;
    const onLine = new Set(ST.filter(s => (s.properties.lines || []).includes(f.properties.id)).map(s => s.properties.name_ko));
    for (const s of stops) if (!onLine.has(s)) bad.push(`${f.properties.name_ko}: "${s}"`);
  }
  assert.equal(bad.length, 0, failList('stops 에는 있는데 그 노선 역에 없는 이름', bad));
});

test('[D-14] 구간이 나뉜 노선(variants>1)은 stops 를 구간별로 나눠 적는다 (인접역 오류 방지)', () => {
  // 검수 때: 서울역 상세의 GTX-A 인접역이 "수서 ← 현재역 → 연신내".
  // 원인: GTX-A stops 가 ["…","연신내","서울","수서","성남",…] 한 줄이라 운행 안 하는 서울↔수서가 이웃으로 보임.
  const bad = LN.filter(f => (f.properties.variants || 1) > 1 && Array.isArray(f.properties.stops) && !Array.isArray(f.properties.stops[0]))
    .map(f => `${f.properties.name_ko}: variants=${f.properties.variants} 인데 stops 가 한 줄 (${f.properties.stops.join('→')})`);
  assert.equal(bad.length, 0, failList('구간이 나뉘었는데 stops 가 한 줄인 노선 → stops 를 [[구간1],[구간2]] 로', bad));
});

test('[D-15] 20km 넘는 노선이 역 3개 이하이면 허용 목록에 이유와 함께 있어야 한다', () => {
  const allow = { 'gunsan-cargo-line': '화물선', 'daegusaneop-line': '계획상 역 수 적음(확인 필요)', 'gtx-a-pyeongtaek': '연장 구간' };
  const cnt = {};
  for (const s of ST) for (const l of (s.properties.lines || [s.properties.line_id])) cnt[l] = (cnt[l] || 0) + 1;
  const bad = LN.map(f => [f, lineLengthKm(f), cnt[f.properties.id] || 0])
    .filter(([f, len, c]) => len > 20 && c <= 3 && !allow[f.properties.id])
    .map(([f, len, c]) => `${f.properties.name_ko}: ${len.toFixed(1)}km 에 역 ${c}개 (검수 때 타임라인 "광주 도시철도 2호선 2역 · 37.1km")`);
  assert.equal(bad.length, 0, failList('길이에 비해 역이 너무 적은 노선', bad));
});

// ─────────────────────────────────────────────────────────────
// 3. 개통 연도: 한 곳에서만 정한다
// ─────────────────────────────────────────────────────────────

test('[D-20] 미개통 노선은 숫자형 open_year (또는 명시적 null) 를 가진다', () => {
  // 검수 때: 타임라인은 GTX-B·C·동북선을 "개통 목표 미정", 랭킹·홈카드는 "GTX-C · 2031".
  // 원인: 연도가 lines.geojson 의 자유 문장(opened)과 rank.json 의 year_lines 두 곳에 따로 있음.
  const bad = LN.filter(f => f.properties.status !== 'open' && !('open_year' in f.properties))
    .map(f => `${f.properties.name_ko}: opened="${f.properties.opened || ''}"`);
  assert.equal(bad.length, 0, failList('open_year 필드가 없는 미개통 노선', bad));
});

test('[D-21] rank.json 의 연도별 노선은 lines.geojson 에 있는 노선이고, 연도가 일치한다', () => {
  const byId = Object.fromEntries(LN.map(f => [f.properties.id, f.properties]));
  const bad = [];
  for (const [y, ids] of Object.entries(rank.year_lines || {})) {
    for (const id of ids) {
      const p = byId[id];
      if (!p) { bad.push(`${y}: "${id}" 는 lines.geojson 에 없는 id`); continue; }
      const yr = 'open_year' in p ? p.open_year : (String(p.opened || '').match(/20\d\d/) || [null])[0];
      if (String(yr) !== String(y)) bad.push(`${y}: ${p.name_ko} 의 개통 연도는 ${yr} (opened="${p.opened || ''}")`);
    }
  }
  assert.equal(bad.length, 0, failList('랭킹 연도와 노선 데이터 연도 불일치', bad));
});

test('[D-22] rank-top.json(홈 카드 TOP3)의 연도·역이 rank.json 과 맞물린다', () => {
  // 홈 카드와 랭킹 패널이 다른 파일을 읽는다. 둘이 어긋나면 화면끼리 숫자가 달라진다.
  assert.ok(rankTop && Array.isArray(rankTop.top), 'rank-top.json 형식 확인');
  // 주의: 검수 시점 rank-top.year 는 문자열 "2031", rank.years 는 숫자 [2027,…]. 타입이 다르면 === 비교가 조용히 실패한다.
  assert.ok((rank.years || []).map(String).includes(String(rankTop.year)), `rank-top.year ${rankTop.year} 가 rank.years 에 없다`);
  const ids = new Set(rank.rows.map(r => r.id));
  for (const t of rankTop.top) assert.ok(ids.has(t.id), `rank-top 의 ${t.n}(${t.id}) 가 rank.rows 에 없다`);
  // TODO(팀): rank.rows 로부터 순위를 다시 매기는 함수가 생기면 now/aft 값까지 비교하라.
});

// ─────────────────────────────────────────────────────────────
// 4. 시세·법정동
// ─────────────────────────────────────────────────────────────

test('[D-30] 한 역은 시세와 개발(공급)에서 같은 법정동을 쓴다', () => {
  // 검수 때: 서울역 시세=용산구 동자동, 개발=중구 남대문로5가
  const bad = [];
  for (const [id, p] of Object.entries(price.stations)) {
    const d = dev.stations[id];
    if (!d) continue;
    if (p.lawd !== d.lawd || p.dong !== d.dong) bad.push(`${nameOf[id]}: 시세=${p.sgg} ${p.dong} / 개발=${d.sgg} ${d.dong}`);
  }
  assert.equal(bad.length, 0, failList('시세와 개발 탭의 법정동이 다른 역', bad));
});

test('[D-31] 역에 붙은 법정동은 같은 시군구에 붙은 다른 역들과 지리적으로 가깝다 (동명 법정동 오매칭 탐지)', () => {
  // 검수 때: 신사역(강남구)에 "서울 은평구 신사동" 시세가 붙음.
  // 같은 방법으로 장신대(광진구 광장동, 약 300km), 현충원(동작구 동작동, 약 131km)도 걸린다.
  const LIMIT_KM = 12;
  const allow = new Set(['양수', '운길산', '지평']); // 양평·남양주 등 면적이 큰 군. 늘릴 때는 이유를 적어라.
  const bad = [];
  for (const [label, src] of [['시세', price], ['개발', dev]]) {
    const byLawd = {};
    for (const [id, p] of Object.entries(src.stations)) if (coordOf[id]) (byLawd[p.lawd] ||= []).push(id);
    for (const arr of Object.values(byLawd)) {
      if (arr.length < 3) continue;
      for (const id of arr) {
        if (allow.has(nameOf[id])) continue;
        const o = arr.filter(x => x !== id).map(x => coordOf[x]);
        const med = [o.map(c => c[0]).sort((a, b) => a - b)[o.length >> 1], o.map(c => c[1]).sort((a, b) => a - b)[o.length >> 1]];
        const d = km(coordOf[id], med);
        if (d > LIMIT_KM) bad.push(`[${label}] ${nameOf[id]} → ${src.stations[id].sgg} ${src.stations[id].dong} (같은 시군구 다른 역들과 ${d.toFixed(1)}km)`);
      }
    }
  }
  assert.equal(bad.length, 0, failList('동명 법정동 오매칭 의심', bad));
});

test('[D-32] 회귀: 신사역(3호선·신분당선)은 강남구 신사동이다', () => {
  const sinsa = ST.find(f => f.properties.name_ko === '신사' && (f.properties.lines || []).includes('seoul-metropolitan-subway-shinbundang-line'));
  assert.ok(sinsa, '신사역을 찾지 못함');
  const p = price.stations[sinsa.properties.id];
  if (p) assert.equal(p.sgg, '강남구', `신사역 시세가 ${p.sido} ${p.sgg} ${p.dong} 에 붙어 있다`);
  const d = dev.stations[sinsa.properties.id];
  if (d) assert.equal(d.sgg, '강남구', `신사역 개발이 ${d.sgg} ${d.dong} 에 붙어 있다`);
});

test('[D-33] 거래 5건 미만이면 대표 평당가를 내지 않는다 (앱 스스로 정한 규칙)', () => {
  // 앱 각주: "거래 5건 미만은 값을 내지 않고". 그런데 검수 때 서울역 상단 "평당 4,601만원"은 4건, 홍대입구는 1건.
  const MIN = price.minDeals || 5;
  const bad = Object.entries(price.stations)
    .filter(([, p]) => p.deals < MIN && p.medianPerPyeong != null)
    .map(([id, p]) => `${nameOf[id]}: ${p.deals}건인데 평당 ${Math.round(p.medianPerPyeong)}만원`);
  assert.equal(bad.length, 0, failList(`거래 ${MIN}건 미만인데 대표값을 내는 역`, bad));
});

// ─────────────────────────────────────────────────────────────
// 5. 접근성 값의 기본 상식
// ─────────────────────────────────────────────────────────────

test('[D-40] 개통 후 시간이 지금보다 길어지면 3분 이내이고, 이유가 데이터에 적혀 있다', () => {
  // 검수 시점: GTX-A 북쪽 24개 역(일산·운정·킨텍스·대곡 등)이 개통 후 1~2분 느려진다(48건).
  // 창릉역 정차가 추가되기 때문으로 보이며 그 자체는 맞을 수 있다. 다만 화면이 "−"만 가정하고 그리면 틀린 표시가 된다.
  // 이유를 access.slower_reasons = { "<station_id>": "GTX-A 창릉 정차 추가" } 처럼 적어 두고, 화면은 +N분으로 보여 줘라.
  const MAX_SLOWER_MIN = 3;
  const reasons = access.slower_reasons || {};
  const tooBig = [], unexplained = [];
  for (const [id, v] of Object.entries(access.stations)) {
    (v.now || []).forEach((n, i) => {
      const a = (v.after || [])[i];
      if (n == null || a == null || a <= n) return;
      const row = `${nameOf[id] || id} 목적지#${i}: 지금 ${n}분 → 개통 후 ${a}분`;
      if (a - n > MAX_SLOWER_MIN) tooBig.push(row);
      else if (!reasons[id]) unexplained.push(row);
    });
  }
  assert.equal(tooBig.length, 0, failList(`개통 후 ${MAX_SLOWER_MIN}분 넘게 느려지는 값`, tooBig));
  assert.equal(unexplained.length, 0, failList('개통 후 느려지는데 이유(access.slower_reasons)가 없는 값', unexplained));
});

test('[D-41] 업무지구 역 자신은 그 업무지구까지 0분이다', () => {
  const bad = [];
  (access.destinations || []).forEach((d, i) => {
    for (const mid of (d.member_ids || [])) {
      const v = access.stations[mid];
      if (v && v.now && v.now[i] !== 0) bad.push(`${nameOf[mid]} → ${d.label}: 지금 ${v.now[i]}분`);
    }
  });
  assert.equal(bad.length, 0, failList('업무지구 소속 역인데 0분이 아님', bad));
});
