/* 양산선(노포~북정) + 부산 2호선 양산중앙 연장 추가 (2026-11-13) — 한 번 돌리는 자료 정리 스크립트
 *
 * 왜: 2차 감사 R4 가 '부산 2호선 44역 중 하나 빠짐'이라 했는데, 운행 중 43역은 다 있었다(장산 201~양산 243).
 *     44번째는 아직 개통 전인 양산중앙(244)이고, 이 역은 양산선 개통과 함께 열린다. 확인해 보니 양산선 노선 전체가 앱에 없었다.
 * 출처
 *   - 노선·역: 양산선 노포~북정 11.43km(그린 선 11.40km), 정거장 7곳, 약 25분 (노포·사송·내송·양산시청·양산중앙·신기·북정 — 2024-12 역명 확정 보도),
 *     부산 2호선 연결 양산~양산중앙 0.55km(연결 선로). 부산시·양산시 운영 협약(2026-03-30), 2026년 12월 개통 예정 보도(뉴시스 2026-07-20).
 *   - 위치·선형: OpenStreetMap(ODbL) — scratch/osm_yangsan_20261113.json(역), scratch/osm_yangsan_ways_20261113.json(선로)
 *     양산선 선로는 OSM 에 '공사 중 경전철(construction light_rail)'로 그려져 있다. 차량기지·측선(이름 없는 선)은 뺀다.
 * 실행: node data/add_yangsan.js  (이미 있으면 아무것도 안 한다) → node data/build_access.js && node data/build_rank.js && python build_pages.py
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const LP = path.join(ROOT, 'data/lines.geojson'), SP = path.join(ROOT, 'data/stations.geojson'), MP = path.join(ROOT, 'data/line-membership.json');
const lines = JSON.parse(fs.readFileSync(LP, 'utf8'));
const stations = JSON.parse(fs.readFileSync(SP, 'utf8'));
const ID = 'yangsan-line', EXT = 'busan-metro-line-2-yangsan-ext';
if (lines.features.some(f => f.properties.id === ID)) { console.log('이미 있음'); process.exit(0); }

const nodes = JSON.parse(fs.readFileSync(path.join(ROOT, 'scratch/osm_yangsan_20261113.json'), 'utf8')).elements;
const ways = JSON.parse(fs.readFileSync(path.join(ROOT, 'scratch/osm_yangsan_ways_20261113.json'), 'utf8')).elements;
const osmSt = n => { const e = nodes.find(x => x.type === 'node' && x.tags && x.tags.name === n); if (!e) throw new Error('OSM 역 없음 ' + n); return [+e.lon.toFixed(6), +e.lat.toFixed(6)]; };

// ── 선로 그래프: 이름이 '양산선'(또는 '부산 도시철도 2호선')이고 측선·기지선(service)이 아닌 선만 ──
function pathAlong(name, from, to) {
  const key = p => p[0].toFixed(6) + ',' + p[1].toFixed(6);
  const adj = new Map(), pt = new Map();
  const add = (a, b) => { const ka = key(a), kb = key(b); pt.set(ka, a); pt.set(kb, b);
    const d = Math.hypot((a[0] - b[0]) * Math.cos(35.3 * Math.PI / 180), a[1] - b[1]) * 111;
    (adj.get(ka) || adj.set(ka, []).get(ka)).push([kb, d]); (adj.get(kb) || adj.set(kb, []).get(kb)).push([ka, d]); };
  ways.filter(w => w.tags && !w.tags.service && (w.tags.name === name || (name === '부산 도시철도 2호선' && !w.tags.name && w.tags.railway === 'subway'))).forEach(w => {   // 2호선 양산역 바로 뒤 조각은 OSM 에 이름이 없다
    const g = w.geometry.map(p => [+p.lon.toFixed(6), +p.lat.toFixed(6)]);
    for (let i = 0; i < g.length - 1; i++) add(g[i], g[i + 1]);
  });
  const near = p => { let best = null; for (const [k, q] of pt) { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (!best || d < best.d) best = { k, d }; } return best; };
  const s = near(from);
  const dist = new Map([[s.k, 0]]), prev = new Map(), done = new Set();
  while (true) {
    let u = null, ud = Infinity;
    for (const [k, d] of dist) if (!done.has(k) && d < ud) { u = k; ud = d; }
    if (u === null) break; done.add(u);
    for (const [v, w] of adj.get(u) || []) if (!dist.has(v) || ud + w < dist.get(v)) { dist.set(v, ud + w); prev.set(v, u); }
  }
  // 상·하행 선로가 OSM 에서 따로 그려져 서로 안 이어질 수 있다 → 출발점에서 닿는 점 중 목표에 가장 가까운 점을 끝으로
  let t = null;
  for (const k of dist.keys()) { const q = pt.get(k); const d = Math.hypot(q[0] - to[0], q[1] - to[1]); if (!t || d < t.d) t = { k, d }; }
  if (t.d * 111000 > 150) throw new Error(name + ' 선로가 끊겨 있음 (목표까지 ' + (t.d * 111000).toFixed(0) + 'm)');
  const out = []; for (let k = t.k; k; k = prev.get(k)) out.unshift(pt.get(k));
  console.log(`  ${name}: 점 ${out.length}개 · 약 ${dist.get(t.k).toFixed(2)}km · 끝점 거리 ${(s.d * 111000).toFixed(0)}m / ${(t.d * 111000).toFixed(0)}m`);
  return out;
}

const NAMES = ['노포', '사송', '내송', '양산시청', '양산중앙', '신기', '북정'];
const pos = Object.fromEntries(NAMES.map(n => [n, osmSt(n)]));
const nopo = stations.features.find(f => f.properties.name_ko === '노포' && f.properties.lines.includes('busan-metro-line-1'));
const yangsan = stations.features.find(f => f.properties.name_ko === '양산' && f.properties.lines.includes('busan-metro-line-2-green-line'));
if (!nopo || !yangsan) throw new Error('노포·양산 역을 못 찾음');

const geoMain = pathAlong('양산선', nopo.geometry.coordinates, pos['북정']);
const geoExt = pathAlong('부산 도시철도 2호선', yangsan.geometry.coordinates, pos['양산중앙']);

const SRC = '부산시·양산시 발표(2026-03 운영 협약, 2026-12 개통 예정 보도) 기준 자체 정리';
const mkLine = (id, props, coords) => ({ type: 'Feature', properties: Object.assign({ id, status: 'construction', variants: 1,
  coord_source: 'osm', coord_method: 'own-align', provisional: true, plan_source: '지자체 발표', stops_source: SRC }, props),
  geometry: { type: 'LineString', coordinates: coords } });
const L1 = mkLine(ID, { name_ko: '양산선', name_en: 'Yangsan Line', color: '#2E8B57', category: 'urban',
  note: '공사 중 — 노포(부산 1호선)~북정, 11.43km·7역 경전철, 노포~북정 약 25분. 2026년 12월 개통 예정(보도). 양산중앙에서 부산 2호선과 갈아탄다. ' +
    '양산시 운영 · 선형: OpenStreetMap(ODbL) 공사 중 선로를 따라 이음',
  opened: '2026년 12월 예정 (보도 — 확정 공고 전)', operator: '양산시 (부산교통공사 위탁 협의)', stops: NAMES }, geoMain);
const bl2 = lines.features.find(f => f.properties.id === 'busan-metro-line-2-green-line');
const L2 = mkLine(EXT, { name_ko: '부산 2호선 양산중앙 연장', name_en: 'Busan Line 2 Yangsan Jungang extension', color: bl2.properties.color, category: 'metro',
  note: '공사 중 — 부산 2호선 양산~양산중앙 0.55km(연결 선로), 양산선과 같이 개통 예정(2026년 12월 보도). 부산시 운영 · 선형: OpenStreetMap(ODbL)',
  opened: '2026년 12월 예정 (양산선과 같이)', operator: '부산교통공사', stops: ['양산', '양산중앙'] }, geoExt);
const at = lines.features.indexOf(bl2);
lines.features.splice(at + 1, 0, L2, L1);

// 역: 노포·양산은 있는 역에 노선만 더하고, 나머지 6개(양산중앙 포함)는 새로 만든다
nopo.properties.lines.push(ID);
yangsan.properties.lines.push(EXT);
const newIds = {};
NAMES.filter(n => n !== '노포').forEach((n, i) => {
  const id = 'st-ys-' + i;
  newIds[n] = id;
  stations.features.push({ type: 'Feature', properties: { id, name_ko: n, name_en: '', line_id: ID,
    lines: n === '양산중앙' ? [ID, EXT] : [ID], source: SRC,
    coord_source: '역 위치: OpenStreetMap(ODbL) 공사 중 역 노드 — 개통 전 위치라 출구는 없음' },
    geometry: { type: 'Point', coordinates: pos[n] } });
});
fs.writeFileSync(LP, JSON.stringify(lines));
fs.writeFileSync(SP, JSON.stringify(stations));

// 노선·역 배정 증빙
const raw = fs.readFileSync(MP, 'utf8');
const crlf = raw.includes('\r\n');
const m = JSON.parse(raw);
const ind = (raw.replace(/\r/g, '').match(/\n( +)"/) || [, ''])[1].length;
const out = {};
for (const [k, v] of Object.entries(m.lines)) {
  out[k] = v;
  if (k === 'busan-metro-line-2-green-line') {
    out[EXT] = { name: '부산 2호선 양산중앙 연장', status: 'construction', stations: 2, confirmed: 2, sources: ['osm-geometry'], unconfirmed: [], provisional: true, partial: false, gap_reason: '' };
    out[ID] = { name: '양산선', status: 'construction', stations: 7, confirmed: 7, sources: ['osm-geometry'], unconfirmed: [], provisional: true, partial: false, gap_reason: '' };
  }
}
m.lines = out; m.summary.lines += 2;
let txt = JSON.stringify(m, null, ind); if (raw.replace(/\r/g, '').endsWith('\n')) txt += '\n'; if (crlf) txt = txt.replace(/\n/g, '\r\n');
fs.writeFileSync(MP, txt);
console.log(`노선 ${lines.features.length}개, 역 ${stations.features.length}개 · 새 역 ${JSON.stringify(newIds)}`);
