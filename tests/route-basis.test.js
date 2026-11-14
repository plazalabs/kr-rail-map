/* 경로 결과 '근거' 한 줄 테스트 — node tests/route-basis.test.js
 *
 * J3 (2026-11-14 UX 종합 리뷰): 시간·요금이 무엇으로 계산됐는지, 무엇을 안 넣었는지,
 * 실제 출발 전 어디서 확인하는지를 결과 카드에 '보이는 글'로 적는다 (마우스 올림 설명은 휴대폰에서 안 보인다).
 * 공식 운행시간으로 낸 구간과 평균 속도로 어림한 구간을 같은 숫자처럼 섞어 보이지 않게 한다.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const lines = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/lines.geojson'), 'utf8'));
const stations = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stations.geojson'), 'utf8'));
const ctx = vm.createContext({
  console, Math, Map, Set, Array, Object, JSON, Infinity, Promise, encodeURIComponent,
  document: { getElementById: () => null, createElement: () => ({ style: {}, appendChild() {} }),
    head: { appendChild() {} }, addEventListener() {} },
  window: {},
});
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/route.js'), 'utf8').replace('const RouteFinder', 'globalThis.RouteFinder'), ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/route-compare.js'), 'utf8').replace('const RouteCompare', 'globalThis.RouteCompare'), ctx);
const RF = ctx.RouteFinder, RC = ctx.RouteCompare;
RF.buildGraph(lines.features, stations.features);
RC.init(RF, stations.features, lines.features);

let pass = 0, fail = 0;
const check = (label, cond, detail) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label + '  ' + (detail || '')); } };
const id = n => stations.features.filter(f => f.properties.name_ko === n)
  .sort((a, b) => b.properties.lines.length - a.properties.lines.length)[0].properties.id;
const basis = RC._debug.basisHtml;

// 수도권 전철(서울교통공사 구간만) → 전부 공식 운행시간
const sg = RC.findAll(id('서울'), id('강남')).now;
check('서울→강남: 달리는 시간 100% 공식', sg && sg.officialShare >= 0.995, sg && sg.officialShare);
const hs = basis(sg);
check('서울→강남: 근거 글에 공식 운행시간 기준', />시간: 공식 운행시간 · /.test(hs), hs);
check('서울→강남: 출처·시간표/급행/지연 미반영은 설명(title)에', /title="[^"]*서울교통공사[^"]*시간표·급행·첫 열차 기다리는 시간·지연은 넣지 않은 예상값/.test(hs), hs);
const note = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
check('보이는 안내(rp-note)에 시간표·급행·지연 미반영', /class="rp-note"[^>]*>[^<]*시간표·급행·지연 미반영/.test(note));
check('서울→강남: 카카오맵 대중교통 링크(공식 형식 by/traffic/이름,위도,경도)', hs.includes('https://map.kakao.com/link/by/traffic/' + encodeURIComponent('서울역') + ',37.5') &&
  hs.includes(',126.9') && hs.includes('/' + encodeURIComponent('강남역') + ',37.49') && hs.includes(',127.0'), hs);
check('서울→강남: 전철만이면 코레일 링크 없음', !hs.includes('korail.com'), hs);
check('새 창 링크는 rel=noopener', !/target="_blank"(?![^>]*rel="noopener")/.test(hs), hs);

// KTX — 공식 운행시간 자료가 아직 없다(평균 속도). 그렇다고 정확히 적어야 한다
const sb = RC.findAll(id('서울'), id('부산')).now;
check('서울→부산 KTX: 공식 운행시간 몫 0', sb && sb.officialShare === 0, sb && sb.officialShare);
const hb = basis(sb);
check('서울→부산: 평균 속도 어림이라고 적음', /평균 속도 어림/.test(hb), hb);
check('서울→부산: 코레일 링크', hb.includes('https://www.korail.com/'), hb);

// 섞인 경로 — 몫을 % 로
const mixed = RC.findAll(id('서울'), id('강남')).transfer;
if (mixed && mixed.officialShare > 0.005 && mixed.officialShare < 0.995) {
  check('섞인 경로: N% 공식, 나머지 어림', /\d+% 공식·/.test(basis(mixed)) && /나머지 어림/.test(basis(mixed)), basis(mixed));
}
check('경로 없으면 빈 글', basis(null) === '' && basis({ legs: [] }) === '');

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
