/* 노선 연장·역 수 검증 — 재발 방지 (감사 이전3·이전4·§3.3, 2026-11-13)
 * 실행: node tests/line-data.test.js
 *
 * 연장은 사이드바와 같은 방식(선형 지오메트리를 따라 잰 km, js/stats.js lineLength)으로 잰다.
 * 기준값은 바깥 자료와 맞는 것이 확인된 노선만 잠근다(±3%). 위키백과 인포박스는 2차 자료라
 * '영업 거리'와 '시설 총연장'이 섞일 수 있어 ±3% 안이면 같은 것으로 본다(감사 지시서 §5 기준).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const lines = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/lines.geojson'), 'utf8')).features;
const stations = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stations.geojson'), 'utf8')).features;

let pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label + (detail != null ? '  ' + detail : '')); }
}
const hav = (a, b) => {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b[1] - a[1]) * r, dLon = (b[0] - a[0]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const lenOf = f => (f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates])
  .reduce((t, c) => { for (let i = 1; i < c.length; i++) t += hav(c[i - 1], c[i]); return t; }, 0);
const line = id => lines.find(f => f.properties.id === id);
const members = id => stations.filter(s => (s.properties.lines || []).includes(id));

// [노선 id, 기준 km, 기준 역 수, 출처]
const REF = [
  // 4·7호선: 이수/총신대입구(이수) 한 역으로 합친 뒤 (data/fix_duplicates.js, 2026-11-13)
  ['seoul-metropolitan-subway-line-4', 85.7, 51, '위키백과 인포박스(감사 부록 B)'],
  ['seoul-subway-line-7', 61.3, 53, '위키백과 인포박스(감사 부록 B)'],
  ['seoul-subway-line-6', 36.4, 39, '위키백과 인포박스(감사 부록 B)'],
  ['seoul-subway-line-9', 40.9, 38, '위키백과 인포박스(감사 부록 B)'],
  ['seoul-metropolitan-subway-shinbundang-line', 33.4, 16, '위키백과 인포박스(감사 부록 B)'],
  ['incheon-subway-line-1', 37.1, 33, '위키백과 인포박스(감사 부록 B)'],
  ['incheon-subway-line-2', 29.1, 27, '위키백과 인포박스(감사 부록 B)'],
  ['ui-sinseol-line', 11.4, 13, '위키백과 인포박스(감사 부록 B)'],
  ['busan-metro-line-1', 40.4, 40, '위키백과 인포박스(감사 부록 B)'],
  ['busan-metro-line-3-brown-line', 18.1, 17, '위키백과 인포박스(감사 부록 B)'],
  ['busan-metro-line-4-blue-line', 12.0, 14, '위키백과 인포박스(감사 부록 B) — 안평기지간이(영업 역 아님) 뺀 뒤, fix_nonstop.js'],
  ['busan-gimhae-light-rail-transit', 23.455, 21, '위키백과 인포박스(감사 부록 B)'],
  ['daegu-metro-line-2', 31.4, 29, '위키백과 인포박스(감사 부록 B)'],
  ['daegu-metro-line-3', 23.1, 30, '위키백과 인포박스(감사 부록 B)'],
  ['gwangju-metro-line-1-pyeongdong-nokdong', 20.6, 20, '위키백과 인포박스(감사 부록 B)'],
  ['dongbuk-line', 13.3, 16, '위키백과 인포박스(감사 부록 B)'],
  // GTX-C 본선 덕정~수원 — 국토교통부 사업 개요 74.8km. 역은 추가역(왕십리·인덕원·의왕) 포함 13 (상록수는 갈래)
  ['gtx-c', 74.8, 13, '국토교통부 GTX-C 사업 개요(감사 지시서 인용) — fix_gtxc.js'],
];
console.log('[연장 ±3%·역 수]');
for (const [id, km, n, src] of REF) {
  const f = line(id);
  if (!f) { check(`${id} 있음`, false); continue; }
  const k = lenOf(f), m = members(id).length;
  check(`${f.properties.name_ko} ${k.toFixed(1)}km (기준 ${km}) · ${m}역 (기준 ${n}) — ${src}`, Math.abs(k / km - 1) <= 0.03 && m === n, `${k.toFixed(1)}km ${m}역`);
}

console.log('\n[지나가기만 하는 역은 그 노선 역이 아님 — data/fix_nonstop.js]');
const { NON_STOP } = (() => { const src = fs.readFileSync(path.join(ROOT, 'data/fix_nonstop.js'), 'utf8'); const m = /const NON_STOP = (\[[\s\S]*?\n\]);/.exec(src); return { NON_STOP: eval(m[1]) }; })();   // eslint-disable-line no-eval
for (const rule of NON_STOP) {
  const bad = members(rule.line).filter(s => rule.stations.includes(s.properties.name_ko)).map(s => s.properties.name_ko);
  check(`${(line(rule.line) || { properties: {} }).properties.name_ko}: ${rule.stations.join('·')} 없음`, bad.length === 0, bad.join(','));
}
// 경춘선 25역 = 상봉~춘천 본선 + 청량리·회기·중랑(청량리 갈래) + 광운대(광운대 갈래). 선형 92km 는 갈래 선로까지 합친 길이라
// 본선 영업거리(망우~춘천)와 다르다 — 연장은 잠그지 않고 역 수만 잠근다.
// 대구 1호선: 2024-12 안심~하양 연장 신설역은 대구한의대병원·부호·하양 셋(KDI) — 옛 대구선 청천이 붙어 36역이던 것을 뺌. 연장 37.5km 는 연장 뒤 길이(위키 34.3 은 옛 값)라 역 수만 잠근다
check('대구 1호선 35역 (청천은 대구선만)', members('daegu-metro-line-1').length === 35 && !members('daegu-metro-line-1').some(s => s.properties.name_ko === '청천'), members('daegu-metro-line-1').length);
check('경춘선 25역 (청량리·광운대 갈래 포함 기준)', members('seoul-metropolitan-subway-gyeongchun-line').length === 25, members('seoul-metropolitan-subway-gyeongchun-line').length);
check('GTX-C 본선에 상록수 없음 (갈래 gtx-c-sangnoksu 에만)', !members('gtx-c').some(s => s.properties.name_ko === '상록수') && members('gtx-c-sangnoksu').some(s => s.properties.name_ko === '상록수') && !line('gtx-c').properties.stops.includes('상록수'));

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
