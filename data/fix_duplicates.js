/* 한 역이 두 번 들어간 것을 하나로 합친다 — data/stations.geojson · data/exits.geojson (2026-11-13, 감사 N5·N6 역 수 +1)
 *
 * 실행: node data/fix_duplicates.js (여러 번 돌려도 같은 결과) → node data/build_access.js && node data/build_rank.js && python build_pages.py
 *
 * 무엇이 틀렸나
 *   4호선 '총신대입구(이수)'와 7호선 '이수'는 한 환승역인데, 역이 두 개(약 150m 떨어진 점)로 들어가 있었고
 *   둘 다 4호선·7호선 소속이었다 → 지도에 점 두 개, 4호선 52역(실제 51)·7호선 54역(실제 53), 출구도 10개·4개로 갈라짐.
 * 고친 것
 *   남길 역 하나(keep)에 소속 노선을 합치고, 다른 역(drop)은 지운다. drop 의 출구는 keep 으로 옮긴다(합쳐서 14개).
 *   시세·전세·개발·단지 자료는 역이 속한 법정동 기준이라 keep 에도 같은 값이 있다 — drop 줄은 쓰이지 않을 뿐 남는다.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const MERGE = [
  { keep: 'st-9420130583', drop: 'st-6048953582', keepName: '총신대입구(이수)', dropName: '이수',
    reason: '4호선 총신대입구(이수)·7호선 이수 — 한 환승역', source: '감사 지시서 부록 B(4호선 51역·7호선 53역) 대조, 2026-11-13' },
];

function load(f) { const raw = fs.readFileSync(path.join(__dirname, f), 'utf8'); return { raw, doc: JSON.parse(raw) }; }
function save(f, raw, doc, indent) {
  let out = JSON.stringify(doc, null, indent || 0);
  if (raw.endsWith('\n')) out += '\n';
  if (raw.includes('\r\n')) out = out.replace(/\n/g, '\r\n');
  fs.writeFileSync(path.join(__dirname, f), out);
}

const S = load('stations.geojson'), E = load('exits.geojson');
let changed = 0;
const affected = new Set();
for (const m of MERGE) {
  const keep = S.doc.features.find(f => f.properties.id === m.keep);
  const di = S.doc.features.findIndex(f => f.properties.id === m.drop);
  if (!keep) throw new Error('keep 역 없음 ' + m.keep);
  if (di >= 0) {
    const drop = S.doc.features[di];
    if (drop.properties.name_ko !== m.dropName || keep.properties.name_ko !== m.keepName) throw new Error('이름이 다르다 — 손으로 확인');
    const union = Array.from(new Set((keep.properties.lines || []).concat(drop.properties.lines || [])));
    union.forEach(l => affected.add(l));
    keep.properties.lines = union;
    S.doc.features.splice(di, 1);
    changed++;
    console.log(`  ${m.dropName}(${m.drop}) → ${m.keepName}(${m.keep}) 로 합침 · 노선 ${JSON.stringify(union)}`);
  }
  let moved = 0;
  E.doc.features.forEach(f => {
    if (f.properties.station === m.drop) { f.properties.station = m.keep; f.properties.name = m.keepName; moved++; }
  });
  if (moved) { changed++; console.log(`  출구 ${moved}개를 ${m.keepName} 으로 옮김 (합계 ${E.doc.features.filter(f => f.properties.station === m.keep).length}개)`); }
}
if (changed) {
  save('stations.geojson', S.raw, S.doc);
  save('exits.geojson', E.raw, E.doc, (/\n( +)"/.exec(E.raw.slice(0, 200)) || [null, ''])[1].length);
}
// 출처 증빙 역 수 맞추기
{
  const M = load('line-membership.json');
  let mfix = 0;
  for (const lid of affected) {
    const L = M.doc.lines[lid]; if (!L) continue;
    const n = S.doc.features.filter(f => (f.properties.lines || []).includes(lid)).length;
    if (L.stations !== n) { L.stations = n; L.confirmed = n - (L.unconfirmed || []).length; L.merged = MERGE.map(m => m.dropName + '→' + m.keepName); mfix++; }
  }
  if (mfix && M.doc.summary) {
    const open = Object.values(M.doc.lines).filter(L => L.status === 'open');
    M.doc.summary.open_pairs = open.reduce((a, L) => a + L.stations, 0);
    M.doc.summary.open_confirmed = open.reduce((a, L) => a + L.confirmed, 0);
    M.doc.summary.open_confirmed_pct = Math.round(1000 * M.doc.summary.open_confirmed / M.doc.summary.open_pairs) / 10;
    save('line-membership.json', M.raw, M.doc, (/\n( +)"/.exec(M.raw.slice(0, 200)) || [null, ''])[1].length);
  }
  console.log(`고침 ${changed} · 증빙 노선 ${mfix}`);
}
// 역 ID 로 묶은 자료(시세·전세·단지·공급·개발)에서 지운 역 줄을 뺀다 — keep 에 같은 법정동 값이 이미 있다.
// 지운 역에만 있는 값이면 keep 으로 옮긴다(덮어쓰지 않음).
for (const f of ['station-price.json', 'station-jeonse.json', 'station-complex.json', 'station-market.json', 'station-dev.json']) {
  const D = load(f);
  const st = D.doc.stations;
  if (!st) continue;
  let n = 0;
  for (const m of MERGE) {
    if (st[m.drop] !== undefined) {
      if (st[m.keep] === undefined) st[m.keep] = st[m.drop];
      delete st[m.drop]; n++;
    }
    // 법정동 묶음 안 역 목록(districts[].stations)에서도 drop → keep (겹치면 하나만)
    (Array.isArray(D.doc.districts) ? D.doc.districts : []).forEach(d => {
      if (!Array.isArray(d.stations) || !d.stations.includes(m.drop)) return;
      d.stations = Array.from(new Set(d.stations.map(id => id === m.drop ? m.keep : id))); n++;
    });
  }
  if (n) { save(f, D.raw, D.doc, (/\n( +)"/.exec(D.raw.slice(0, 200)) || [null, ''])[1].length); console.log(`  ${f}: 지운 역 줄 ${n}개 정리`); }
}
module.exports = { MERGE };
