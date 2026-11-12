/* GTX-C 본선 선형·역 바로잡기 — data/lines.geojson · data/stations.geojson (2026-11-13, 감사 이전3)
 *
 * 실행: node data/fix_gtxc.js   (여러 번 돌려도 같은 결과) → node data/build_access.js && node data/build_rank.js
 *
 * 무엇이 틀렸나
 *   GTX-C 본선(gtx-c) 선형의 남쪽 끝 조각이 '인덕원 → 금정 → 상록수'(안산선 갈래)로 그려져 있었고,
 *   '금정 → 의왕 → 수원'(본선, 경부선 선로 공용) 조각은 아예 없었다. 상록수 갈래는 따로 gtx-c-sangnoksu 로도 있어
 *   상록수가 본선 역 목록·소속에도 이중으로 들어가 있었다 → 사이드바 92.4km·14역.
 * 고친 것
 *   1) 남쪽 조각을 금정에서 자르고, 금정 → 수원은 경부선 선형(gyeongbu-line)을 그대로 가져와 잇는다
 *      (GTX-C 는 금정~수원을 경부선 선로로 달린다 — 상록수 갈래 설명과 같은 방식).
 *   2) 본선 stops 와 상록수 역의 소속에서 gtx-c 를 뺀다 (상록수는 gtx-c-sangnoksu 에만).
 * 공식 연장: 덕정~수원 74.8km(국토교통부 사업 개요, 상록수 갈래 포함 86.46km — 감사 지시서 인용). 고친 뒤 값은 콘솔에 찍힌다.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const LF = path.join(__dirname, 'lines.geojson');
const SF = path.join(__dirname, 'stations.geojson');

const hav = (a, b) => {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b[1] - a[1]) * r, dLon = (b[0] - a[0]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const lenOf = c => { let t = 0; for (let i = 1; i < c.length; i++) t += hav(c[i - 1], c[i]); return t; };
const nearestIdx = (coords, pt) => { let k = -1, d = Infinity; coords.forEach((c, i) => { const x = hav(c, pt); if (x < d) { d = x; k = i; } }); return [k, d]; };
function writeLike(file, raw, doc) {
  let out = JSON.stringify(doc);
  if (raw.endsWith('\n')) out += '\n';
  if (raw.includes('\r\n')) out = out.replace(/\n/g, '\r\n');
  fs.writeFileSync(file, out);
}

const lraw = fs.readFileSync(LF, 'utf8'), sraw = fs.readFileSync(SF, 'utf8');
const lines = JSON.parse(lraw), stations = JSON.parse(sraw);
const st = n => stations.features.find(f => f.properties.name_ko === n && (f.properties.lines || []).includes('seoul-metropolitan-subway-line-1'))
  || stations.features.find(f => f.properties.name_ko === n);
const P = n => st(n).geometry.coordinates;
const gc = lines.features.find(f => f.properties.id === 'gtx-c');
// 경부선 선형(촘촘함)을 쓴다 — 1호선 선형은 점이 성겨 금정이 450m 떨어진다
const l1 = lines.features.find(f => f.properties.id === 'gyeongbu-line');
const before = gc.geometry.coordinates.reduce((a, c) => a + lenOf(c), 0);

// 1) 상록수까지 가는 조각을 금정에서 자른다 (이미 고쳤으면 그 조각이 없다)
const SANG = P('상록수'), GJ = P('금정'), SW = P('수원');
let touched = false;
gc.geometry.coordinates = gc.geometry.coordinates.map(c => {
  const [ks, ds] = nearestIdx(c, SANG);
  if (ds > 0.3) return c;                     // 상록수에 닿지 않는 조각은 그대로
  const [kg, dg] = nearestIdx(c, GJ);
  if (dg > 0.3) throw new Error('상록수 조각에 금정이 없다 — 선형을 손으로 봐야 함');
  touched = true;
  return ks > kg ? c.slice(0, kg + 1) : c.slice(kg).reverse();   // 금정에서 끝나게
});
// 2) 금정 → 수원: 1호선 선형에서 두 역 사이를 잘라 붙인다 (이미 붙어 있으면 건너뜀)
const hasSuwon = gc.geometry.coordinates.some(c => nearestIdx(c, SW)[1] < 0.5);
if (!hasSuwon) {
  let piece = null;
  for (const c of l1.geometry.coordinates) {
    const [a, da] = nearestIdx(c, GJ), [b, db] = nearestIdx(c, SW);
    if (da < 0.5 && db < 0.5) { piece = a < b ? c.slice(a, b + 1) : c.slice(b, a + 1).reverse(); break; }
  }
  if (!piece) throw new Error('경부선 선형에서 금정~수원을 한 조각으로 찾지 못함');
  gc.geometry.coordinates.push(piece);
  touched = true;
}
// 3) 본선 역 목록·소속에서 상록수 빼기
const stops0 = gc.properties.stops.length;
gc.properties.stops = gc.properties.stops.filter(n => n !== '상록수');
const sg = stations.features.find(f => f.properties.name_ko === '상록수' && (f.properties.lines || []).includes('gtx-c'));
if (sg) { sg.properties.lines = sg.properties.lines.filter(id => id !== 'gtx-c'); if (sg.properties.line_id === 'gtx-c') sg.properties.line_id = sg.properties.lines[0]; }
gc.properties.note = '선형: OpenStreetMap(ODbL) 선로를 따라 이음 · 금정~수원은 경부선(수도권 1호선) 선로 공용 · 상록수 갈래는 gtx-c-sangnoksu 로 따로 (2026-11-13 바로잡음)';

const after = gc.geometry.coordinates.reduce((a, c) => a + lenOf(c), 0);
const nSt = stations.features.filter(f => (f.properties.lines || []).includes('gtx-c')).length;
writeLike(LF, lraw, lines);
writeLike(SF, sraw, stations);
console.log(`GTX-C 선형 ${before.toFixed(1)}km → ${after.toFixed(1)}km (공식 덕정~수원 74.8km, 차이 ${((after / 74.8 - 1) * 100).toFixed(1)}%)`);
console.log(`stops ${stops0} → ${gc.properties.stops.length}, 소속 역 ${nSt} · 고침 ${touched || stops0 !== gc.properties.stops.length || !!sg}`);

// 출처 증빙(line-membership.json) 역 수 맞추기 — tests/membership.test.js 가 대조한다
{
  const MF = path.join(__dirname, 'line-membership.json');
  const mraw = fs.readFileSync(MF, 'utf8'); const mem = JSON.parse(mraw);
  const L = mem.lines['gtx-c'];
  if (L && L.stations !== nSt) {
    L.unconfirmed = (L.unconfirmed || []).filter(u => (typeof u === 'string' ? u : u.name) !== '상록수');
    L.stations = nSt; L.confirmed = nSt - L.unconfirmed.length;
    L.note_fix = '상록수는 갈래(gtx-c-sangnoksu)에만 — 본선에서 뺌 (fix_gtxc.js, 2026-11-13)';
    const ind = (/\n( +)"/.exec(mraw.slice(0, 200)) || [null, ''])[1].length;
    let out = JSON.stringify(mem, null, ind); if (mraw.endsWith('\n')) out += '\n'; if (mraw.includes('\r\n')) out = out.replace(/\n/g, '\r\n');
    fs.writeFileSync(MF, out); console.log('line-membership.json gtx-c 역 수 →', nSt);
  }
}
