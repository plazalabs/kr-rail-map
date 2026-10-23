/* 역 검색 순위 테스트 — 의존성 없이 실행: node tests/search.test.js
 *
 * 검색은 '내가 친 글자에 가장 가까운 역'이 맨 위에 와야 한다.
 * 예전에는 name.includes() 로 거른 뒤 데이터 순서대로 잘라서
 * '서울' 을 치면 서울역이 아닌 역이 위에 왔다.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const stations = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stations.geojson'), 'utf8'));

const ctx = vm.createContext({ console, Math, Set, Array, Object, String, module: { exports: {} } });
ctx.globalThis = ctx;
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/search.js'), 'utf8'), ctx);
const SS = ctx.module.exports;

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}  ${detail || ''}`); }
}
const top = (q, n = 5) => SS.search(stations.features, q, { limit: n });
const first = q => (top(q, 1)[0] || {}).feature;
const name = q => { const f = first(q); return f ? f.properties.name_ko : '(없음)'; };

console.log('\n[정확도] 친 그대로인 역이 1등');
check('강남 → 강남', name('강남') === '강남', name('강남'));
check('서울 → 서울', name('서울') === '서울', name('서울'));
check('부산 → 부산', name('부산') === '부산', name('부산'));
check('대전 → 대전', name('대전') === '대전', name('대전'));
check('광주송정 → 광주송정', name('광주송정') === '광주송정', name('광주송정'));

console.log('\n[접두] 앞글자만 쳐도 그 역이 먼저');
check('강남 → 강남 (접두)', name('강남') === '강남');
// 데이터의 역명은 '서울' 이고 '서울역' 은 별칭이다
check('서울역 → 서울 (별칭)', name('서울역') === '서울', name('서울역'));
check('판교 → 판교', name('판교') === '판교', name('판교'));

console.log('\n[초성] ㄱㄴ → 강남');
check('ㄱㄴ → 강남', name('ㄱㄴ') === '강남', name('ㄱㄴ'));
check('ㅅㅇ → 서울', name('ㅅㅇ') === '서울', name('ㅅㅇ'));
// ㄱㅂ 은 개봉·강변 둘 다 똑같이 맞는다 — 둘 다 나오면 된다
check('ㄱㅂ → 강변이 결과에 포함', top('ㄱㅂ', 12).some(h => h.feature.properties.name_ko === '강변'),
  top('ㄱㅂ', 5).map(h => h.feature.properties.name_ko).join(','));

console.log('\n[오타] 한 글자 틀려도 찾아야 함');
check('간남 → 강남', name('간남') === '강남', name('간남'));
check('서욱 → 서울', name('서욱') === '서울', name('서욱'));

// 사람들은 역 이름 뒤에 '역' 을 붙여 친다. 데이터에는 '역' 이 없으니 떼고도 봐야 한다.
console.log('\n[뒷글자] 이름 뒤에 붙인 "역" 은 무시');
check('강남역 → 강남', name('강남역') === '강남', name('강남역'));
check('부산역 → 부산', name('부산역') === '부산', name('부산역'));
check('서울역 → 서울', name('서울역') === '서울', name('서울역'));
check('강남역 이 강남대보다 위', name('강남역') === '강남', name('강남역'));

// 초성만 친 것을 자모 편집거리로 재면 엉뚱한 역이 걸린다.
// 'ㅇㄴㄹㅇㅇㄴ' 과 '일원'(ㅇㅣㄹㅇㅓㄴ) 은 자모 거리가 2 라 예전엔 일원이 나왔다.
console.log('\n[초성 오탐] 초성 입력은 초성 경로로만 판정');
check('ㅇㄴㄹㅇㅇㄴ → 결과 없음', top('ㅇㄴㄹㅇㅇㄴ', 12).length === 0,
  top('ㅇㄴㄹㅇㅇㄴ', 5).map(h => h.feature.properties.name_ko).join(','));
check('ㅂㅎㅅㅇㅇ → 북한산우이', name('ㅂㅎㅅㅇㅇ') === '북한산우이', name('ㅂㅎㅅㅇㅇ'));

console.log('\n[별칭] FRDB·철맘 표기 차이');
check('419민주묘지 → 4.19민주묘지', name('419민주묘지') === '4.19민주묘지', name('419민주묘지'));
check('110정거장 → 월계2교', name('110정거장') === '월계2교', name('110정거장'));
check('월계2교 교차로 → 월계2교', name('월계2교 교차로') === '월계2교', name('월계2교 교차로'));

console.log('\n[영문] Gangnam → 강남');
check('gangnam → 강남', name('gangnam') === '강남', name('gangnam'));
check('seoul → 서울', name('seoul') === '서울', name('seoul'));

console.log('\n[정리] 결과 개수·빈 결과');
check('없는 이름은 빈 배열', top('zzzz').length === 0, top('zzzz').length);
check('limit 을 넘지 않음', top('역', 3).length <= 3, top('역', 3).length);
check('빈 문자열은 빈 배열', top('').length === 0, top('').length);
check('공백만 있어도 빈 배열', top('   ').length === 0, top('   ').length);

console.log('\n[동명이역] 같은 이름이 여럿이면 둘 다 나옴');
const jong = SS.search(stations.features, '종합운동장', { limit: 5 })
  .filter(h => h.feature.properties.name_ko === '종합운동장');
check('종합운동장(서울·부산) 2건', jong.length === 2, `${jong.length}건`);

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
