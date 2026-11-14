/* 과업 측정 이벤트 (종합피드백 12장 A③) — node tests/track.test.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js/track.js'), 'utf8');

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); } else { fail++; console.log(`  ✗ ${label}  ${detail || ''}`); }
}
function load(store) {
  const sent = [];
  const win = { umami: { track: (n, d) => sent.push([n, d]) }, localStorage: store };
  vm.runInContext(src, vm.createContext({ window: win, Date, JSON, String }));
  return { T: win.KRTrack, sent };
}
const mem = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; };

console.log('\n[과업 이벤트]');
const store = mem();
const a = load(store);
a.T.task('search');
check('첫 방문: 과업 이벤트 1개, 단계·첫방문·걸린시간', a.sent.length === 1 && a.sent[0][0] === '과업' &&
  a.sent[0][1].단계 === '역 검색 성공' && a.sent[0][1].첫방문 === '예' && a.sent[0][1].걸린시간 === '30초 안', JSON.stringify(a.sent));
a.T.task('search');
check('같은 단계는 한 페이지에서 한 번만', a.sent.length === 1);
a.T.task('route'); a.T.task('price'); a.T.task('top3');
check('네 단계 이름', a.sent.map(s => s[1].단계).join(',') === '역 검색 성공,길찾기 결과,시세 상세,TOP3 카드', a.sent.map(s => s[1].단계).join(','));
a.T.task('없는단계');
check('모르는 단계는 보내지 않음', a.sent.length === 4);

const b = load(store);
b.T.task('route');
check('다시 온 사람은 첫방문 = 아니오', b.sent[0][1].첫방문 === '아니오', JSON.stringify(b.sent));

const c = load({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } });
c.T.task('price');
check('저장소가 막혀도 동작 (첫방문 = 모름)', c.sent.length === 1 && c.sent[0][1].첫방문 === '모름');

const B = a.T._bucket;
check('시간 구간: 29초/30초/119초/299초/300초', [29e3, 30e3, 119e3, 299e3, 300e3].map(B).join(',') === '30초 안,2분 안,2분 안,5분 안,5분 넘게',
  [29e3, 30e3, 119e3, 299e3, 300e3].map(B).join(','));

console.log('\n[연결] 단계를 부르는 곳');
const has = (f, s) => fs.readFileSync(path.join(ROOT, f), 'utf8').includes(s);
check("app.js: 역 검색 → task('search')", has('js/app.js', "KRTrack.task('search')"));
check("app.js: 길찾기 결과가 있을 때만 task('route')", has('js/app.js', "if (found) if (window.KRTrack && KRTrack.task) KRTrack.task('route')"));
check("station-detail.js: 시세 탭 → task('price')", has('js/station-detail.js', "key === 'p' && global.KRTrack && global.KRTrack.task) global.KRTrack.task('price')"));
check("market-map.js: 타일 역 카드 → task('price')", has('js/market-map.js', "global.KRTrack.task('price')"));
check("home-cards.js: TOP3 카드 → task('top3')", has('js/home-cards.js', "global.KRTrack.task('top3')"));

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
