// 실행: node data/remove_extra_stops.js   (여러 번 돌려도 같음)
// 역 자료에 잘못 붙은 '그 노선 정차' 를 뗀다 (v277, 2026-11-15).
// 지도 선이 다른 노선 역 바로 옆을 지나가서 근접도(osm-geometry 300m)로 그 노선 역으로 붙은 것 — 열차는 서지 않는다.
// 근거는 공식 목록 대조(data/_line_assign_check.json 의 extra)와 레일포털 시각표(바로 다음 역).
'use strict';
const fs = require('fs'), path = require('path');
const REMOVE = [
  // 수인분당 대청: 시각표는 대모산입구 → 수서(대청 없음), _line_assign_check extra. 대청은 3호선 역
  { line: 'suin-bundang-line', name: '대청', why: '레일포털 시각표 대모산입구→수서 · 공식 목록 대조 extra' },
];
function load(f) { const raw = fs.readFileSync(path.join(__dirname, f), 'utf8'); return { raw, doc: JSON.parse(raw) }; }
function save(f, raw, doc, indent) {
  let out = JSON.stringify(doc, null, indent || 0);
  if (raw.endsWith('\n')) out += '\n';
  if (raw.includes('\r\n')) out = out.replace(/\n/g, '\r\n');
  fs.writeFileSync(path.join(__dirname, f), out);
}
const S = load('stations.geojson');
let changed = 0; const affected = new Set();
for (const r of REMOVE) {
  for (const f of S.doc.features) {
    const p = f.properties;
    if (p.name_ko !== r.name) continue;
    if (p.line_id === r.line && (p.lines || []).length && !p.lines.includes(r.line)) { p.line_id = p.lines[0]; changed++; console.log(`  ${r.name}: 대표 노선 → ${p.line_id}`); }
    if (!(p.lines || []).includes(r.line)) continue;
    p.lines = p.lines.filter(l => l !== r.line);
    if (p.line_id === r.line && p.lines.length) p.line_id = p.lines[0];   // 대표 노선도 남은 노선으로
    changed++; affected.add(r.line);
    console.log(`  ${r.name}: ${r.line} 뗌 — ${r.why}`);
  }
}
if (changed) save('stations.geojson', S.raw, S.doc);
const M = load('line-membership.json');
let mfix = 0;
for (const lid of affected) {
  const L = M.doc.lines[lid]; if (!L) continue;
  const n = S.doc.features.filter(f => (f.properties.lines || []).includes(lid)).length;
  if (L.stations !== n) { L.stations = n; L.confirmed = n - (L.unconfirmed || []).length; L.removed_extra = REMOVE.filter(r => r.line === lid).map(r => r.name); mfix++; }
}
if (mfix && M.doc.summary) {
  const open = Object.values(M.doc.lines).filter(L => L.status === 'open');
  M.doc.summary.open_pairs = open.reduce((a, L) => a + L.stations, 0);
  M.doc.summary.open_confirmed = open.reduce((a, L) => a + L.confirmed, 0);
  M.doc.summary.open_confirmed_pct = Math.round(1000 * M.doc.summary.open_confirmed / M.doc.summary.open_pairs) / 10;
}
if (mfix) save('line-membership.json', M.raw, M.doc, (/\n( +)"/.exec(M.raw.slice(0, 200)) || [null, ''])[1].length);
console.log(`고침 ${changed} · 증빙 노선 ${mfix}`);
