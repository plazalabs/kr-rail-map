/* 역 대표 노선·노선 필터 회귀 시험 (IMPL12 건 1)
 * 실행: node tests/linefilter.test.js
 *   - line_id 없는 역 0개
 *   - line_id 가 자기 lines 에 없는 역 = 근거 없어 보류한 목록(서대전)뿐
 *   - 환승역(lines 2개 이상) 전부: 대표 아닌 노선만 켜도 역 점 필터를 통과
 *   - 켜진 노선이 하나도 없으면 아무 역도 통과하지 않음 (예전 동작과 같음)
 *   - ui.js 의 필터 함수를 그대로 꺼내 평가한다 (브라우저 DOM 없이)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const ST = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stations.geojson'), 'utf8')).features;
let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}  ${detail === undefined ? '' : detail}`); }
}

// 근거가 없어 고치지 않은 역 (data/fix_line_id_consistency.py 보류 목록과 같아야 한다)
const HELD = new Set(['st-6006354021']);   // 서대전: lines 2개, 대표 노선을 데이터만으로 정할 수 없음

console.log('[데이터] 대표 노선');
const noLid = ST.filter(s => !s.properties.line_id);
check('line_id 없는 역 0개', noLid.length === 0, noLid.map(s => s.properties.id).join(','));
const notMember = ST.filter(s => s.properties.line_id && !(s.properties.lines || []).includes(s.properties.line_id));
check('line_id 가 자기 lines 에 없는 역 = 보류 목록뿐', notMember.length === HELD.size && notMember.every(s => HELD.has(s.properties.id)),
  notMember.map(s => s.properties.id + ':' + s.properties.name_ko).join(','));
for (const id of ['st-8083915082', 'st-4818002014', 'st-1444692971']) {
  const s = ST.find(x => x.properties.id === id);
  check(`${s.properties.name_ko}: line_id = 그 역의 유일한 노선 ${s.properties.lines[0]}`, s.properties.line_id === s.properties.lines[0]);
}

// ui.js 에서 필터 함수 3개만 꺼낸다
const ui = fs.readFileSync(path.join(ROOT, 'js/ui.js'), 'utf8');
const m = ui.match(/function stationLineIds[\s\S]*?\n  function lineFilterExpr[\s\S]*?\n  }\n/);
check('ui.js 에 stationLineIds·linesKey·lineFilterExpr 가 있음', !!m);
const ctx = {};
vm.createContext(ctx);
vm.runInContext(m[0] + '\nthis.F = { stationLineIds, linesKey, lineFilterExpr };', ctx);
const F = ctx.F;

// MapLibre 식 평가기 (쓰이는 것만: any / == / in(문자열 부분일치) / get)
const ev = (e, p) => {
  if (!Array.isArray(e)) return e;
  switch (e[0]) {
    case 'any': return e.slice(1).some(x => ev(x, p));
    case '==': return ev(e[1], p) === ev(e[2], p);
    case 'in': return String(ev(e[2], p)).includes(ev(e[1], p));
    case 'get': return p[e[1]];
    default: return e;
  }
};
const props = s => Object.assign({}, s.properties, { lines_key: F.linesKey(s.properties) });

console.log('\n[필터] 환승역');
const multi = ST.filter(s => (s.properties.lines || []).length >= 2);
check(`환승역 수 ${multi.length}개 (lines 2개 이상)`, multi.length >= 274);
let lost = [];
for (const s of multi) {
  const p = props(s);
  for (const l of s.properties.lines) {
    if (l === s.properties.line_id) continue;
    if (!ev(F.lineFilterExpr([l]), p)) lost.push(s.properties.name_ko + ':' + l);
  }
}
check('환승역 전부: 대표 아닌 노선만 켜도 표시됨 (예전엔 사라짐)', lost.length === 0, lost.slice(0, 5).join(','));
const gangnam = ST.find(s => s.properties.name_ko === '강남' && s.properties.lines.includes('seoul-subway-line-2'));
check('켜진 노선 없음 → 표시 안 됨', !ev(F.lineFilterExpr([]), props(gangnam)));
check('관계없는 노선만 켬 → 표시 안 됨', !ev(F.lineFilterExpr(['busan-metro-line-1']), props(gangnam)));
// 부분 문자열 오탐 방지: 'line-1' 이 'line-10' 같은 id 에 걸리면 안 된다 ('|' 경계)
check("노선 id 앞뒤 '|' 경계로 부분일치 오탐 없음", !ev(F.lineFilterExpr(['seoul-subway-line']), props(gangnam)));
check('lines 가 없으면 line_id 로 대체', F.linesKey({ line_id: 'x-1' }) === '|x-1|' && F.linesKey({}) === '||');

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
