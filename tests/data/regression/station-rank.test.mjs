// 회귀(숙제 64, 회장 결정 11-18): 역 상세 순위 = 홈 카드·축지법 패널과 같은 기준("2031년까지 개통 · 수도권 675역 중 117위").
// 배포본 의정부: 홈·랭킹 448→117위(2031·수도권 675역) / 역 상세 '전국 127위'(연도·범위 없음, 화면이 따로 셈).
// 역 상세 값은 data/rank-station.json(data/build_rank.js 가 js/rank.js 로 만든 값)에서만 읽는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.env.KR_RAIL_ROOT || process.cwd();
const read = p => readFileSync(join(ROOT, p), 'utf8');

test('[R-64] rank-station.json 이 있고, 기본 연도·수도권 역 수가 홈 카드(rank-top.json)와 같다', () => {
  assert.ok(existsSync(join(ROOT, 'data/rank-station.json')), 'data/rank-station.json 없음');
  const rs = JSON.parse(read('data/rank-station.json'));
  const top = JSON.parse(read('data/rank-top.json'));
  const rank = JSON.parse(read('data/rank.json'));
  assert.equal(String(rs.year), String(top.year));
  assert.equal(String(rs.year), String(rank.default_year));
  assert.equal(rs.total.c, top.total);
});

test('[R-64] 의정부 상세 순위 = 홈 카드 개통 후 순위 (수도권)', () => {
  const rs = JSON.parse(read('data/rank-station.json'));
  const top = JSON.parse(read('data/rank-top.json'));
  const ujb = top.top.find(t => t.n === '의정부');
  assert.ok(ujb, '홈 카드에 의정부 없음');
  assert.deepEqual(rs.by[ujb.id], [ujb.aft, 'c']);
});

test('[R-64] 수도권 밖 역은 전국 순위(n) — 부산', () => {
  const rs = JSON.parse(read('data/rank-station.json'));
  const st = JSON.parse(read('data/stations.geojson'));
  const busan = st.features.find(f => f.properties.name_ko === '부산' && f.geometry.coordinates[1] < 35.2);
  assert.equal(rs.by[busan.properties.id][1], 'n');
  assert.ok(rs.total.n > rs.total.c);
});

test('[R-64] 역 상세(js/access.js)는 순위를 다시 세지 않고 rank-station.json 을 읽는다', () => {
  const src = read('js/access.js');
  assert.doesNotMatch(src, /function buildRanks/, '역 상세가 순위를 따로 셈');
  assert.match(read('js/app.js') + src, /rank-station\.json/);
});
