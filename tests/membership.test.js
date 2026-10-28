/* 노선·역 목록의 출처 증빙 검사 — 의존성 없이 실행: node tests/membership.test.js
 *
 * 왜 필요한가:
 *   노선·역 목록을 미래철도DB에서 OSM·공공데이터로 바꿨다. 그런데 '바꿨다' 는
 *   말은 증명이 아니다. 나중에 누가 역을 하나 추가하거나 노선 배정을 고치면
 *   그 역은 아무 자료도 확인해주지 않는 상태가 되는데, 화면은 멀쩡해 보인다.
 *
 *   그래서 (1) 증빙 파일이 데이터와 실제로 맞는지, (2) 개통 노선이 충분히
 *   확인됐는지, (3) 확인 안 된 역이 몇 개인지, (4) 출처 표에 미래철도DB가
 *   '쓰는 자료' 로 되돌아오지 않았는지를 기계가 본다.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const json = (p) => JSON.parse(read(p));

const doc = json('data/line-membership.json');
const lines = json('data/lines.geojson');
const stations = json('data/stations.geojson');
const src = json('data/sources.json');

let pass = 0;
const fails = [];
function check(name, ok, detail) {
  if (ok) pass++;
  else fails.push(name + (detail ? `  [${detail}]` : ''));
}
function section(t) { console.log('\n' + t); }

const M = doc.lines;
const lineById = new Map(lines.features.map((f) => [f.properties.id, f.properties]));

// 우리 데이터에서 (노선 → 역 이름) 을 다시 센다. 증빙 파일이 옛 상태로
// 남아 있으면 여기서 어긋난다.
const ours = new Map();
for (const f of stations.features) {
  for (const lid of (f.properties.lines || [])) {
    if (!ours.has(lid)) ours.set(lid, []);
    ours.get(lid).push(f.properties.name_ko);
  }
}

/* ---------- 1. 파일 구조 ---------- */
section('증빙 파일 구조');
check('스키마 이름이 있다', doc.schema === 'kr-rail-map/line-membership/1', doc.schema);
check('갱신일이 ISO 날짜다', /^\d{4}-\d{2}-\d{2}$/.test(doc.updated || ''), doc.updated);
check('노선 수가 데이터와 같다', Object.keys(M).length === ours.size,
  `${Object.keys(M).length} vs ${ours.size}`);
check('모든 노선 id 가 실제 노선이다',
  Object.keys(M).every((id) => lineById.has(id)),
  Object.keys(M).filter((id) => !lineById.has(id)).join(', '));

/* ---------- 2. 데이터와 일치 ---------- */
section('증빙이 지금 데이터와 맞는다');
const drift = [];
for (const [lid, v] of Object.entries(M)) {
  const now = (ours.get(lid) || []).length;
  if (v.stations !== now) drift.push(`${lid}: ${v.stations}→${now}`);
  if (v.confirmed + v.unconfirmed.length !== v.stations) drift.push(`${lid}: 합이 안 맞음`);
}
check('노선마다 역 수가 같다', drift.length === 0, drift.slice(0, 3).join(', '));

// unconfirmed 에 적힌 이름은 그 노선에 실제로 있는 역이어야 한다.
const ghost = [];
for (const [lid, v] of Object.entries(M)) {
  const names = new Set(ours.get(lid) || []);
  for (const n of v.unconfirmed) if (!names.has(n)) ghost.push(`${lid}/${n}`);
}
check('미확인 목록에 없는 역이 없다', ghost.length === 0, ghost.slice(0, 3).join(', '));

// 출처 표시가 실제 확인 경로와 맞는지 — 'official' 인데 official 이 없는 식.
const KNOWN = new Set(['official', 'osm-relation', 'osm-geometry']);
const badSrc = [];
for (const [lid, v] of Object.entries(M)) {
  for (const s of v.sources) if (!KNOWN.has(s)) badSrc.push(`${lid}:${s}`);
}
check('출처 이름이 정해진 것 중 하나', badSrc.length === 0, badSrc.slice(0, 3).join(', '));

/* ---------- 3. 확인율 ---------- */
section('개통 노선은 충분히 확인됐다');
const s = doc.summary;
check('요약의 개통 노선 수가 맞다',
  s.open_lines === Object.values(M).filter((v) => v.status === 'open').length,
  `${s.open_lines}`);
check('요약의 쌍 수가 맞다',
  s.open_pairs === Object.values(M).filter((v) => v.status === 'open')
    .reduce((a, v) => a + v.stations, 0), `${s.open_pairs}`);
check('개통 노선 확인율 98% 이상', s.open_confirmed_pct >= 98,
  `${s.open_confirmed_pct}%`);
// 90% 아래로 떨어지는 노선이 있으면 그 노선은 다시 봐야 한다. 단, 이유를
// 적어 둔 노선(gap_reason)은 예외로 둔다 — 임계값을 통째로 풀면 다음에 생기는
// 진짜 누락도 같이 통과해 버린다.
const weak = Object.entries(M)
  .filter(([, v]) => v.status === 'open' && v.stations >= 5
    && v.confirmed / v.stations < 0.9 && !v.gap_reason)
  .map(([id, v]) => `${id} ${v.confirmed}/${v.stations}`);
check('확인율 90% 미만인 개통 노선은 이유가 적혀 있다', weak.length === 0, weak.join(', '));
check('미확인 역이 20개 이하', Object.values(M)
  .reduce((a, v) => a + (v.status === 'open' ? v.unconfirmed.length : 0), 0) <= 20,
  String(Object.values(M).reduce((a, v) => a + (v.status === 'open' ? v.unconfirmed.length : 0), 0)));

/* ---------- 4. 개통 전 노선 ---------- */
section('개통 전 노선은 임시로 표시된다');
const planned = Object.entries(M).filter(([, v]) => v.status !== 'open');
check('개통 전 노선이 8개 이상', planned.length >= 8, String(planned.length));
check('개통 전 노선은 전부 provisional', planned.every(([, v]) => v.provisional === true),
  planned.filter(([, v]) => !v.provisional).map(([id]) => id).join(', '));
// 개통 노선은 provisional 이 아니다. 일부 역이 확인되지 않은 개통 노선은
// partial 로 따로 표시한다 — '아직 안 지어진 노선' 과 섞이면 안 된다.
check('개통 노선은 provisional 이 아니다',
  Object.values(M).every((v) => v.status !== 'open' || v.provisional !== true),
  Object.entries(M).filter(([, v]) => v.status === 'open' && v.provisional)
    .map(([id]) => id).join(', '));
check('일부 미확인인 개통 노선은 partial 로 표시된다',
  Object.values(M).every((v) => (v.status === 'open' && v.unconfirmed.length > 0)
    === (v.partial === true)),
  Object.entries(M).filter(([, v]) => v.status === 'open'
    && (v.unconfirmed.length > 0) !== (v.partial === true)).map(([id]) => id).join(', '));
// 노선 데이터의 provisional 과 증빙의 provisional 이 어긋나면 화면과 증빙이 다르다.
const mismatch = Object.entries(M)
  .filter(([id, v]) => !!lineById.get(id).provisional !== !!v.provisional)
  .map(([id]) => id);
check('노선 데이터와 증빙의 provisional 이 같다', mismatch.length === 0, mismatch.join(', '));

/* ---------- 5. 출처 표에 되돌아오지 않았는지 ---------- */
section('미래철도DB 가 출처로 되돌아오지 않았다');
check('sources.json 에 frdb 가 없다',
  !src.sources.some((x) => x.id === 'frdb'));
check('쓰지 않는 자료로 기록돼 있다',
  (src.not_used || []).some((x) => x.id === 'frdb'));
check('쓰지 않는 이유가 적혀 있다',
  (src.not_used || []).every((x) => (x.reason || '').length > 30));
check('증빙 파일의 출처가 sources.json 에 있다',
  ['osm-stops', 'korail-stations'].every((id) => src.sources.some((x) => x.id === id)));
{
  const entry = src.sources.find((x) => x.id === 'osm-stops');
  check('증빙 파일이 출처 표에 연결돼 있다',
    (entry.feeds || []).includes('data/line-membership.json'));
}

/* ---------- 결과 ---------- */
if (fails.length) {
  console.log(`\n✗ 실패 ${fails.length}건`);
  fails.forEach((f) => console.log('  ✗ ' + f));
  console.log(`\n결과: ${pass} 통과 / ${fails.length} 실패`);
  process.exit(1);
}
console.log(`결과: ${pass} 통과 / 0 실패`);
