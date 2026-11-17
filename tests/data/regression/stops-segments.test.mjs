// 회귀: 인접역은 노선 stops 순서에서만 만든다. 구간이 나뉜 노선은 stops 도 구간별 [[…],[…]].
// 검수 때 서울역 GTX-A 인접역이 "수서 ← 현재역 → 연신내" (운행 안 하는 서울↔수서가 이웃으로 보임).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DATA = join(process.env.KR_RAIL_ROOT || process.cwd(), 'data');
const lines = JSON.parse(readFileSync(join(DATA, 'lines.geojson'), 'utf8')).features;
const segs = p => (Array.isArray(p.stops[0]) ? p.stops : [p.stops]);
function neighbors(lid, name) {
  const p = lines.find(f => f.properties.id === lid).properties;
  const out = new Set();
  for (const s of segs(p)) {
    const i = s.indexOf(name);
    if (i < 0) continue;
    if (i > 0) out.add(s[i - 1]);
    if (i < s.length - 1) out.add(s[i + 1]);
  }
  return [...out];
}

test('[R-stops] 서울역 GTX-A 이웃은 연신내뿐 (수서 아님)', () => {
  assert.deepEqual(neighbors('great-train-express-line-a', '서울'), ['연신내']);
  assert.deepEqual(neighbors('great-train-express-line-a', '수서'), ['성남']);
});

test('[R-stops] 한 구간 안에 같은 역이 두 번 나오지 않는다', () => {
  const bad = [];
  for (const f of lines) {
    if (!f.properties.stops) continue;
    for (const s of segs(f.properties)) if (new Set(s).size !== s.length) bad.push(f.properties.name_ko);
  }
  assert.deepEqual(bad, []);
});

test('[R-stops] 역 상세 인접역은 stops 가 있는 노선에서 좌표로 추론하지 않는다', () => {
  const src = readFileSync(join(DATA, '..', 'js', 'station-detail.js'), 'utf8');
  assert.match(src, /function stopsChains\(/, 'stops 에서 인접역을 만드는 함수가 없다');
  assert.match(src, /var fromStops = stopsChains\(lineId\);/, 'lineOrder 가 stops 를 먼저 쓰지 않는다');
});
