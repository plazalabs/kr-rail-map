/* GTX-C 상록수 갈래 추가 (2026-11-12) — 한 번 돌리는 자료 정리 스크립트
 *
 * GTX-C 는 금정에서 수원 쪽과 안산 상록수 쪽으로 갈라진다. 상록수 쪽은 새 터널이 아니라 4호선(안산선) 선로를 같이 쓴다.
 * 출처: 국토교통부 2026-09-14 (덕정~수원·상록수 86.6km 본공사 착공), 상록수역 추가 정차 실시협약(안산시, 2023-12).
 * 개통 2031년 목표 (본선과 같이). 상록수~삼성 '30분대'(안산시 발표 인용 보도) → 30분으로 맞춘다 (route.js GTX_TIMES).
 * 선형: 4호선 선로(OpenStreetMap)의 금정~상록수 구간을 그대로 쓴다.
 * 실행: node data/add_sangnoksu.js   (이미 있으면 아무것도 안 한다)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const LP = path.join(ROOT, 'data/lines.geojson'), SP = path.join(ROOT, 'data/stations.geojson'), MP = path.join(ROOT, 'data/line-membership.json');
const lines = JSON.parse(fs.readFileSync(LP, 'utf8'));
const stations = JSON.parse(fs.readFileSync(SP, 'utf8'));
const ID = 'gtx-c-sangnoksu';
if (lines.features.some(f => f.properties.id === ID)) { console.log('이미 있음'); process.exit(0); }

const L4 = lines.features.find(f => f.properties.id === 'seoul-metropolitan-subway-line-4');
const C = lines.features.find(f => f.properties.id === 'gtx-c');
const parts = L4.geometry.type === 'LineString' ? [L4.geometry.coordinates] : L4.geometry.coordinates;
const st = n => stations.features.find(f => f.properties.name_ko === n && f.properties.lines.includes('seoul-metropolitan-subway-line-4'));
const gj = st('금정'), sn = st('상록수');
if (!gj || !sn) throw new Error('금정·상록수 역을 못 찾음');

const k = Math.cos(37.33 * Math.PI / 180);
function proj(p) {
  let best = null;
  parts.forEach((c, pi) => {
    for (let i = 0; i < c.length - 1; i++) {
      const [ax, ay] = c[i], [bx, by] = c[i + 1];
      const dx = (bx - ax) * k, dy = by - ay, px = (p[0] - ax) * k, py = p[1] - ay;
      const t = Math.max(0, Math.min(1, (px * dx + py * dy) / ((dx * dx + dy * dy) || 1)));
      const q = [ax + (bx - ax) * t, ay + (by - ay) * t];
      const d = Math.hypot((p[0] - q[0]) * k, p[1] - q[1]) * 111;
      if (!best || d < best.d) best = { d, pi, i, q };
    }
  });
  return best;
}
const pa = proj(gj.geometry.coordinates), pb = proj(sn.geometry.coordinates);
if (pa.pi !== pb.pi) throw new Error('금정·상록수가 4호선 같은 조각 위에 없다');
const [s, e] = pa.i <= pb.i ? [pa, pb] : [pb, pa];
const c = parts[pa.pi];
let seg = [s.q].concat(c.slice(s.i + 1, e.i + 1)).concat([e.q]).map(p => [+p[0].toFixed(6), +p[1].toFixed(6)]);
if (pa.i > pb.i) seg.reverse();   // 금정 → 상록수
console.log(`금정 투영 ${(pa.d * 1000).toFixed(0)}m, 상록수 ${(pb.d * 1000).toFixed(0)}m, 선형 점 ${seg.length}개`);

const line = {
  type: 'Feature',
  properties: {
    id: ID, name_ko: 'GTX-C 상록수 갈래', name_en: 'GTX-C Sangnoksu branch',
    status: 'construction', variants: 1,
    note: '공사 중 — GTX-C 가 금정에서 갈라져 4호선(안산선) 선로로 상록수까지 간다. 2026년 9월 본공사 착공, 2031년 개통 목표. ' +
      "상록수~삼성 '30분대'(안산시 발표 인용 보도) 기준 · 선형: 4호선 선로(OpenStreetMap, ODbL)를 그대로 씀",
    opened: '2031년 목표 (GTX-C 본선과 같이 — 2026년 9월 본공사 착공)', stops: ['금정', '상록수'],
    stops_source: '국토교통부·안산시 발표 기준 자체 정리',
    color: C.properties.color, category: 'urban', provisional: true,
    plan_source: '국가·지자체 계획 발표', operator: '-', coord_source: 'osm', coord_method: 'own-align',
  },
  geometry: { type: 'LineString', coordinates: seg },
};
lines.features.splice(lines.features.indexOf(C) + 1, 0, line);
for (const x of [gj, sn]) if (!x.properties.lines.includes(ID)) x.properties.lines.push(ID);
fs.writeFileSync(LP, JSON.stringify(lines));
fs.writeFileSync(SP, JSON.stringify(stations));

// 노선·역 배정 증빙 (data/build_membership.py 는 OSM 원자료가 있어야 돌아서, 같은 형식으로 한 줄 넣는다)
const raw = fs.readFileSync(MP, 'utf8');
const crlf = raw.includes('\r\n');
const m = JSON.parse(raw);
const ind = (raw.replace(/\r/g, '').match(/\n( +)"/) || [, ''])[1].length;
const out = {};
for (const [kk, v] of Object.entries(m.lines)) {
  out[kk] = v;
  if (kk === 'gtx-c') out[ID] = { name: 'GTX-C 상록수 갈래', status: 'construction', stations: 2, confirmed: 2, sources: ['osm-geometry'], unconfirmed: [], provisional: true, partial: false, gap_reason: '' };
}
m.lines = out; m.summary.lines++;
let txt = JSON.stringify(m, null, ind); if (raw.replace(/\r/g, '').endsWith('\n')) txt += '\n'; if (crlf) txt = txt.replace(/\n/g, '\r\n');
fs.writeFileSync(MP, txt);
console.log(`노선 ${lines.features.length}개, 역 ${stations.features.length}개`);
