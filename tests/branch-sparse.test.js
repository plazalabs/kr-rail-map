// 갈래(지선) 운행 · 드문 열차 · 방향별 공식 배차 (2026-11-15, 회장님 지적 — 광운대→강남·삼성이 너무 가깝게 나옴)
//  ① 청량리 수인분당은 평일 하루 9대(출근 1대)인데 노선 평균 6분 배차로 계산 → 가짜 최적길 '청량리 갈아타기'
//  ② 2호선 성수지선(신설동~성수)을 본선과 한 줄로 이어 성수에서 안 갈아타는 것으로 계산
//  ③ 광운대 경춘선(출근 2시간에 1대)을 처음 탈 때 기다림 0 → 가장 빠른 길로 뽑힘
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
// 수도권 역만 (같은 이름의 지방 역을 고르지 않게)
const cap = f => { const [x, y] = f.geometry.coordinates; return x > 126.5 && x < 127.6 && y > 37.0 && y < 38.0; };
const by = n => (S.features.find(f => f.properties.name_ko === n && cap(f)) || {}).properties.id;
let pass = 0, fail = 0;
const check = (name, ok, info) => { if (ok) { pass++; console.log('  ok  ' + name); } else { fail++; console.log('  ✗  ' + name + (info ? ' — ' + info : '')); } };
const desc = r => r.legs.map(l => `${l.lineId}${l.branch ? '(' + l.branch + ')' : ''}:${nm[l.from]}→${nm[l.to]}`).join(' | ');
const usesSuinAt = (r, st) => r.legs.some(l => l.lineId === 'suin-bundang-line' && (nm[l.from] === st));

console.log('[배차 자료 — 공식 시간표 평일 07~09시]');
const sb = H.lines['suin-bundang-line'];
check('청량리→왕십리 수인분당 = 120분 (출근 1대)', sb.dir && sb.dir['청량리>왕십리'] === 120, JSON.stringify(sb.dir && sb.dir['청량리>왕십리']));
check('수인분당 청량리 역 값도 남김(예전엔 1대라 버렸다)', sb.stations['청량리'] === 120);
const l2 = H.lines['seoul-subway-line-2'];
check('성수지선 신설동→용두 배차가 본선보다 드묾(> 6분)', l2.dir['신설동>용두'] > 6, l2.dir['신설동>용두']);
check('성수 본선(건대입구 쪽) 배차는 촘촘(< 5분)', l2.dir['성수>건대입구'] < 5, l2.dir['성수>건대입구']);
const l9 = H.lines['seoul-subway-line-9'];
check('9호선 여의도 일반 다음역(샛강) 쪽에 급행도 셈 (< 4분)', l9.dir['여의도>샛강'] < 4, l9.dir['여의도>샛강']);

console.log('[길찾기 — 지금 운행 노선]');
const kw = by('광운대');
for (const d of ['강남', '삼성', '선릉']) {
  const r = RF.findRoute(kw, by(d), { openOnly: true });
  check(`광운대→${d}: 청량리에서 수인분당 안 탐 (${r.minutes}분 · ${desc(r)})`, !usesSuinAt(r, '청량리'));
  check(`광운대→${d}: 광운대에서 경춘선 안 탐(출근 2시간에 1대)`, !(r.legs[0].lineId === 'seoul-metropolitan-subway-gyeongchun-line'), desc(r));
  if (d !== '선릉') check(`광운대→${d}: 탄 순간부터 43분 이상 (예전 가짜 길 → 회장님 길 약 51분)`, r.minutes >= 43, r.minutes);
}
// 회장님 길 (광운대-동묘앞-약수-신사-강남, 환승 3) — 계산 시간이 약 51분 근처
let hand = 0;
for (const [a, b] of [['광운대', '동묘앞'], ['동묘앞', '약수'], ['약수', '신사'], ['신사', '강남']]) hand += RF.findRoute(by(a), by(b), { openOnly: true }).minutes;
check(`회장님 길 타는 시간만 합 30~40분 (${hand}분)`, hand >= 30 && hand <= 40);

console.log('[갈래(지선) — 성수·신도림에서 갈아탐]');
const r1 = RF.findRoute(by('신설동'), by('삼성'), { openOnly: true, transferPenalty: 30 });
const viaBranch = r1.legs.some(l => l.branch === '성수지선');
check(`신설동→삼성(환승 최소): 성수지선을 타면 성수에서 갈아탐 (${desc(r1)}, 환승 ${r1.transfers})`,
  !viaBranch || (r1.legs.some(l => l.branch === '성수지선' && nm[l.to] === '성수') && r1.transfers >= 1));
const r2 = RF.findRoute(by('용답'), by('건대입구'), { openOnly: true });
check(`용답→건대입구: 성수지선 → 성수에서 본선으로 환승 1 (${desc(r2)})`, r2.transfers === 1 && r2.legs[0].branch === '성수지선' && nm[r2.legs[0].to] === '성수', `환승 ${r2.transfers}`);
check('성수 지선→본선 환승 걷기 = 공식 19초 → 1분', r2.legs[0].transferAfter === 1, r2.legs[0].transferAfter);
const r3 = RF.findRoute(by('양천구청'), by('문래'), { openOnly: true });
check(`양천구청→문래: 신정지선 → 신도림에서 갈아탐 (${desc(r3)})`, r3.transfers >= 1 && r3.legs[0].branch === '신정지선');
const r4 = RF.findRoute(by('용두'), by('용답'), { openOnly: true });
check('용두→용답: 지선 안에서는 환승 0', r4.transfers === 0 && r4.legs.length === 1);
check('결과 legs 의 lineId 는 원래 노선(지도 색·이름이 깨지지 않게)', r2.legs[0].lineId === 'seoul-subway-line-2');

console.log('[순위(기다림 빼는 계산)에서도 드문 열차는 기다림]');
const nw = RF.allTimesFrom(kw, { openOnly: true, noWait: true });
const wt = RF.allTimesFrom(kw, { openOnly: true });
check(`광운대→선릉 순위용 ${nw.get(by('선릉'))}분 ≤ 길찾기용 ${wt.get(by('선릉'))}분`, nw.get(by('선릉')) <= wt.get(by('선릉')));
check(`광운대→선릉 순위용이 예전 가짜 값(청량리 수인분당, 기다림 0) 보다 짧지 않음 ≥ 32`, nw.get(by('선릉')) >= 32, nw.get(by('선릉')));
// 정반합 8차 A4 (11-15): 옥수(미타사)는 ITX-청춘이 하루 몇 대만 서는 역 — 길찾기가 '옥수에서 내려 3호선'을 기본 길로 고르지 않는다
{
  const cc = S.features.find(f => f.properties.name_ko === '춘천').properties.id;
  const r = RF.findRoute(cc, by('강남'), { openOnly: true });
  check(`춘천→강남: ITX-청춘을 옥수에서 내리지 않음 (${r.minutes}분 · ${desc(r)})`, !r.legs.some(l => nm[l.to] === '옥수' || nm[l.from] === '옥수'));
}
// 경춘선 광운대 열차 정차 순서 (11-15, 레일포털 시각표): 광운대 → 상봉(달리는 시간 480초) → 망우. 지도 선만 보고 광운대–망우를 바로 잇지 않는다
{
  const GC = 'seoul-metropolitan-subway-gyeongchun-line';
  const nb = RF.adjacency().get(kw).filter(e => !e.walk && e.lineId === GC).map(e => nm[e.to]);
  check(`경춘선 광운대의 다음 역은 상봉 하나 (${nb.join(',')})`, nb.length === 1 && nb[0] === '상봉');
  const r = RF.findRoute(kw, by('망우'), { openOnly: true });
  check(`광운대→망우 10분 이상 (상봉 8분 + 망우 2분 — 전엔 4.4분) (${r.minutes}분 · ${desc(r)})`, r.minutes >= 10);
}

console.log(`\n결과: ${pass}개 통과, ${fail}개 실패`);
process.exit(fail ? 1 : 0);
