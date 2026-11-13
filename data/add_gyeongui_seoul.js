/* 경의선 서울역 방면(서울~신촌~가좌) 추가 + 신촌 두 역 나누기 (2026-11-13, 2차 감사 R1 · 뮤즈 TASK 8-①)
 *
 * 무엇이 틀렸나
 *   - 경의·중앙선의 서울역~가좌 지선 선형이 없어 서울역에서 경의선을 탈 수 없었다.
 *   - 경의선 신촌역(서대문구 대현동, 코레일)과 2호선 신촌역(창천동)은 약 600m 떨어진 다른 역인데 한 점(2호선 신촌)에 묶여 있었다.
 * 고친 것
 *   - 새 노선 'gyeongui-line-seoul'(경의선 서울역 방면): 서울 → 신촌(경의선) → 가좌. 가좌에서 경의·중앙선과 이어 달린다
 *     (js/route.js THROUGH — 갈아타기로 세지 않는다). 따로 노선으로 둔 까닭: 같은 노선에 선 조각만 더하면 1.5km 안의
 *     서강대·홍대입구까지 이 선에 붙어 없는 연결이 생긴다(route.js ATTACH_MAX_KM).
 *   - 2호선 신촌역에서 경의·중앙선을 떼고, 경의선 신촌역을 새로 만든다(코레일 역 위치 = OSM 노드).
 * 출처
 *   - 선형·역 위치: OpenStreetMap(ODbL) — scratch/osm_gyeongui_seoul_20261113.json ('경의선' 본선 way, 측선 제외)
 *   - 가좌~신촌 3분: KRIC 역간 소요시간(route.js KRIC_RUNTIMES 에 이미 있음)
 *   - 배차: 레일포털 도시철도운행정보(2026-05-31) 신촌 출근 시간 20분 → 갈아탈 때 기다림 10분(route.js WAIT_MIN)
 * 실행: node data/add_gyeongui_seoul.js (이미 있으면 아무것도 안 함) → node data/build_access.js && node data/build_rank.js && python build_pages.py
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const LP = path.join(ROOT, 'data/lines.geojson'), SP = path.join(ROOT, 'data/stations.geojson'), MP = path.join(ROOT, 'data/line-membership.json');
const lines = JSON.parse(fs.readFileSync(LP, 'utf8'));
const stations = JSON.parse(fs.readFileSync(SP, 'utf8'));
const ID = 'gyeongui-line-seoul', GJ = 'gyeongui-jungang-line', L2 = 'seoul-subway-line-2';
if (lines.features.some(f => f.properties.id === ID)) { console.log('이미 있음'); process.exit(0); }

const osm = JSON.parse(fs.readFileSync(path.join(ROOT, 'scratch/osm_gyeongui_seoul_20261113.json'), 'utf8')).elements;
const node = (name, op) => { const e = osm.find(x => x.type === 'node' && x.tags && x.tags.name === name && (!op || x.tags.operator === op)); if (!e) throw new Error('OSM 역 없음 ' + name); return [+e.lon.toFixed(6), +e.lat.toFixed(6)]; };
const P_SEOUL = node('서울', '한국철도공사'), P_SINCHON = node('신촌', '한국철도공사'), P_GAJWA = node('가좌', '한국철도공사');

// 선로 그래프 (이름 '경의선', 측선 아님)
function pathAlong(from, to) {
  const key = p => p[0].toFixed(6) + ',' + p[1].toFixed(6);
  const adj = new Map(), pt = new Map();
  const k = Math.cos(37.56 * Math.PI / 180);
  const add = (a, b) => { const ka = key(a), kb = key(b); pt.set(ka, a); pt.set(kb, b);
    const d = Math.hypot((a[0] - b[0]) * k, a[1] - b[1]) * 111;
    (adj.get(ka) || adj.set(ka, []).get(ka)).push([kb, d]); (adj.get(kb) || adj.set(kb, []).get(kb)).push([ka, d]); };
  osm.filter(w => w.type === 'way' && w.tags && w.tags.name === '경의선' && !w.tags.service).forEach(w => {
    const g = w.geometry.map(p => [+p.lon.toFixed(6), +p.lat.toFixed(6)]);
    for (let i = 0; i < g.length - 1; i++) add(g[i], g[i + 1]);
  });
  const near = p => { let best = null; for (const [kk, q] of pt) { const d = Math.hypot((q[0] - p[0]) * k, q[1] - p[1]); if (!best || d < best.d) best = { k: kk, d }; } return best; };
  const s = near(from);
  const dist = new Map([[s.k, 0]]), prev = new Map(), done = new Set();
  while (true) {
    let u = null, ud = Infinity;
    for (const [kk, d] of dist) if (!done.has(kk) && d < ud) { u = kk; ud = d; }
    if (u === null) break; done.add(u);
    for (const [v, w] of adj.get(u) || []) if (!dist.has(v) || ud + w < dist.get(v)) { dist.set(v, ud + w); prev.set(v, u); }
  }
  let t = null;
  for (const kk of dist.keys()) { const q = pt.get(kk); const d = Math.hypot((q[0] - to[0]) * k, q[1] - to[1]); if (!t || d < t.d) t = { k: kk, d }; }
  if (t.d * 111000 > 200) throw new Error('선로가 끊김 (목표까지 ' + (t.d * 111000).toFixed(0) + 'm)');
  const out = []; for (let kk = t.k; kk; kk = prev.get(kk)) out.unshift(pt.get(kk));
  console.log(`  선형 점 ${out.length}개 · 약 ${dist.get(t.k).toFixed(2)}km · 끝점 거리 ${(s.d * 111000).toFixed(0)}m / ${(t.d * 111000).toFixed(0)}m`);
  return out;
}

const seoul = stations.features.find(f => f.properties.name_ko === '서울' && (f.properties.lines || []).includes('seoul-metropolitan-subway-line-1'));
const gajwa = stations.features.find(f => f.properties.name_ko === '가좌' && (f.properties.lines || []).includes(GJ));
const sin2 = stations.features.find(f => f.properties.name_ko === '신촌' && (f.properties.lines || []).includes(L2));
if (!seoul || !gajwa || !sin2) throw new Error('서울·가좌·신촌 역을 못 찾음');

const geo = pathAlong(P_SEOUL, P_GAJWA);
const gjLine = lines.features.find(f => f.properties.id === GJ);
const line = { type: 'Feature', properties: { id: ID, name_ko: '경의선 (서울역 방면)', name_en: 'Gyeongui Line (Seoul Station branch)',
  color: gjLine.properties.color, category: 'metro', status: 'open', variants: 1,
  note: '경의·중앙선 서울역~신촌~가좌 지선. 가좌에서 경의·중앙선(문산 방면)과 이어 달린다. 열차가 드물다(출근 시간 약 20분 간격 — 레일포털 2026-05-31). ' +
    '선형: OpenStreetMap(ODbL) 선로를 따라 이음',
  stops: ['서울', '신촌', '가좌'], stops_source: '코레일 경의선 서울역 방면 운행 구간', coord_source: 'osm', coord_method: 'own-align',
  length_note: '경의·중앙선 지선(서울역~가좌) — 본선과 따로 표시' },
  geometry: { type: 'LineString', coordinates: geo } };
lines.features.splice(lines.features.indexOf(gjLine) + 1, 0, line);

// 역
seoul.properties.lines.push(ID);
gajwa.properties.lines.push(ID);
// 확인해 보니 기존 '신촌'(st-2346858838)은 코레일 경의선 신촌역 자리(출구 2개도 그 역)에 있었고, 2호선이 이 점을 같이 썼다
// → 2호선 신촌이 실제보다 약 700m 떨어진 곳에 있던 셈. 기존 점은 경의선 신촌으로 두고(출구·시세 그대로),
//   2호선 신촌을 실제 위치(OSM 서울교통공사 신촌 노드)에 새로 만든다.
const d0 = Math.hypot((P_SINCHON[0] - sin2.geometry.coordinates[0]) * Math.cos(37.56 * Math.PI / 180), P_SINCHON[1] - sin2.geometry.coordinates[1]) * 111000;
if (d0 > 80) throw new Error('기존 신촌이 코레일 신촌 자리가 아니다 (' + d0.toFixed(0) + 'm) — 손으로 확인');
sin2.properties.lines = [ID];
sin2.properties.line_id = ID;
sin2.properties.note = '코레일 경의선 신촌역 (2026-11-13 2호선 신촌과 나눔)';
const P_L2 = node('신촌', '서울교통공사');
const newSt = { type: 'Feature', properties: { id: 'st-l2-sinchon', name_ko: '신촌', name_en: 'Sinchon', line_id: L2, lines: [L2],
  source: '서울 지하철 2호선 신촌역 — 경의선 신촌역과 다른 역 (2026-11-13 나눔)', coord_source: '역 위치: OpenStreetMap(ODbL) 서울교통공사 신촌역 노드' },
  geometry: { type: 'Point', coordinates: P_L2 } };
stations.features.push(newSt);
const d2 = Math.hypot((P_L2[0] - P_SINCHON[0]) * Math.cos(37.56 * Math.PI / 180), P_L2[1] - P_SINCHON[1]) * 111000;
console.log(`  신촌 나눔: 경의선 신촌(${sin2.properties.id}, 출구 2개 그대로) ↔ 2호선 신촌(st-l2-sinchon) ${d2.toFixed(0)}m`);
fs.writeFileSync(LP, JSON.stringify(lines));
fs.writeFileSync(SP, JSON.stringify(stations));

// 노선·역 배정 증빙
const raw = fs.readFileSync(MP, 'utf8');
const crlf = raw.includes('\r\n');
const m = JSON.parse(raw);
const ind = (raw.replace(/\r/g, '').match(/\n( +)"/) || [, ''])[1].length;
const out = {};
for (const [kk, v] of Object.entries(m.lines)) {
  out[kk] = v;
  if (kk === GJ) {
    v.stations = stations.features.filter(f => (f.properties.lines || []).includes(GJ)).length;
    v.confirmed = v.stations - (v.unconfirmed || []).length;
    v.note_20261113 = '신촌(경의선)을 2호선 신촌과 나눠 지선 노선(gyeongui-line-seoul)으로 옮김';
    out[ID] = { name: '경의선 (서울역 방면)', status: 'open', stations: 3, confirmed: 3, sources: ['osm-geometry'], unconfirmed: [], provisional: false, partial: false, gap_reason: '' };
  }
}
m.lines = out; m.summary.lines += 1;
const open = Object.values(m.lines).filter(L => L.status === 'open');
m.summary.open_lines = open.length;
m.summary.open_pairs = open.reduce((a, L) => a + L.stations, 0);
m.summary.open_confirmed = open.reduce((a, L) => a + L.confirmed, 0);
m.summary.open_confirmed_pct = Math.round(1000 * m.summary.open_confirmed / m.summary.open_pairs) / 10;
let txt = JSON.stringify(m, null, ind); if (raw.replace(/\r/g, '').endsWith('\n')) txt += '\n'; if (crlf) txt = txt.replace(/\n/g, '\r\n');
fs.writeFileSync(MP, txt);
console.log(`노선 ${lines.features.length}개, 역 ${stations.features.length}개`);
