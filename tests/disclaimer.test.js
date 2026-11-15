/* 공유 카드·순위표 첫 줄 '집값 예측 아님'·기준일 시험 (Q3·Q7, 2026-11-15)
 * 카드가 퍼질 때 집값 예측처럼 읽히거나 언제 자료인지 모르게 되지 않게 — 6종 카드 + rank.html 첫 문단.
 * 실행: node tests/disclaimer.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}  ${detail === undefined ? '' : JSON.stringify(detail).slice(0, 300)}`); }
}

const rank = read('rank.html');
const lede = (rank.match(/<p class="lede">[\s\S]*?<\/p>/) || [''])[0];
check('rank.html 첫 문단에 집값·투자수익 예측 아님', /집값·투자수익 예측이 아닙니다/.test(lede), lede.slice(0, 120));

const rp = read('js/rank-page.js');
const card = (rp.match(/function shareCanvas[\s\S]*?return c;\s*\}/) || [''])[0];
check('rank.html 공유 카드: 예측 아님', /집값·투자수익 예측 아님/.test(card));
check('rank.html 공유 카드: 자료 기준일', /자료 기준 ' \+ doc\.updated/.test(card));

const ss = read('js/station-share.js');
check('앱 카드 공통 아래 띠: 예측 아님 + 기준일', /function cardFooter[\s\S]*?집값·투자수익 예측 아님[\s\S]*?자료 기준/.test(ss));
const footers = ss.match(/cardFooter\(k,[^\n]*\);/g) || [];
check('카드 5종(우리 역·TOP10·생활·길찾기·통근권)이 모두 아래 띠를 씀', footers.length >= 5, footers.length);
check('모든 아래 띠가 기준일을 넘김(빈 값 아님)', footers.every(f => /asof|updated|linesAsof/.test(f)), footers.filter(f => !/asof|updated|linesAsof/.test(f)));
check('길찾기·통근권 카드는 기준일이 없으면 노선 단계 확인일', (ss.match(/info\.asof \|\| linesAsof\(\)/g) || []).length >= 2);

const mm = read('js/market-map.js');
check('역 타일 카드: 예측 아님 + 기준', /집값이나 투자수익 예측이 아닙니다[^\n]*doc\.updated/.test(mm));

console.log(`\n${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
