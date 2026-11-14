/* 요금 회귀표 — node tests/fare-regression.test.js  (종합피드백 12장 A②, 2026-11-14)
 *
 * 노선별 대표 경로의 '기대 요금'(tests/fixtures/fare-regression.json)과 앱이 계산한 값을 한 줄씩 대조해 표로 찍는다.
 * 기대값은 앱 코드와 따로 만든다:
 *   - 수도권 전철: 서울교통공사 공식 역간거리 CSV 의 누계 차이 → 통합요금 규칙 (route.js 를 거치지 않음)
 *   - KTX: (주)에스알 2026.9.1 통합 운임표 원본 값 (표가 바뀌면 여기서 먼저 걸린다)
 *   - 별도 운임: 운영사 공식 구간 요금
 * 그래서 앱 계산식·거리·운임표 중 어느 하나가 바뀌어도 이 표가 잡아낸다.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const lines = JSON.parse(read('data/lines.geojson'));
const stations = JSON.parse(read('data/stations.geojson'));
const FIX = JSON.parse(read('tests/fixtures/fare-regression.json'));

const ctx = vm.createContext({
  console, Math, Map, Set, Array, Object, JSON, Infinity, Promise,
  document: { getElementById: () => null, createElement: () => ({ style: {}, appendChild() {} }),
    head: { appendChild() {} }, addEventListener() {} },
  window: {},
});
vm.runInContext(read('js/route.js').replace('const RouteFinder', 'globalThis.RouteFinder'), ctx);
vm.runInContext(read('js/route-compare.js').replace('const RouteCompare', 'globalThis.RouteCompare'), ctx);
const RF = ctx.RouteFinder, RC = ctx.RouteCompare;
RF.buildGraph(lines.features, stations.features);
RC.init(RF, stations.features, lines.features);
const ktxDoc = JSON.parse(read('data/ktx-fares.json'));
RC.loadKtxFares(ktxDoc);
RC.loadSpecialFares(JSON.parse(read('data/fares-special.json')));

let pass = 0, fail = 0;
const rows = [];
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}  ${detail || ''}`); }
}
const won = n => (n == null ? '-' : n.toLocaleString() + '원');

// 이름 + 노선(정확한 id 또는 '...line-N' 끝)으로 역 찾기
const ALIAS = { '당고개': '불암산' };   // 공식 CSV(2024.3) 뒤 역 이름이 바뀐 것
function station(name, lineMatch) {
  const nm = ALIAS[name] || name;
  const ok = l => typeof lineMatch === 'string' ? l === lineMatch : lineMatch.test(l);
  const f = stations.features.find(s => s.properties.name_ko === nm && (s.properties.lines || []).some(ok));
  return f && f.properties;
}

// ── 1. 공식 역간거리 CSV 에서 기대값을 따로 계산 ──
const csv = new TextDecoder('euc-kr').decode(fs.readFileSync(path.join(ROOT, 'data/_gov/seoul_metro_runtimes_240810.csv')));
const cum = {};   // 호선 → 역 이름 → 누계 km (같은 이름이 두 번이면 처음 것)
csv.split(/\r?\n/).slice(1).forEach(l => {
  const c = l.split(','); if (c.length < 6) return;
  const ln = c[1].trim(), nm = c[2].trim();
  (cum[ln] = cum[ln] || {});
  if (!(nm in cum[ln])) cum[ln][nm] = parseFloat(c[5]);
});
function metroRule(km) {   // 수도권 통합요금 (2025-06-28)
  if (km <= 10) return 1550;
  if (km <= 50) return 1550 + 100 * Math.ceil((km - 10) / 5 - 1e-9);
  return 2350 + 100 * Math.ceil((km - 50) / 8 - 1e-9);
}

console.log('\n[규칙 자체] 통합요금 경계');
check('규칙: 10.0km 1,550 / 10.1km 1,650 / 15.0km 1,650 / 50km 2,350 / 58km 2,450 / 58.1km 2,550',
  metroRule(10) === 1550 && metroRule(10.1) === 1650 && metroRule(15) === 1650 && metroRule(50) === 2350 && metroRule(58) === 2450 && metroRule(58.1) === 2550);
check('규칙이 앱 calcFare 와 같다 (0.1km 간격 0.1~80km)', (() => {
  for (let d = 1; d <= 800; d++) { const km = d / 10; if (metroRule(km) !== RC.calcFare(km)) return false; } return true;
})());

console.log('\n[수도권 전철] 공식 역간거리 → 기대 요금 → 앱 요금');
for (const c of FIX.metro) {
  const ln = String(c.line);
  const cv = n => (n in cum[ln] ? cum[ln][n] : cum[ln][n + '역']);   // 원자료는 '서울역'처럼 적기도 한다
  const csvKm = Math.round(Math.abs(cv(c.to) - cv(c.from)) * 10) / 10;
  const rule = metroRule(csvKm);
  const re = new RegExp(`line-${c.line}$`);
  const A = station(c.from, re), B = station(c.to, re);
  let app = null, appKm = null, how = '역 없음';
  if (A && B) {
    const all = RC.findAll(A.id, B.id, { openOnly: true });
    // 그 노선만 탄 경로(걷기 제외)를 찾는다 — 다른 노선으로 돌아가면 공식 거리와 견줄 수 없다
    const single = ['time', 'transfer', 'fare', 'now'].map(k => all[k])
      .find(r => r && r.legs.every(l => l.walk || re.test(l.lineId)));
    if (single) {
      app = single.fare; appKm = Math.round(single.legs.reduce((s, l) => s + (l.distKm || 0), 0) * 10) / 10; how = `${c.line}호선만`;
    } else how = '한 노선 경로 없음';
  }
  const label = `${c.line}호선 ${c.from}→${c.to}`;
  check(`${label}: 공식 ${csvKm}km = 표 ${c.km}km`, csvKm === c.km, `CSV ${csvKm}`);
  check(`${label}: 규칙 ${won(rule)} = 표 ${won(c.fare)}`, rule === c.fare);
  check(`${label}: 앱 ${won(app)} (${appKm}km, ${how}) = ${won(c.fare)}`, app === c.fare && appKm === c.km);
  rows.push([label, `${c.km}km`, c.fare, app, FIX.sources.metro.effective, '서울교통공사 역간거리(OA-12034)']);
}

console.log('\n[KTX] 공식 통합 운임표 2026-09-01');
const key = (a, b) => [a, b].sort().join('|');
for (const c of FIX.ktx) {
  const label = `KTX ${c.from}→${c.to}`;
  const table = ktxDoc.lines[c.line] && ktxDoc.lines[c.line].pairs[key(c.tableFrom || c.from, c.tableTo || c.to)];
  check(`${label}: 원본 운임표 ${won(table)} = 회귀표 ${won(c.fare)}`, table === c.fare);
  const A = station(c.from, c.line), B = station(c.to, c.line);
  let app = null, how = '역 없음';
  if (A && B) {
    // 1) 그 노선 한 구간만 탔을 때 내역 (운임표 조회가 맞는지)
    const d = RC.calcFareDetail({ legs: [{ lineId: c.line, from: A.id, to: B.id, distKm: 100 }] }, 100);
    const p = d.parts.find(x => x.kind === 'ktx');
    check(`${label}: 한 구간 내역 = 공식 ${won(c.fare)}`, p && p.fare === c.fare && p.basis === 'official', p && `${p.fare} ${p.basis}`);
    // 2) 실제 길찾기 '최적' 결과에서 KTX 몫
    const t = RC.findAll(A.id, B.id).time;
    const kp = t && t.fareDetail.parts.filter(x => x.kind === 'ktx');
    if (kp && kp.length === 1 && kp[0].basis === 'official') { app = kp[0].fare; how = '길찾기 최적'; }
    else how = t ? `KTX ${kp ? kp.length : 0}구간 ${kp && kp.map(x => x.basis).join('/')}` : '경로 없음';
  }
  check(`${label}: 길찾기 KTX 몫 ${won(app)} (${how}) = ${won(c.fare)}`, app === c.fare);
  rows.push([label, '-', c.fare, app, FIX.sources.ktx.effective, '(주)에스알 통합 운임표']);
}

console.log('\n[별도 운임] 운영사 공식');
for (const c of FIX.special) {
  const label = `${c.from}→${c.to}`;
  const A = station(c.from, c.fromLine), B = station(c.to, c.fromLine);
  const r = A && B && RC.findAll(A.id, B.id, { includeUnopened: false }).now;
  const fd = r && RC.calcFareDetail(r, r.distKm || 0);
  check(`${label}: 앱 ${won(fd && fd.total)} = 공식 ${won(c.fare)}`, fd && fd.total === c.fare, fd && fd.parts.map(p => p.kind + ':' + p.fare).join('+'));
  rows.push([label, '-', c.fare, fd ? fd.total : null, FIX.sources.special.effective, '운영사 공식 요금']);
}

console.log('\n── 요금 회귀표 ──');
console.log(['경로', '거리', '기대', '앱', '기준일', '출처'].join(' | '));
rows.forEach(r => console.log([r[0], r[1], won(r[2]), (r[3] === r[2] ? '' : '✗ ') + won(r[3]), r[4], r[5]].join(' | ')));
console.log(`\n대표 경로 ${rows.length}개 · 결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
