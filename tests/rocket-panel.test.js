/* 지도 안 떡상 패널 (js/rocket-panel.js) 의 순수 계산 시험
 * 실행: node tests/rocket-panel.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.RankTable = require(path.join(ROOT, 'js/rank.js'));
const RP = require(path.join(ROOT, 'js/rocket-panel.js'));
const L = RP.Logic;
const doc = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/rank.json'), 'utf8'));

let pass = 0, fail = 0;
function check(name, ok, info) {
  if (ok) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info != null ? ' — ' + JSON.stringify(info) : '')); }
}

console.log('\n[문장] 받침에 따라 은/는');
check('광운대 → 광운대는', L.topic('광운대') === '광운대는');
check('의정부 → 의정부는', L.topic('의정부') === '의정부는');
check('창동 → 창동은', L.topic('창동') === '창동은');
check('삼성 → 삼성은', L.topic('삼성') === '삼성은');
check('DMC → DMC는 (한글 아님)', L.topic('DMC') === 'DMC는');
check('공동 순위 글', L.rankText(8, true) === '공동 8위' && L.rankText(3, false) === '3위' && L.rankText(null) === '—');

console.log('\n[기본 연도] 떡상 역 수의 80% 를 처음 넘는 해');
const dy = L.defaultYear(doc);
const count = at => RankTable.compute(doc, { weight: 'avg', region: 'capital', at }).rows.filter(r => RankTable.tierOf(r) === 'rocket').length;
check('기본 연도가 자료의 연도 중 하나', doc.years.map(String).includes(dy), dy);
check('그 해 떡상 수 ≥ 전체의 80%', count(dy) >= count('all') * 0.8, [dy, count(dy), count('all')]);
const before = doc.years.map(String).filter(y => +y < +dy);
check('그 앞 해들은 80% 미만', before.every(y => count(y) < count('all') * 0.8), before.map(y => [y, count(y)]));

console.log('\n[제목] 문장형');
const res = at => RankTable.compute(doc, { weight: 'avg', region: 'capital', at }).rows;
const kw = res(dy).find(r => r.name === '광운대');
check('광운대가 자료에 있다', !!kw);
if (kw) {
  const b = L.bestDest(kw);
  const t = L.titleOf(kw, dy);
  check('가장 많이 빨라지는 곳의 개통 후 분이 제목에', t === dy + '년, 광운대는 ' + L.DEST[b.i] + '까지 ' + kw.aft.times[b.i] + '분', t);
  check('가장 많이 빨라지는 곳이 맞다', [0, 1, 2].every(i => kw.now.times[i] - kw.aft.times[i] <= b.gain), [kw.now.times, kw.aft.times, b]);
  check("'전체' 는 '모두 개통하면'", L.titleOf(kw, 'all').startsWith('모두 개통하면 광운대는 '));
}
const flat = res(dy).find(r => r.change === 0 && !r.isNew);
if (flat) check('안 오르는 역은 \'…년에도 N위\'', L.titleOf(flat, dy) === L.topic(flat.name) + ' ' + dy + '년에도 ' + L.rankText(flat.aft.rank, flat.tie), L.titleOf(flat, dy));
check('역을 안 고르면 질문', L.titleOf(null, dy) === '개통하면 우리 역은 몇 등이 될까요?');

console.log('\n[곡선] 연도별 순위');
if (kw) {
  const pts = L.curvePoints(doc, kw.id, { weight: 'avg', wait: false });
  check('점 = 지금 + 연도 수', pts.length === doc.years.length + 1, pts.length);
  check('첫 점은 지금 순위', pts[0].k === '지금' && pts[0].rank === kw.now.rank, pts[0]);
  const at = pts.find(p => p.k === dy);
  check('기본 연도 점 = 순위표 개통 후 순위', at && at.rank === kw.aft.rank, at);
  const cp = L.curvePath(pts, 132, 52, 6);
  const ys = cp.xy.map(q => q[1]);
  const best = Math.min(...pts.map(p => p.rank));
  check('1등에 가까울수록 위 (가장 좋은 순위가 가장 위)', ys[pts.findIndex(p => p.rank === best)] === Math.min(...ys));
  check('경로가 M 으로 시작하고 C 가 점-1 개', cp.d.startsWith('M') && (cp.d.match(/C/g) || []).length === pts.length - 1);
}
check('점 1개면 경로 없음', L.curvePath([{ k: '지금', rank: 3 }], 100, 40, 4).d === '');

console.log('\n[새 노선] 오르게 하는 노선과 개통 연도');
if (kw) {
  const nl = L.newLinesOf(doc, kw.src ? { lines: kw.lines } : kw);
  check('광운대의 새 노선 중 GTX-C (2031)', nl.some(x => x.n === 'GTX-C' && x.y === '2031'), nl);
  check('운행 중 노선은 빠진다', nl.every(x => doc.lines[x.id].s !== 'open'));
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
