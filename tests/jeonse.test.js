/* 전세가율 자료 검사 — node tests/jeonse.test.js
 * data/station-jeonse.json (data/build_station_jeonse.py): 같은 단지·같은 면적 매매·신규 전세 짝의 중위값.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const J = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/station-jeonse.json'), 'utf8'));
const ST = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stations.geojson'), 'utf8')).features;
const byId = new Map(ST.map(f => [f.properties.id, f.properties]));

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}  ${detail === undefined ? '' : detail}`); }
}
const ids = Object.keys(J.stations);
check('역 ID 키 (이름 키 아님)', J.keyed_by === 'station_id' && ids.every(id => byId.has(id)));
check('짝짓기 방법이 적혀 있음 (같은 단지·같은 전용면적·신규 전세)', /같은 단지/.test(J.method) && /전용면적/.test(J.method) && /신규/.test(J.method));
check('비율이 있는 역은 짝 3개 이상', ids.every(id => J.stations[id].r == null || J.stations[id].n >= J.minPairs));
check('짝 3개 미만은 비율 없이 few', ids.every(id => J.stations[id].n >= J.minPairs || (J.stations[id].few && J.stations[id].r == null)));
check('비율은 10%~150% 사이', ids.every(id => J.stations[id].r == null || (J.stations[id].r >= 0.1 && J.stations[id].r <= 1.5)));
check('80% 이상 짝 수 ≤ 짝 수', ids.every(id => J.stations[id].hi == null || J.stations[id].hi <= J.stations[id].n));
const shown = ids.filter(id => J.stations[id].r != null).length;
check('비율 있는 역이 300곳 이상', shown >= 300, shown);
check('전국 짝 중위가 50~80% (상식 범위)', J.report.pair_ratio_median >= 0.5 && J.report.pair_ratio_median <= 0.8, J.report.pair_ratio_median);
check('갱신 계약은 뺐다 (세어 둠)', J.report.counts['전세 갱신(뺌)'] > 0);
const by = (n, l) => { const f = ST.find(s => s.properties.name_ko === n && s.properties.lines.includes(l)); return f && J.stations[f.properties.id]; };
const jamsil = by('잠실', 'seoul-subway-line-2'), ilsan = by('일산', 'gyeongui-jungang-line');
check('비싼 동네 잠실 < 외곽 일산 (전세가율)', jamsil && ilsan && jamsil.r < ilsan.r, jamsil && ilsan && `${jamsil.r} vs ${ilsan.r}`);
// 단지별 전세가율 (cx) — 단지 목록과 같은 '시군구코드|법정동' + 지번 열쇠
const CX = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/station-complex.json'), 'utf8')).districts;
const cxKeys = Object.keys(J.cx || {});
check('단지별 값은 단지 목록이 있는 법정동만', cxKeys.length > 0 && cxKeys.every(k => CX[k]));
check('단지 값 = [비율, 짝 수], 비율 10%~150%', cxKeys.every(k => Object.values(J.cx[k]).every(v => v.length === 2 && v[0] >= 0.1 && v[0] <= 1.5 && v[1] >= 1)));
let hit = 0; cxKeys.forEach(k => (CX[k].complexes || []).forEach(c => { if (J.cx[k][c.j]) hit++; }));
check('단지 목록의 지번과 이어지는 단지가 1,000곳 이상', hit >= 1000, hit);
console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
