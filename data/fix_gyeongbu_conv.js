/* 경부선(일반철도 — 무궁화·ITX-새마을) 수도권 정차역 바로잡기 (2026-11-13, 68점 감사 뒤 자체 발견 B7)
 *
 * 무엇이 틀렸나
 *   'gyeongbu-line'(일반철도)에 1호선 전철만 서는 역(대방·금천구청·석수·관악·군포·의왕·성균관대·세마·오산대·평택지제·두정)이
 *   정차역으로 붙어 있었고, 실제 정차역인 영등포·수원·오산·서정리·평택·천안은 빠져 있었다.
 *   → 길찾기에 '의왕에서 무궁화 타기' 같은 없는 경로가 나왔다 (상갈→탄현 '최적' 이 의왕→서울 일반철도 4,000원).
 * 출처: 경부선 무궁화호 정차 경로 — 서울·영등포·안양·수원·오산·서정리·평택·성환·천안 (itwiki 경부선·무궁화호 틀,
 *   편마다 오산·서정리를 건너뛰기도 함 — 우리는 '서는 편이 있으면 정차역'으로 본다).
 * 실행: node data/fix_gyeongbu_conv.js (여러 번 돌려도 같은 결과) → node data/build_access.js && node data/build_rank.js && python build_pages.py
 */
'use strict';
const fs = require('fs');
const path = require('path');
const SP = path.join(__dirname, 'stations.geojson'), MP = path.join(__dirname, 'line-membership.json');
const LID = 'gyeongbu-line', L1 = 'seoul-metropolitan-subway-line-1';
const NOT_STOP = ['대방', '금천구청', '석수', '관악', '군포', '의왕', '성균관대', '세마', '오산대', '평택지제', '두정'];
const ADD_STOP = ['영등포', '수원', '오산', '서정리', '평택', '천안'];

const raw = fs.readFileSync(SP, 'utf8');
const S = JSON.parse(raw);
let removed = [], added = [];
S.features.forEach(f => {
  const p = f.properties;
  if (NOT_STOP.includes(p.name_ko) && (p.lines || []).includes(LID) && f.geometry.coordinates[1] > 36.7) {
    p.lines = p.lines.filter(l => l !== LID);
    if (p.line_id === LID) p.line_id = p.lines[0];
    removed.push(p.name_ko);
  }
});
ADD_STOP.forEach(n => {
  const c = S.features.filter(f => f.properties.name_ko === n && (f.properties.lines || []).includes(L1));
  if (c.length !== 1) throw new Error(n + ' 역(1호선)이 ' + c.length + '개 — 손으로 확인');
  if (!c[0].properties.lines.includes(LID)) { c[0].properties.lines.push(LID); added.push(n); }
});
if (removed.length || added.length) {
  let out = JSON.stringify(S);
  if (raw.endsWith('\n')) out += '\n';
  fs.writeFileSync(SP, out);
}
console.log('뺌', removed.join(' ') || '-', '/ 넣음', added.join(' ') || '-');

// 노선·역 배정 증빙 역 수
const mraw = fs.readFileSync(MP, 'utf8');
const M = JSON.parse(mraw);
const n = S.features.filter(f => (f.properties.lines || []).includes(LID)).length;
if (M.lines[LID] && M.lines[LID].stations !== n) {
  M.lines[LID].stations = n; M.lines[LID].confirmed = n - (M.lines[LID].unconfirmed || []).length;
  M.lines[LID].note_20261113 = '수도권 정차역 바로잡음(1호선 전철역 11곳 뺌, 영등포·수원·오산·서정리·평택·천안 넣음)';
  const open = Object.values(M.lines).filter(L => L.status === 'open');
  M.summary.open_pairs = open.reduce((a, L) => a + L.stations, 0);
  M.summary.open_confirmed = open.reduce((a, L) => a + L.confirmed, 0);
  M.summary.open_confirmed_pct = Math.round(1000 * M.summary.open_confirmed / M.summary.open_pairs) / 10;
  const ind = (mraw.replace(/\r/g, '').match(/\n( +)"/) || [, ''])[1].length;
  let t = JSON.stringify(M, null, ind); if (mraw.replace(/\r/g, '').endsWith('\n')) t += '\n'; if (mraw.includes('\r\n')) t = t.replace(/\n/g, '\r\n');
  fs.writeFileSync(MP, t);
  console.log('증빙 역 수', n);
}
