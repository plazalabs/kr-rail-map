/* 거래 5건 미만 시세 숨기기 (숙제 3, D-33) — 실행: node tests/price-few.test.js
 *   자료: station-price.json 은 5건 미만 역·법정동에 중위값을 내지 않고 건수만 준다.
 *   화면: 역 상세 시세 절은 값 대신 '거래 적음 (N건)', 타일·비교표도 같은 말.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}  ${detail === undefined ? '' : JSON.stringify(detail).slice(0, 300)}`); }
}

console.log('[자료 data/station-price.json]');
const d = JSON.parse(read('data/station-price.json'));
const MIN = d.minDeals;
check('minDeals = 5 가 자료에 적혀 있다', MIN === 5, MIN);
const few = Object.entries(d.stations).filter(([, p]) => p.deals < 5);
check('5건 미만 역은 중위 평당가·중위 금액이 없다', few.every(([, p]) => p.medianPerPyeong == null && p.medianPrice == null), few.filter(([, p]) => p.medianPerPyeong != null).map(([k]) => k));
check('5건 미만 역도 건수는 남긴다 (거래 적음(N건) 표시용)', few.length > 0 && few.every(([, p]) => p.deals > 0));
check('법정동 표(districts)도 같은 규칙', d.districts.every(x => x.deals >= 5 || (x.medianPerPyeong == null && x.medianPrice == null)));

console.log('\n[화면 — 소스 모양]');
const sd = read('js/station-detail.js'), mm = read('js/market-map.js'), pr = read('js/price.js');
const sec = (sd.match(/function priceSection\(sid\) \{[\s\S]*?\n  \}/) || [''])[0];
check('역 상세: 거래 적음이면 값 대신 "거래 적음 (N건)"', /거래 적음 \(' \+ price\.deals \+ '건\)/.test(sec), sec.slice(0, 200));
check('역 상세: 값이 없다고 절을 말없이 지우지 않는다', !/if \(!price \|\| !price\.medianPerPyeong\) return '';/.test(sec));
check('타일: 거래 적음 판단은 건수로만 (값이 없어도)', /raw && raw\.deals < 5 \? '거래 적음'/.test(mm));
check('비교표: 거래 적음(N건)', /거래 적음\(' \+ p\.deals \+ '건\)/.test(mm));
check('시세 역 수는 값 있는 역만 센다', /medianPerPyeong != null/.test((pr.match(/meta\.nStations[\s\S]{0,400}/) || [''])[0] + (pr.match(/for \(var k in byId\)[^\n]*/) || [''])[0]));

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
