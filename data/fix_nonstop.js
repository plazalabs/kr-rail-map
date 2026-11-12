/* 지나가기만 하고 서지 않는 역을 노선에서 뺀다 — data/stations.geojson 고침 (2026-11-13, 감사 이전4)
 *
 * 실행: node data/fix_nonstop.js   (여러 번 돌려도 같은 결과)  → 그다음 node data/build_access.js
 *
 * 왜
 *   역-노선 소속은 '그 노선 선로에서 300m 안이면 그 노선의 역'으로 자동으로 붙였다(build_membership.py).
 *   그래서 선로가 지나가기만 하는 역도 그 노선 역이 됐다. 예: 경춘선 광운대행 열차는 광운대~중랑을
 *   경원선 선로로 달리며 석계·신이문을 지나기만 한다 → 경춘선이 27역으로 잡혔다.
 *   길찾기에서도 '경춘선으로 신이문에서 탄다' 같은 없는 길이 생긴다.
 *
 * 출처는 아래 각 줄의 source.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, 'stations.geojson');

const NON_STOP = [
  {
    line: 'seoul-metropolitan-subway-gyeongchun-line',
    stations: ['신이문', '석계'],
    reason: '경춘선 광운대 발착 열차가 경원선 선로로 지나가기만 함 (1호선 역)',
    source: '경춘선 역 목록(망우~춘천 21역, itwiki.kr/w/경춘선, 2026-11-13 확인)·전동차는 상봉 기점, 일부 광운대·청량리 연장',
  },
];

// 손님이 타고 내리는 역이 아닌 곳 (차량기지 안 간이 승강장 등) — 역 목록에서 아예 뺀다
const NOT_STATION = [
  {
    id: 'st-5589034149', name: '안평기지간이', line: 'busan-metro-line-4-blue-line',
    reason: '부산 4호선 안평 차량기지(경전철운영사업소) 안 간이 승강장 — 영업 역 아님. 4호선은 미남~안평 14역',
    source: 'itwiki.kr/w/부산_도시철도_4호선 (역 14개, 2026-11-13 확인)',
  },
];

const raw = fs.readFileSync(FILE, 'utf8');
const doc = JSON.parse(raw);
let changed = 0;
for (const ns of NOT_STATION) {
  const i = doc.features.findIndex(f => f.properties.id === ns.id && f.properties.name_ko === ns.name);
  if (i < 0) continue;
  doc.features.splice(i, 1);
  changed++;
  console.log(`  ${ns.name} (${ns.id}) — 영업 역 아님, 역 목록에서 뺌`);
}
for (const rule of NON_STOP) {
  for (const f of doc.features) {
    const p = f.properties;
    if (!rule.stations.includes(p.name_ko) || !Array.isArray(p.lines) || !p.lines.includes(rule.line)) continue;
    p.lines = p.lines.filter(id => id !== rule.line);
    if (p.line_id === rule.line) p.line_id = p.lines[0] || null;
    changed++;
    console.log(`  ${p.name_ko} (${p.id}) — ${rule.line} 뺌 → ${JSON.stringify(p.lines)}`);
  }
}
if (changed) {
  // 원래 파일 모양(한 줄 JSON 인지, 들여쓰기인지)을 그대로 지킨다
  const pretty = /\n\s+"type"/.test(raw.slice(0, 200));
  let out = pretty ? JSON.stringify(doc, null, 2) : JSON.stringify(doc);
  if (raw.endsWith('\n')) out += '\n';
  if (raw.includes('\r\n')) out = out.replace(/\n/g, '\r\n');
  fs.writeFileSync(FILE, out);
}
console.log(`고친 (역, 노선) 쌍: ${changed}`);

// 출처 증빙 파일(line-membership.json)의 역 수도 같이 맞춘다 — tests/membership.test.js 가 대조한다
const MFILE = path.join(__dirname, 'line-membership.json');
const mraw = fs.readFileSync(MFILE, 'utf8');
const mem = JSON.parse(mraw);
const cur = JSON.parse(fs.readFileSync(FILE, 'utf8'));
let mfix = 0;
for (const rule of NON_STOP.concat(NOT_STATION.map(n => ({ line: n.line, stations: [n.name] })))) {
  const L = mem.lines[rule.line];
  if (!L) continue;
  const n = cur.features.filter(f => (f.properties.lines || []).includes(rule.line)).length;
  L.unconfirmed = (L.unconfirmed || []).filter(u => !rule.stations.includes(typeof u === 'string' ? u : u.name));
  if (L.stations !== n) { L.stations = n; L.confirmed = n - L.unconfirmed.length; mfix++; }
  L.nonstop_removed = Array.from(new Set((L.nonstop_removed || []).concat(rule.stations)));   // 지나가기만 하거나 영업 역이 아니라 뺐다 (fix_nonstop.js)
}
if (mfix && mem.summary) {
  const open = Object.values(mem.lines).filter(L => L.status === 'open');
  mem.summary.open_pairs = open.reduce((a, L) => a + L.stations, 0);
  mem.summary.open_confirmed = open.reduce((a, L) => a + L.confirmed, 0);
  mem.summary.open_confirmed_pct = Math.round(1000 * mem.summary.open_confirmed / mem.summary.open_pairs) / 10;
}
const ind = (/\n( +)"/.exec(mraw.slice(0, 200)) || [null, ''])[1].length;   // 원래 들여쓰기 그대로 (이 파일은 1칸)
let mout = JSON.stringify(mem, null, ind);
if (mraw.endsWith('\n')) mout += '\n';
if (mraw.includes('\r\n')) mout = mout.replace(/\n/g, '\r\n');
fs.writeFileSync(MFILE, mout);
console.log(`line-membership.json 고친 노선: ${mfix}`);
module.exports = { NON_STOP, NOT_STATION };
