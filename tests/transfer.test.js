/* 역 안 환승 도보 시간 검사 — 의존성 없이 실행: node tests/transfer.test.js
 *
 * 왜 필요한가:
 *   이 값은 '추정' 이다. 추정값이 조용히 망가지면 경로 화면이 그럴듯한
 *   숫자를 계속 보여주기 때문에 아무도 눈치채지 못한다. 그래서 (1) 자료가
 *   스스로 정합적인지, (2) 실제로 알려진 몇 곳과 맞는지, (3) 계산식과
 *   어긋나지 않는지를 기계가 확인한다.
 *
 *   마지막 검사가 특히 중요하다. 환승 시간을 화면에 넣는 순간 '역을 잘못
 *   짚는' 버그가 생기기 쉽다 — A 역에서 갈아타는데 B 역의 시간을 쓰면
 *   결과가 조용히 틀린다.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const doc = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/transfer-times.json'), 'utf8'));
const stations = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stations.geojson'), 'utf8'));

let pass = 0;
const fails = [];
function check(name, ok, detail) {
  if (ok) pass++;
  else fails.push(name + (detail ? `  [${detail}]` : ''));
}

const st = new Map(stations.features.map(f => [f.properties.id, f.properties]));
const S = doc.stations;
const ids = Object.keys(S);

/* ---------- 1. 자료 구조 ---------- */
check('schema 표기', doc.schema === 'kr-rail-map/transfer-times/1', doc.schema);
check('추정임을 밝힌다', /추정/.test(doc.note || ''), doc.note);
check('역이 100곳 이상', ids.length >= 100, ids.length);
check('기본값이 있다', typeof doc.default_min === 'number' && doc.default_min > 0);

let pairs = 0;
for (const id of ids) {
  pairs += Object.keys(S[id].pairs).length;
}
check('노선쌍이 200개 이상', pairs >= 200, pairs);

/* ---------- 2. 정합성 ---------- */
const badId = ids.filter(id => !st.has(id));
check('모든 역 id 가 stations.geojson 에 있다', badId.length === 0, badId.slice(0, 3).join(','));

const [lo, hi] = doc.clamp;
let badRange = [], badPair = [], badLine = [], badMath = [], asym = 0;
for (const id of ids) {
  const s = st.get(id);
  const lines = new Set(s.lines || []);
  for (const [key, v] of Object.entries(S[id].pairs)) {
    const [a, b] = key.split('|');
    if (a >= b) asym++;
    // 그 역에 실제로 다니는 노선인가
    if (!lines.has(a) || !lines.has(b)) badLine.push(`${S[id].name}:${key}`);
    // 시간이 범위 안인가
    if (!(v.min >= lo && v.min <= hi)) badRange.push(`${S[id].name}:${key}=${v.min}`);
    // 거리와 시간이 계산식과 맞는가 (±1분 반올림 여유)
    const raw = v.m / doc.walk_mps / 60 + doc.overhead_s / 60;
    const want = Math.max(lo, Math.min(hi, raw));
    if (Math.abs(want - v.min) > 1.01) badMath.push(`${S[id].name}:${key} ${v.m}m→${v.min}분(기대 ${want.toFixed(1)})`);
    if (v.m < 0) badPair.push(key);
  }
}
check('노선쌍의 두 노선이 그 역에 다닌다', badLine.length === 0, badLine.slice(0, 3).join(' '));
check('시간이 clamp 범위 안', badRange.length === 0, badRange.slice(0, 3).join(' '));
check('거리와 시간이 계산식과 맞는다', badMath.length === 0, badMath.slice(0, 3).join(' '));
check('쌍 키가 정규화돼 있다 (A|B, A<B)', asym === 0, `${asym}건`);

/* ---------- 3. 실제로 알려진 값과 대조 ---------- */
// 서울교통공사가 공개한 환승 소요시간은 받지 못했다. 대신 지도에서 눈으로
// 확인할 수 있고 널리 알려진 몇 곳을 ±1분 안에서 맞는지 본다. 여기서 크게
// 어긋나면 계산 방식 자체가 틀린 것이다.
const L = {
  '1': 'seoul-metropolitan-subway-line-1',
  '2': 'seoul-subway-line-2',
  '3': 'seoul-metro-line-3',
  '4': 'seoul-metropolitan-subway-line-4',
  '5': 'seoul-subway-line-5',
  '8': 'seoul-subway-line-8',
  '9': 'seoul-subway-line-9',
  '공항': 'arex',
};
function find(name) {
  for (const id of ids) if (S[id].name === name) return S[id];
  return null;
}
function pairMin(name, la, lb) {
  const s = find(name);
  if (!s) return null;
  const a = L[la] || la, b = L[lb] || lb;
  const k = a < b ? `${a}|${b}` : `${b}|${a}`;
  return s.pairs[k] ? s.pairs[k].min : null;
}
const ANCHORS = [
  ['동대문', '1', '4', 3],      // 1호선 지상 ↔ 4호선 지하
  ['잠실', '2', '8', 4],        // 2호선 ↔ 8호선, 승강장이 멀다
  ['사당', '4', '2', 3],        // 같은 승강장
  ['김포공항', '5', '9', 2],    // 바로 옆
  ['종로3가', '1', '5', 6],     // 1호선이 위, 5호선이 아래로 멀다
];
for (const [name, a, b, want] of ANCHORS) {
  const got = pairMin(name, a, b);
  check(`${name} ${a}↔${b} ≈ ${want}분`, got !== null && Math.abs(got - want) <= 1,
    got === null ? '자료 없음' : `${got}분`);
}

// 순서가 뒤집히면 '짧은 환승' 을 고르는 판단이 반대로 된다.
const ddm = pairMin('동대문', '1', '4');
const jamsil = pairMin('잠실', '2', '8');
check('동대문(1↔4) < 잠실(2↔8)', ddm !== null && jamsil !== null && ddm < jamsil,
  `${ddm} vs ${jamsil}`);

/* ---------- 4. route.js 가 이 값을 실제로 쓰는가 ---------- */
const src = fs.readFileSync(path.join(ROOT, 'js/route.js'), 'utf8')
  .replace('const RouteFinder', 'globalThis.RouteFinder');
const ctx = vm.createContext({ console, Math, Map, Set, Array, Object, JSON, Infinity });
vm.runInContext(src, ctx);
const RF = ctx.RouteFinder;
const lines = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/lines.geojson'), 'utf8'));
RF.buildGraph(lines.features, stations.features);

check('자료를 넣기 전에는 기본값', RF.transferMinutes('없는역', 'a', 'b') === doc.default_min,
  String(RF.transferMinutes('없는역', 'a', 'b')));

const loaded = RF.loadTransfers(doc);
check('loadTransfers 가 역 수를 돌려준다', loaded === ids.length, `${loaded} vs ${ids.length}`);

const ddmId = ids.find(id => S[id].name === '동대문');
check('동대문 1↔4 를 자료에서 읽는다',
  RF.transferMinutes(ddmId, L['1'], L['4']) === pairMin('동대문', '1', '4'),
  String(RF.transferMinutes(ddmId, L['1'], L['4'])));
check('노선 순서를 바꿔도 같은 값',
  RF.transferMinutes(ddmId, L['4'], L['1']) === RF.transferMinutes(ddmId, L['1'], L['4']));
check('자료 없는 역은 기본값',
  RF.transferMinutes('st-000000', L['1'], L['4']) === doc.default_min);

// 자료를 넣으면 같은 경로의 표시 시간이 '역별 실제 시간' 기준으로 바뀐다.
const byName = n => stations.features.filter(f => f.properties.name_ko === n);
const pick = (n, lng, lat) => byName(n).sort((a, b) =>
  (Math.abs(a.geometry.coordinates[0] - lng) + Math.abs(a.geometry.coordinates[1] - lat)) -
  (Math.abs(b.geometry.coordinates[0] - lng) + Math.abs(b.geometry.coordinates[1] - lat)))[0];
const gangnam = pick('강남', 127.0276, 37.4979);
const hongdae = pick('홍대입구', 126.9240, 37.5567);
const r = RF.findRoute(gangnam.properties.id, hongdae.properties.id);
check('경로에 환승 시간이 leg 로 실린다',
  r && r.legs.some(l => typeof l.transferAfter === 'number'),
  r ? JSON.stringify(r.legs.map(l => l.transferAfter)) : '경로 없음');
check('환승이 있으면 transferAfter > 0 인 leg 가 있다',
  r && r.transfers === 0 ? true : (r && r.legs.some(l => l.transferAfter > 0)),
  r ? `${r.transfers}회 환승` : '');

/* ---------- 결과 ---------- */
if (fails.length) {
  console.log(`\n✗ 실패 ${fails.length}건`);
  fails.forEach(f => console.log('  ✗ ' + f));
  console.log(`\n결과: ${pass} 통과 / ${fails.length} 실패`);
  process.exit(1);
}
console.log(`결과: ${pass} 통과 / 0 실패`);
