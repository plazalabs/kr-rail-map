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
  // 업무지구는 역 하나가 아니라 묶음이다 (2026-11-11 회장님 결정). 묶음 안에서 '가장 빨리 가는 역'의 시간을 쓴다.
  //   도심 = 시청·광화문·종각·서울역(2026-11-12 회장님 결정), 여의도 = 여의도·여의나루, 강남(테헤란로) = 강남·역삼·선릉·삼성
  { id: 'cbd',   name: '시청', label: 'CBD 도심(시청·광화문·종각·서울역)', lat: 37.5657, lng: 126.9770,
    members: [['광화문', 37.5710, 126.9768], ['종각', 37.5702, 126.9831], ['서울', 37.5547, 126.9707]] },
  { id: 'ybd',   name: '여의도', label: 'YBD 여의도(여의도·여의나루)', lat: 37.5219, lng: 126.9245,
    members: [['여의나루', 37.5271, 126.9329]] },
  { id: 'gbd',   name: '강남',  label: 'GBD 강남(강남·역삼·선릉·삼성)', lat: 37.4979, lng: 127.0276,
    members: [['역삼', 37.5006, 127.0364], ['선릉', 37.5045, 127.0490], ['삼성', 37.5089, 127.0631]] },
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
  // 묶음의 모든 역 ID (같은 자리 다른 노선 역도 넣는다 — 예: 2호선 강남과 신분당선 강남)
  const pts = [[d.name, d.lat, d.lng]].concat(d.members || []);
  const member_ids = [];
  for (const [n, la, ln] of pts) {
    for (const f of stations.features) {
      if (f.properties.name_ko !== n) continue;
      const [x, y] = f.geometry.coordinates;
      if (hav(ln, la, x, y) <= 1) member_ids.push(f.properties.id);
    }
  }
  return Object.assign({}, d, { station_id: s.id, member_ids });
});
// 묶음 안 가장 빠른 시간
const bestOf = (m, d) => { let v = null; for (const id of d.member_ids) { const t = m.get(id); if (t != null && (v == null || t < v)) v = t; } return v; };

// --- 연도별 개통 (2026-11-12) -------------------------------------------
// 노선 'opened' 글에서 개통 연도를 읽는다. '미정…'·'…년대' 는 시기를 모름 → 연도별 단계에는 넣지 않고 '개통 후(전체)' 에만.
// 그 해까지 개통한 노선만 타고 CBD·YBD·GBD 까지 몇 분인지 — 떡상 랭킹 연도 슬라이더(rank.html)가 쓴다.
function openYear(p) {
  const o = String(p.opened || '').trim();
  if (!o || /^미정/.test(o) || /년대/.test(o) || o === '-') return null;
  const m = /(20\d\d)/.exec(o);
  return m ? +m[1] : null;
}
const unopened = lines.features.filter(f => f.properties.status && f.properties.status !== 'open');
const lineYear = {};
unopened.forEach(f => { lineYear[f.properties.id] = openYear(f.properties); });
const YEARS = Array.from(new Set(Object.values(lineYear).filter(y => y != null))).sort((a, b) => a - b);
const allowOf = y => new Set(Object.keys(lineYear).filter(id => lineYear[id] != null && lineYear[id] <= y));
const CORE_IDX = ['cbd', 'ybd', 'gbd'].map(c => dests.findIndex(d => d.id === c));

// --- 계산 ---------------------------------------------------------------
const ids = stations.features.map(f => f.properties.id);
const out = {};
ids.forEach(id => { out[id] = { now: [], after: [] }; });

const t0 = Date.now();
for (const id of ids) {
  // 두 번의 다익스트라로 5개 거점을 한꺼번에 얻는다.
  const nowMap = RF.allTimesFrom(id, { openOnly: true, noWait: true });
  const aftMap = RF.allTimesFrom(id, { openOnly: false, noWait: true });
  dests.forEach(d => {
    const a = bestOf(nowMap, d);
    const b = bestOf(aftMap, d);
    out[id].now.push(a == null ? null : a);
    // 개통은 길을 더할 뿐 빼지 않는다 — 개통 후에도 지금 길로 갈 수 있다. 탐색이 환승이 적은 길을
    // 고르느라(환승 판단 여유분) 표시 분이 지금보다 길게 나오는 경우(2026-11-11, 19역)는 지금 값을 쓴다.
    out[id].after.push(b == null ? (a == null ? null : a) : (a == null ? b : Math.min(a, b)));
  });
  // 연도별 — CBD·YBD·GBD 셋만. 개통은 길을 더할 뿐이므로 앞 해(또는 지금)보다 길면 앞 값을 쓴다
  out[id].y = {};
  let prev = CORE_IDX.map(i => out[id].now[i]);
  for (const y of YEARS) {
    const m = RF.allTimesFrom(id, { openOnly: true, allow: allowOf(y), noWait: true });
    const v = dests.filter((d, i) => CORE_IDX.includes(i)).map((d, k) => {
      const t = bestOf(m, d); const p = prev[k];
      return t == null ? p : (p == null ? t : Math.min(p, t));
    });
    out[id].y[y] = v; prev = v;
  }
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
  years: YEARS,
  year_lines: Object.fromEntries(YEARS.map(y => [y, Object.keys(lineYear).filter(id => lineYear[id] === y)])),
  undated_lines: Object.keys(lineYear).filter(id => lineYear[id] == null),
  destinations: dests.map(d => ({
    id: d.id, name: d.name, label: d.label,
    station_id: d.station_id, member_ids: d.member_ids, lat: d.lat, lng: d.lng,
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
