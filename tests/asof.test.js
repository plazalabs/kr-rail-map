/* 자료 기준일 표 시험 (H5, 2026-11-14) — data.html 표가 자료 파일에 적힌 날짜와 같은지(손으로 고친 낡은 표가 아닌지)
 * 실행: node tests/asof.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { rows } = require(path.join(ROOT, 'data/build_asof.js'));
let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}  ${detail === undefined ? '' : JSON.stringify(detail).slice(0, 300)}`); }
}
const page = fs.readFileSync(path.join(ROOT, 'data.html'), 'utf8');
const block = (page.match(/<!-- asof:start[\s\S]*?<!-- asof:end -->/) || [''])[0];
const R = rows();
check('data.html 에 #asof 표', /id="asof"/.test(block));
check('자료 8가지 이상', R.length >= 8, R.length);
check('표의 기준일이 지금 자료 파일 값과 같음 (node data/build_asof.js 로 다시 만들 것)', R.every(r => block.includes(r.date)), R.filter(r => !block.includes(r.date)).map(r => r.what + ' ' + r.date));
check('시세·가격 흐름·미래 노선·역간 시간 기준일이 따로 있음', ['주변 시세', '가격 흐름', '미래 노선', '역간 소요시간'].every(k => R.some(r => r.what.includes(k))), R.map(r => r.what));
check('시세 줄에 다음 갱신 예정일 (4차 N4)', /다음 갱신 예정 \d{4}년 \d+월 첫 주/.test(block));
check('빈 기준일 없음', R.every(r => r.date && !/undefined|NaN/.test(r.date)), R.map(r => r.date));
console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
