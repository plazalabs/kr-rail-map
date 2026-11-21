// 회귀(숙제 81): GTX 입구 카드 자료 data/gtx-card.json 이 본체 숫자와 같다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.env.KR_RAIL_ROOT || process.cwd();
const J = p => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const card = J('data/gtx-card.json'), rs = J('data/rank-station.json'), trend = J('data/station-trend.json');

test('[R-81] 카드 순위(ra) = rank-station.json by[id][0]', () => {
  const bad = Object.entries(card.s).filter(([id, x]) => !rs.by[id] || rs.by[id][0] !== x.ra).map(([id, x]) => `${id} ${x.n} ${x.ra}/${rs.by[id]}`);
  assert.deepEqual(bad, []);
});

test("[R-81] rank-station by 에서 [, 'c'] 인 id 전부가 s 에 있다", () => {
  const miss = Object.entries(rs.by).filter(([, v]) => v[1] === 'c').map(([id]) => id).filter(id => !card.s[id]);
  assert.deepEqual(miss, []);
});

test('[R-81] 구상 노선이 카드 계산에 안 들어감 (pz 모두 false, 기본 연도 2031)', () => {
  assert.equal(card.year, 2031);
  assert.deepEqual(Object.entries(card.s).filter(([, x]) => x.pz).map(([, x]) => x.n), []);
});

test('[R-81] market.n_label + n_hold = 시세 흐름 자료의 동 수', () => {
  const dongs = new Set(Object.values(trend.stations).filter(s => s.lawd && s.dong).map(s => s.lawd + '|' + s.dong));
  assert.equal(card.market.n_label + card.market.n_hold, dongs.size);
});

test('[R-81] 카드 업무지구 분 = rank.json now · y[기본 연도] (aft·access.json after 아님)', () => {
  const doc = J('data/rank.json');
  const row = doc.rows.find(r => r.id === 'st-7777463060');   // 의정부 (홈 TOP1)
  const x = card.s['st-7777463060'];
  const di = ['CBD', 'YBD', 'GBD'].map(k => doc.dest.indexOf(k));
  assert.deepEqual(x.now, di.map(i => row.now[i]));
  assert.deepEqual(x.aft, di.map(i => row.y[String(card.year)][i]));
});

test('[R-81] 동 중위 평당가(pp) = station-trend 의 비교 끝 반기(market.to) 값 — 거래 건수와 같은 기간', () => {
  const bad = [];
  for (const [key, x] of Object.entries(card.k)) {
    const st = Object.values(trend.stations).find(s => s.lawd + '|' + s.dong === key);
    const row = (st.s || []).find(h => h[0] === card.market.to);
    const want = row && row[1] != null ? Math.round(row[1]) : null;
    if (x.pp !== want || (row ? row[2] : 0) !== x.a[1]) bad.push(`${key} ${x.pp}/${want}`);
  }
  assert.deepEqual(bad.slice(0, 5), []);
});
