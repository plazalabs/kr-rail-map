// GTX 입구 카드 계산 규칙 (숙제 81, TASK_GTX입구_MVP §4 단위)
const test = require('node:test');
const assert = require('node:assert');
const G = require('../js/gtx-card.js');

test('큰 숫자: 가장 많이 줄어드는 업무지구', () => {
  assert.deepStrictEqual(G.pickDest([44, 50, 60], [19, 45, 58]), { i: 0, kind: 'cut' });
});
test('큰 숫자: 줄어든 분이 같으면 개통 후가 작은 곳, 그래도 같으면 CBD→YBD→GBD', () => {
  assert.deepStrictEqual(G.pickDest([40, 30, 50], [30, 20, 45]), { i: 1, kind: 'cut' });
  assert.deepStrictEqual(G.pickDest([40, 40, 50], [30, 30, 45]), { i: 0, kind: 'cut' });
});
test('큰 숫자: null 은 건너뜀', () => {
  assert.deepStrictEqual(G.pickDest([null, 50, 60], [10, 45, 40]), { i: 2, kind: 'cut' });
});
test('큰 숫자: 신규 역(지금 셋 다 못 감) → 개통 후 가장 작은 곳', () => {
  assert.deepStrictEqual(G.pickDest([null, null, null], [50, 40, null]), { i: 1, kind: 'new' });
});
test('큰 숫자: 줄어드는 곳 없음 → 지금 가장 작은 곳, same', () => {
  assert.deepStrictEqual(G.pickDest([30, 20, 40], [30, 20, 40]), { i: 1, kind: 'same' });
});

test('분위수 선형 보간 — 손 계산', () => {
  const a = [1, 2, 3, 4];               // 위치 (n−1)q: 0.75 / 1.5 / 2.25
  assert.strictEqual(G.quantile(a, 0.25), 1.75);
  assert.strictEqual(G.quantile(a, 0.5), 2.5);
  assert.strictEqual(G.quantile(a, 0.75), 3.25);
  const b = [-10, 0, 10, 20, 40];       // 위치 1 / 2 / 3
  assert.deepStrictEqual([0.25, 0.5, 0.75].map(q => G.quantile(b, q)), [0, 10, 20]);
});

test('반기: lastClosed 202609 → 2025H1 vs 2026H1, 202612 → H2, 202603 → 2024H2 vs 2025H2', () => {
  assert.deepStrictEqual(G.halfPair('202609'), { from: '2025H1', to: '2026H1' });
  assert.deepStrictEqual(G.halfPair('202612'), { from: '2025H2', to: '2026H2' });
  assert.deepStrictEqual(G.halfPair('202603'), { from: '2024H2', to: '2025H2' });
});

test('10건 경계: 9건 = 판단 보류, 10건 = 라벨', () => {
  const pair = { from: '2025H1', to: '2026H1' };
  assert.ok(G.changeOf([['2025H1', 1000, 9], ['2026H1', 1100, 30]], pair, 10).hold);
  const c = G.changeOf([['2025H1', 1000, 10], ['2026H1', 1100, 10]], pair, 10);
  assert.ok(!c.hold); assert.ok(Math.abs(c.p - 10) < 1e-9);
  assert.ok(G.changeOf([['2025H1', null, 30], ['2026H1', 1100, 30]], pair, 10).hold);
});

test('동 중복 제거: 같은 동 역 3개가 경계 계산에 한 번만', () => {
  const pair = { from: '2025H1', to: '2026H1' };
  const s = p => [['2025H1', 100, 20], ['2026H1', 100 + p, 20]];
  const st = {
    a: { lawd: '11110', dong: '갑동', s: s(50) }, b: { lawd: '11110', dong: '갑동', s: s(50) }, c: { lawd: '11110', dong: '갑동', s: s(50) },
    d: { lawd: '11110', dong: '을동', s: s(0) }, e: { lawd: '11110', dong: '병동', s: s(10) }, f: { lawd: '11140', dong: '갑동', s: s(20) },
  };
  const m = G.buildMarket(st, pair, 10);
  assert.strictEqual(Object.keys(m.k).length, 4);   // 같은 이름이라도 시군구가 다르면 다른 동
  assert.strictEqual(m.n_label, 4);
  // [0,10,20,50] → q25 7.5, q75 27.5 (갑동 3번 들어가면 q75 = 50)
  assert.ok(Math.abs(m.q25 - 7.5) < 1e-9 && Math.abs(m.q75 - 27.5) < 1e-9, JSON.stringify([m.q25, m.q75]));
  assert.strictEqual(m.k['11110|갑동'].m, 'strong');
  assert.strictEqual(m.k['11110|을동'].m, 'weak');
  assert.strictEqual(m.k['11140|갑동'].m, 'mid');
});

test('tier → 카드 말 5개, 카드 말에 금지어 없음', () => {
  assert.deepStrictEqual(G.TIER_WORD, { rocket: '접근성 크게 개선', up: '접근성 개선', flat: '비슷', down: '상대 하락', new: '신규' });
  for (const w of [...Object.values(G.TIER_WORD), ...Object.values(G.MARKET_WORD)]) assert.deepStrictEqual(G.hasBanned(w), [], w);
  assert.deepStrictEqual(G.hasBanned('떡상 역'), ['떡상']);
});
