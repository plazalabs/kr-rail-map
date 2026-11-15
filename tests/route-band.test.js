// 길찾기 시간대 '출근 7~9시 / 평시 10~16시' (정반합 8차 A5, 2026-11-15)
//  data/headways-off.json = 같은 공식 시각표(서울교통공사 15098251 · 레일포털 id=900)를 평일 10~16시로 센 배차
//  평시를 고르면 그 계산 동안만 배차표를 바꿔 끼운다 — 계산이 끝나면 출근 배차로 돌아온다(순위·타일은 출근 기준 그대로)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const L = read('data/lines.geojson'), S = read('data/stations.geojson');
const P = read('data/headways.json'), O = read('data/headways-off.json');
const src = fs.readFileSync(path.join(ROOT, 'js/route.js'), 'utf8').replace('const RouteFinder', 'globalThis.RouteFinder');
const ctx = vm.createContext({ console, Math, Map, Set, Array, Object, JSON, Infinity });
vm.runInContext(src, ctx);
const RF = ctx.RouteFinder;
RF.buildGraph(L.features, S.features);
RF.loadTransfers(read('data/transfer-times.json'));
RF.loadHeadways(P);
const cap = f => { const [x, y] = f.geometry.coordinates; return x > 126.5 && x < 127.6 && y > 37.0 && y < 38.0; };
const by = n => (S.features.find(f => f.properties.name_ko === n && cap(f)) || {}).properties.id;
let pass = 0, fail = 0;
const check = (name, ok, info) => { if (ok) { pass++; console.log('  ok  ' + name); } else { fail++; console.log('  ✗  ' + name + (info ? ' — ' + info : '')); } };

console.log('[평시 배차 자료]');
check("band 'off' · 평일 10~16시 · 공식 노선 30개 이상", O.band === 'off' && /10~16시/.test(O.basis) && Object.values(O.lines).filter(v => v.src === 'official').length >= 30);
const st = (D, id, n) => (D.lines[id].stations || {})[n];
check('2호선 강남: 평시가 출근보다 드묾 (3.48 → 5.26)', st(O, 'seoul-subway-line-2', '강남') > st(P, 'seoul-subway-line-2', '강남'), st(O, 'seoul-subway-line-2', '강남'));
check('경의중앙 회기: 평시 16분대 (출근 9.8)', st(O, 'gyeongui-jungang-line', '회기') > 15, st(O, 'gyeongui-jungang-line', '회기'));
check('평시 공식 값이 없는 손 입력 노선(에버라인 퇴근 4분 글 등)은 추정 표시', O.lines['yongin-light-rail-transit'].src === 'estimate' && /평시 공식 값 없음/.test(O.lines['yongin-light-rail-transit'].source));
check('출근 자료는 그대로 (band peak, 2호선 강남 3.48)', P.band === 'peak' && st(P, 'seoul-subway-line-2', '강남') === 3.48);

console.log('[길찾기 — withBand]');
check('평시 자료 받기 전: hasHeadwaysOff false, withBand 는 그냥 출근 계산', RF.hasHeadwaysOff() === false);
RF.loadHeadwaysOff(O);
const A = by('광운대'), B = by('강남'), C = by('홍대입구'), D = by('잠실');
for (const [a, b, an, bn] of [[A, B, '광운대', '강남'], [C, D, '홍대입구', '잠실']]) {
  const p0 = RF.findRoute(a, b, { openOnly: true });
  const o0 = RF.withBand('off', () => RF.findRoute(a, b, { openOnly: true }));
  const p1 = RF.findRoute(a, b, { openOnly: true });
  // 같은 길이면 평시가 같거나 길다(배차가 드물어짐). 길이 바뀔 수는 있다 — 광운대 경춘선은 출근엔 2시간 1대(드문 열차)지만
  // 평시엔 30분 안쪽이라 '처음 탈 때 기다림 0' 열차가 되어 상봉→7호선 길이 뽑힌다(시간표 그대로의 결과)
  const sameP = p0.path.join() === o0.path.join();
  check(`${an}→${bn}: ${sameP ? '같은 길 — 평시가 같거나 김' : '평시엔 다른 길'} (${p0.minutes} → ${o0.minutes}분)`, sameP ? o0.minutes >= p0.minutes : o0.minutes >= p0.minutes - 3);
  check(`${an}→${bn}: 평시 계산 뒤엔 출근 값으로 돌아옴 (${p1.minutes})`, p1.minutes === p0.minutes);
}
{
  const p = RF.findRoute(A, B, { openOnly: true, peakWait: true });
  const o = RF.withBand('off', () => RF.findRoute(A, B, { openOnly: true, peakWait: true }));
  check(`배차 넣기 + 평시: 처음 기다림도 평시 배차 (${p.firstWait.toFixed(1)} → ${o.firstWait.toFixed(1)}분)`, o.firstWait > p.firstWait);
}
let threw = false;
try { RF.withBand('off', () => { throw new Error('x'); }); } catch (e) { threw = true; }
check('계산 중 오류가 나도 출근 배차로 돌아옴', threw && RF.findRoute(A, B, { openOnly: true }).minutes === RF.findRoute(A, B, { openOnly: true }).minutes && RF.peakWaitAt('seoul-subway-line-2', by('강남'), by('역삼')) < 2.5);
console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
