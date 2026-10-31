/* 역별 '도심 접근성' 생성 — data/access.json
 *
 * 실행: node data/build_access.js
 *
 * 왜 만드나
 *   이 사이트는 시세는 보여주지만 '그 역이 어디로 얼마나 빨리 닿는가'는
 *   길찾기 탭을 열어 두 역을 직접 찍어야만 알 수 있었다. 부동산에서 실제로
 *   비교하는 값은 "강남까지 몇 분"이고, 그 값이 개통으로 얼마나 줄어드는지다.
 *   역마다 미리 계산해 두면 상세 패널에서 바로 보여줄 수 있다.
 *
 * 무엇을 재나
 *   역 → 5개 거점 최단 소요시간을 두 번 잰다.
 *     now   : 지금 운행 중인 노선만 (openOnly)
 *     after : 착공·계획·구상 노선까지 전부
 *   시간 모델은 js/route.js 하나만 쓴다. 여기서 따로 구현하면 길찾기 탭의
 *   값과 상세 패널의 값이 갈라진다 (예전에 route-compare 가 그래서 갈라졌다).
 *
 * 거점은 이름으로 찾지 않고 좌표로 찾는다. '시청'은 서울에도 부산에도 있다.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const lines = read('data/lines.geojson');
const stations = read('data/stations.geojson');
let transfers = null;
try { transfers = read('data/transfer-times.json'); } catch (e) { transfers = null; }

// --- route.js 를 그대로 불러 쓴다 (시간 모델의 유일한 출처) ---------------
const rsrc = fs.readFileSync(path.join(ROOT, 'js/route.js'), 'utf8')
  .replace('const RouteFinder', 'globalThis.RouteFinder');
const rctx = vm.createContext({ console, Math, Map, Set, Array, Object, JSON, Infinity });
vm.runInContext(rsrc, rctx);
const RF = rctx.RouteFinder;
const info = RF.buildGraph(lines.features, stations.features);
if (transfers) RF.loadTransfers(transfers);

/* 거점 정의.
 * label 은 화면에 쓰는 이름, name 은 stations.geojson 의 역명.
 * lat/lng 는 '어느 도시의 동명 역인지' 를 가르는 기준점이다. */
const DESTS = [
  { id: 'cbd',   name: '시청', label: '도심·광화문', lat: 37.5657, lng: 126.9770 },
  { id: 'ybd',   name: '여의도', label: '여의도',   lat: 37.5219, lng: 126.9245 },
  { id: 'gbd',   name: '강남',  label: '강남',      lat: 37.4979, lng: 127.0276 },
  { id: 'seoul', name: '서울',  label: '서울역',    lat: 37.5547, lng: 126.9707 },
  { id: 'pangyo', name: '판교', label: '판교',      lat: 37.3948, lng: 127.1112 },
];

function hav(a, b, c, d) {
  const r = Math.PI / 180;
  const dLat = (d - b) * r, dLon = (c - a) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(b * r) * Math.cos(d * r) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

// 같은 이름의 역 중 기준점에 가장 가까운 것을 고른다.
function resolveStation(name, lat, lng) {
  let best = null, bestD = Infinity;
  for (const f of stations.features) {
    if (f.properties.name_ko !== name) continue;
    const [x, y] = f.geometry.coordinates;
    const d = hav(lng, lat, x, y);
    if (d < bestD) { bestD = d; best = f; }
  }
  if (!best) throw new Error('거점 역을 찾을 수 없음: ' + name);
  if (bestD > 2) throw new Error('거점 역이 2km 넘게 떨어짐: ' + name + ' (' + bestD.toFixed(1) + 'km)');
  return { id: best.properties.id, dist: bestD };
}

const dests = DESTS.map(d => {
  const s = resolveStation(d.name, d.lat, d.lng);
  return Object.assign({}, d, { station_id: s.id });
});

// --- 계산 ---------------------------------------------------------------
const ids = stations.features.map(f => f.properties.id);
const out = {};
ids.forEach(id => { out[id] = { now: [], after: [] }; });

const t0 = Date.now();
for (const id of ids) {
  // 두 번의 다익스트라로 5개 거점을 한꺼번에 얻는다.
  const nowMap = RF.allTimesFrom(id, { openOnly: true });
  const aftMap = RF.allTimesFrom(id, { openOnly: false });
  dests.forEach(d => {
    const a = nowMap.get(d.station_id);
    const b = aftMap.get(d.station_id);
    out[id].now.push(a == null ? null : a);
    out[id].after.push(b == null ? null : b);
  });
}
const secs = (Date.now() - t0) / 1000;

// 도달 불가(=null)만 있는 역은 파일에서 뺀다. 지도에는 있지만 철도로 갈 수
// 없는 역(미개통 노선만 있는 신설역)이라 접근성이라는 값이 성립하지 않는다.
let dropped = 0;
Object.keys(out).forEach(id => {
  const has = out[id].after.some(v => v != null);
  if (!has) { delete out[id]; dropped++; }
});

const doc = {
  updated: new Date().toISOString().slice(0, 10),
  basis:
    '역에서 거점까지 최단 소요시간(분). 지금(운행 중 노선만)과 개통 후(착공·계획·구상 포함) ' +
    '두 값을 같은 시간 모델로 계산했다. 시간 모델은 js/route.js 이고, 역 안 환승 도보시간은 ' +
    'data/transfer-times.json(OSM 정차점 거리 기반 추정)을 쓴다. 실제 시각표가 아니므로 ' +
    '±5분 오차를 전제로 읽어야 한다. KTX 는 탑승 1회당 접근 12분을 더한다.',
  destinations: dests.map(d => ({
    id: d.id, name: d.name, label: d.label,
    station_id: d.station_id, lat: d.lat, lng: d.lng,
  })),
  stations: out,
};

const file = path.join(ROOT, 'data/access.json');
fs.writeFileSync(file, JSON.stringify(doc));
const kb = (fs.statSync(file).size / 1024).toFixed(0);

// --- 보고 ---------------------------------------------------------------
console.log('그래프:', JSON.stringify(info));
console.log('거점:', dests.map(d => d.label + '(' + d.name + ')').join(', '));
console.log('역 ' + ids.length + '개 × 2회 다익스트라 = ' + secs.toFixed(1) + '초');
console.log('저장: data/access.json (' + kb + 'KB), 수록 ' + Object.keys(out).length + '역' +
  (dropped ? ', 도달불가 ' + dropped + '역 제외' : ''));

// 눈으로 확인할 표본 — 값이 말이 되는지 본다.
// 이름으로만 찾으면 '시청' 이 부산 시청으로 잡힌다. 좌표로 가른다.
const SAMPLE = [
  ['강남', 37.4979, 127.0276], ['여의도', 37.5219, 126.9245], ['시청', 37.5657, 126.9770],
  ['판교', 37.3948, 127.1112], ['수원', 37.2660, 127.0000], ['인천', 37.4700, 126.7000],
  ['부산', 35.1160, 129.0400], ['동탄', 37.2000, 127.0960], ['일산', 37.6600, 126.7700],
  ['노원', 37.6550, 127.0610], ['춘천', 37.8850, 127.7170], ['강릉', 37.7650, 128.8990],
];
console.log('\n표본 (지금 → 개통 후, 분)');
for (const [n, lat, lng] of SAMPLE) {
  let id = null, bd = Infinity;
  for (const f of stations.features) {
    if (f.properties.name_ko !== n) continue;
    const [x, y] = f.geometry.coordinates;
    const d = hav(lng, lat, x, y);
    if (d < bd) { bd = d; id = f.properties.id; }
  }
  if (!id || !out[id]) { console.log('  ' + n + ': 없음'); continue; }
  const row = dests.map((d, i) => {
    const a = out[id].now[i], b = out[id].after[i];
    return d.label + ' ' + (a == null ? '—' : a) + '→' + (b == null ? '—' : b);
  });
  console.log('  ' + n.padEnd(4) + ' ' + row.join(' · '));
}
