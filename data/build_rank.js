/* 교통 순위표 자료 — data/rank.json
 *
 * 실행: node data/build_access.js && node data/build_rank.js
 *
 * access.json 은 '노선별 역 ID' 단위다 (2호선 강남과 신분당선 강남이 따로).
 * 순위표는 사람이 읽는 표이므로 '같은 이름 + 가까운 자리(0.6km 안)' 역을 한 줄로 묶고,
 * 거점마다 묶음 안에서 가장 빠른 값을 쓴다. 지역(시·도, 시·군·구)을 붙여 서울/수도권/전국으로 거른다.
 *
 * 순위·점수 계산은 화면(rank.html)이 한다 — 기준(평균·CBD/YBD/GBD 중시)을 바꿀 때마다 다시 매겨야 해서.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const access = read('data/access.json');
// 연도별 CBD·YBD·GBD (build_access.js 가 따로 쓴다 — access.json 을 가볍게 두려고)
const yearsDoc = read('data/_access_years.json');
const stations = read('data/stations.geojson').features;
const lines = read('data/lines.geojson').features;
const dong = read('data/_station_dong.json');
const region = read('data/station-region.json');

const CORE = ['cbd', 'ybd', 'gbd'];
const idx = CORE.map(c => access.destinations.findIndex(d => d.id === c));
if (idx.some(i => i < 0)) throw new Error('access.json 에 CBD·YBD·GBD 가 없다');

const hav = (lng1, lat1, lng2, lat2) => {
  const R = 6371, r = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * r / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lng2 - lng1) * r / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};
const SIDO_SHORT = {
  '서울특별시': '서울', '경기도': '경기', '인천광역시': '인천', '부산광역시': '부산', '대구광역시': '대구',
  '광주광역시': '광주', '대전광역시': '대전', '울산광역시': '울산', '세종특별자치시': '세종',
  '강원특별자치도': '강원', '강원도': '강원', '충청북도': '충북', '충청남도': '충남', '전북특별자치도': '전북',
  '전라북도': '전북', '전라남도': '전남', '경상북도': '경북', '경상남도': '경남', '제주특별자치도': '제주',
};
const short = s => SIDO_SHORT[s] || (s ? s.slice(0, 2) : '');

// --- 역 → 지역 ----------------------------------------------------------
// 1) 동명역 지역 자료(역 ID 기준)  2) 역-법정동 자료에서 이름이 하나뿐인 역  3) 가장 가까운 '지역 아는 역'
const byId = new Map(stations.map(f => [f.properties.id, f]));
const regionOf = new Map();
for (const [id, v] of Object.entries(region.stations || {})) {
  if (v.sido) regionOf.set(id, { sido: short(v.sido), sgg: v.sgg || '' });
}
const dongByName = new Map();
for (const d of dong) {
  if (!d || !d.name || !d.sido) continue;
  if (!dongByName.has(d.name)) dongByName.set(d.name, []);
  dongByName.get(d.name).push(d);
}
for (const f of stations) {
  const id = f.properties.id;
  if (regionOf.has(id)) continue;
  const c = dongByName.get(f.properties.name_ko);
  if (!c) continue;
  const sidos = new Set(c.map(x => x.sido));
  if (sidos.size === 1) {
    const sggs = new Set(c.map(x => x.sgg));
    regionOf.set(id, { sido: short(c[0].sido), sgg: sggs.size === 1 ? c[0].sgg : '' });
  }
}
// 가까운 역으로 추정했을 때 시·도 경계에서 틀린 역 (2026-11-12 눈으로 확인) — 이름으로 바로잡는다
const FIX = {
  '까치울': ['경기', '부천시'], '대장': ['경기', '부천시'], '갈매': ['경기', '구리시'],
  '걸포북변': ['경기', '김포시'], '사우': ['경기', '김포시'], '풍무': ['경기', '김포시'],
};
for (const f of stations) {
  const fx = FIX[f.properties.name_ko];
  const [x, y] = f.geometry.coordinates;
  if (fx && y > 37.3 && y < 37.8 && x > 126.5 && x < 127.3) regionOf.set(f.properties.id, { sido: fx[0], sgg: fx[1] });
}
const known = stations.filter(f => regionOf.has(f.properties.id) && !FIX[f.properties.name_ko]);
let guessed = 0;
for (const f of stations) {
  const id = f.properties.id;
  if (regionOf.has(id)) continue;
  const [x, y] = f.geometry.coordinates;
  let best = null, bd = Infinity;
  for (const k of known) {
    const [kx, ky] = k.geometry.coordinates;
    const d = hav(x, y, kx, ky);
    if (d < bd) { bd = d; best = k; }
  }
  // 15km 넘게 떨어진 역만 있으면 모른다고 둔다 (멀리 있는 역의 시·도를 빌려 오면 틀린다)
  if (best && bd <= 15) { regionOf.set(id, { sido: regionOf.get(best.properties.id).sido, sgg: '', guess: true }); guessed++; }
}

// --- 같은 이름·같은 자리 묶기 -------------------------------------------
const ids = Object.keys(access.stations).filter(id => byId.has(id));
const groups = [];
for (const id of ids) {
  const f = byId.get(id);
  const [x, y] = f.geometry.coordinates;
  let g = groups.find(g => g.name === f.properties.name_ko && hav(x, y, g.lng, g.lat) <= 0.6);
  if (!g) { g = { name: f.properties.name_ko, lng: x, lat: y, ids: [] }; groups.push(g); }
  g.ids.push(id);
}

const lineMeta = new Map(lines.map(l => [l.properties.id, l.properties]));
const usedLines = new Set();
// 묶음 안 역들 중 가장 빠른 값 (CBD·YBD·GBD 셋)
const pick = (g, get) => [0, 1, 2].map(k => {
  let v = null;
  for (const id of g.ids) { const arr = get(yearsDoc.stations[id] || {}) || []; const t = arr[k]; if (t != null && (v == null || t < v)) v = t; }
  return v;
});
const rows = groups.map(g => {
  const best = key => idx.map(i => {
    let v = null;
    for (const id of g.ids) {
      const t = access.stations[id][key][i];
      if (t != null && (v == null || t < v)) v = t;
    }
    return v;
  });
  const ls = new Set();
  g.ids.forEach(id => (byId.get(id).properties.lines || []).forEach(l => { if (lineMeta.has(l)) ls.add(l); }));
  ls.forEach(l => usedLines.add(l));
  const rg = g.ids.map(id => regionOf.get(id)).find(Boolean) || { sido: '', sgg: '' };
  return {
    n: g.name,
    id: g.ids[0],
    r: rg.sido, g: rg.sgg,
    l: Array.from(ls),
    now: best('now'),
    aft: best('after'),
    // 연도별 CBD·YBD·GBD (access.json y) — 묶음 안 가장 빠른 값
    y: Object.fromEntries((yearsDoc.years || []).map(yr => [yr, pick(g, s => (s.y || {})[yr])])),
    // ⏱ 출퇴근 배차 포함 (지금 / 개통 후 / 연도별)
    now_w: pick(g, s => (s.w || {}).now),
    aft_w: pick(g, s => (s.w || {}).aft),
    y_w: Object.fromEntries((yearsDoc.years || []).map(yr => [yr, pick(g, s => ((s.w || {}).y || {})[yr])])),
  };
}).filter(r => r.aft.filter(v => v != null).length >= 2);

const doc = {
  updated: access.updated,
  basis: '역에서 CBD(시청·광화문·종각·서울역)·YBD(여의도·여의나루)·GBD(강남·역삼·선릉·삼성)까지 ' +
    '타고 가는 시간 + 갈아타며 걷는 시간(분). 열차를 기다리는 시간은 넣지 않았다. ' +
    '같은 이름·같은 자리 역(노선별)은 한 줄로 묶고 가장 빠른 값을 쓴다. 시간 모델은 js/route.js.',
  dest: ['CBD', 'YBD', 'GBD'],
  years: yearsDoc.years || [],
  year_lines: yearsDoc.year_lines || {},
  undated_lines: yearsDoc.undated_lines || [],
  lines: Object.fromEntries(Array.from(usedLines).map(l => {
    const p = lineMeta.get(l);
    return [l, { n: p.name_ko, c: p.color, s: p.status, o: p.status === 'open' ? undefined : (p.opened || '') }];
  })),
  rows,
};
fs.writeFileSync(path.join(ROOT, 'data/rank.json'), JSON.stringify(doc));
const bySido = {};
rows.forEach(r => { bySido[r.r || '?'] = (bySido[r.r || '?'] || 0) + 1; });
console.log(`rank.json: ${rows.length}줄 (역 ID ${ids.length}개 묶음), 지역 추정 ${guessed}역, 노선 ${usedLines.size}개`);
console.log('지역별', JSON.stringify(bySido));
console.log('크기', (fs.statSync(path.join(ROOT, 'data/rank.json')).size / 1024).toFixed(0) + 'KB');
