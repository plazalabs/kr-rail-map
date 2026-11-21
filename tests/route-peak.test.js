// 길찾기 '배차 넣기' (정반합 8차 A6, 2026-11-15)
//  기본: 탄 순간부터(처음 열차 기다림 0, 드문 열차만 배차 절반) — 회장님 결정, 앱들과 같은 기준
//  켜면(KR_WAIT 'peak'): 처음 탈 때도 그 방향 출퇴근 배차의 절반을 기다린다 — 축지법 순위 '배차 포함'(allTimesFrom peakWait)과 같은 규칙
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const L = read('data/lines.geojson'), S = read('data/stations.geojson'), H = read('data/headways.json');
const src = fs.readFileSync(path.join(ROOT, 'js/route.js'), 'utf8').replace('const RouteFinder', 'globalThis.RouteFinder');
const ctx = vm.createContext({ console, Math, Map, Set, Array, Object, JSON, Infinity });
vm.runInContext(src, ctx);
const RF = ctx.RouteFinder;
RF.buildGraph(L.features, S.features);
RF.loadTransfers(read('data/transfer-times.json'));
RF.loadHeadways(H);
const nm = Object.fromEntries(S.features.map(f => [f.properties.id, f.properties.name_ko]));
const cap = f => { const [x, y] = f.geometry.coordinates; return x > 126.5 && x < 127.6 && y > 37.0 && y < 38.0; };
const by = n => (S.features.find(f => f.properties.name_ko === n && cap(f)) || {}).properties.id;
let pass = 0, fail = 0;
const check = (name, ok, info) => { if (ok) { pass++; console.log('  ok  ' + name); } else { fail++; console.log('  ✗  ' + name + (info ? ' — ' + info : '')); } };

console.log('[길찾기 배차 넣기 — findRoute peakWait]');
check('RouteFinder.boardWait 를 내보냄 (화면 탭 계산이 같은 규칙을 쓰게)', typeof RF.boardWait === 'function');
const pairs = [['광운대', '강남'], ['시청', '강남'], ['수원', '서울'], ['홍대입구', '잠실'], ['일산', '여의도']];
for (const [a, b] of pairs) {
  const A = by(a), B = by(b);
  const r0 = RF.findRoute(A, B, { openOnly: true });
  const r1 = RF.findRoute(A, B, { openOnly: true, peakWait: true });
  if (!r0 || !r1) { check(`${a}→${b} 경로 있음`, false); continue; }
  // 같은 길이면 차이 = 처음 탈 때 기다림(배차 절반) — 반올림 1분 여유
  const fw = r1.firstWait || 0;
  check(`${a}→${b}: 배차 넣으면 늘기만 함 (${r0.minutes} → ${r1.minutes}분, 처음 기다림 ${fw.toFixed(1)})`, r1.minutes >= r0.minutes);
  const same = r0.path.join() === r1.path.join();
  if (same) {
    const hw = RF.peakWaitAt(r1.legs.find(l => l.lineId).run || r1.legs.find(l => l.lineId).lineId, r1.path[0], r1.path[1]);
    check(`${a}→${b}: 같은 길이면 늘어난 분 ≈ 처음 탈 때 배차 절반 (${hw.toFixed(1)}분)`, Math.abs((r1.minutes - r0.minutes) - (hw - (r0.firstWait || 0))) <= 1, `${r1.minutes - r0.minutes} vs ${hw}`);
  }
  // 일반열차(무궁화 — 수원→서울)는 접근 시간 12분에 기다림이 이미 들어 있어 처음 기다림 0 (이중 계산 안 함)
  const conv = r1.legs.find(l => l.lineId) && RF.categoryOf && RF.categoryOf(r1.legs.find(l => l.lineId).lineId) === 'conventional';
  check(`${a}→${b}: 결과에 firstWait(처음 열차 기다림 분)를 실음${conv ? ' — 일반열차는 0' : ''}`, typeof r1.firstWait === 'number' && (conv ? r1.firstWait === 0 : r1.firstWait > 0) && typeof r0.firstWait === 'number');
}
// 축지법 순위 '배차 포함'(allTimesFrom peakWait)과 길찾기 '배차 넣기'가 같은 분을 말한다 — 표본 비교
{
  let n = 0, ok = 0; const bad = [];
  const sample = ['광운대', '시청', '수원', '잠실', '홍대입구', '사당', '노원', '부평'].map(by).filter(Boolean);
  for (const A of sample) {
    const m = RF.allTimesFrom(A, { openOnly: true, peakWait: true });
    for (const B of sample) {
      if (A === B) continue;
      const r = RF.findRoute(A, B, { openOnly: true, peakWait: true });
      if (!r || m.get(B) == null) continue;
      n++;
      if (Math.abs(r.minutes - m.get(B)) <= 1) ok++; else bad.push(`${nm[A]}→${nm[B]} ${r.minutes}/${m.get(B)}`);
    }
  }
  check(`순위 '배차 포함'과 길찾기 '배차 넣기'가 같은 분(±1) — ${ok}/${n}`, n > 40 && ok / n >= 0.95, bad.slice(0, 5).join(', '));
}
console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
