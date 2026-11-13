/* 가격 흐름 자료·계산 검사 (G2, 2026-11-13) — node tests/price-trend.test.js
 * data/station-trend.json (data/build_station_trend.py) + js/price-trend.js Logic
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const T = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/station-trend.json'), 'utf8'));
const ST = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stations.geojson'), 'utf8')).features;
const byId = new Map(ST.map(f => [f.properties.id, f.properties]));
const sb = {}; new Function('window', fs.readFileSync(path.join(ROOT, 'js/price-trend.js'), 'utf8'))(sb);
const L = sb.StationTrend.Logic;

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}  ${detail === undefined ? '' : JSON.stringify(detail)}`); }
}

const ids = Object.keys(T.stations);
check('역 ID 로 묶여 있다 (keyed_by station_id) · 역 300곳 이상', T.keyed_by === 'station_id' && ids.length >= 300, ids.length);
check('모든 키가 실제 역 ID', ids.every(id => byId.has(id)), ids.filter(id => !byId.has(id)).slice(0, 3));
check('반기 8개 2023H1~2026H2, 마감월 202609', JSON.stringify(T.halves) === JSON.stringify(['2023H1', '2023H2', '2024H1', '2024H2', '2025H1', '2025H2', '2026H1', '2026H2']) && T.lastClosed === '202609', T.halves);
const bad = [];
ids.forEach(id => {
  const s = T.stations[id].s;
  if (!Array.isArray(s) || s.length !== T.halves.length) bad.push([id, 'len']);
  s.forEach(([h, v, n]) => {
    if (T.halves.indexOf(h) < 0) bad.push([id, h]);
    if (v != null && (n < T.minDeals || v < 300 || v > 30000)) bad.push([id, h, v, n]);   // 5건 미만은 값이 없어야, 평당 300만~3억 밖이면 이상
    if (v == null && n >= T.minDeals) bad.push([id, h, 'null but n', n]);
  });
});
check('반기 값: 5건 이상만 값, 5건 미만은 null, 평당 300만~3억 원 안', bad.length === 0, bad.slice(0, 5));
check('인과 아님 안내가 자료에 있다', /인과/.test(T.note || ''), T.note);

// Logic
check("반기 이름: 2023H1 → '23 상', 2026H2(마감 202609) → '26 하' + '7~9월'",
  L.half('2023H1', '202609').label === '23 상' && L.half('2023H1', '202609').partial === null &&
  L.half('2026H2', '202609').label === '26 하' && L.half('2026H2', '202609').partial === '7~9월', [L.half('2026H2', '202609')]);
check('마감된 반기는 partial 아님 (2026H1, 마감 202609)', L.half('2026H1', '202609').partial === null);
const s = [['2023H1', 1000, 10], ['2023H2', null, 3], ['2026H1', 1200, 9], ['2026H2', 2000, 4]];
const c = L.change(s, '202609');
check('변화율은 처음 값 → 마지막 온전한 반기 (마감 전 반기·빈 반기 제외): +20%', c && c.from === '2023H1' && c.to === '2026H1' && c.pct === 20, c);
check('값이 하나뿐이면 변화율 없음', L.change([['2023H1', 1000, 10], ['2023H2', null, 1]], '202609') === null);

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
