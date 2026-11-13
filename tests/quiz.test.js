/* 나에게 맞는 역 찾기 (js/quiz.js Logic) — TOP 3 규칙·예산·주소
 * 실행: node tests/quiz.test.js
 */
'use strict';
const path = require('path');
const Q = require(path.join(__dirname, '..', 'js', 'quiz.js')).Logic;
let pass = 0, fail = 0;
const check = (l, c, d) => { if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; console.log(`  ✗ ${l}  ${d === undefined ? '' : JSON.stringify(d)}`); } };

const now = [{ id: 'a', name: '가', min: 20 }, { id: 'b', name: '나', min: 30 }, { id: 'c', name: '다', min: 40 }, { id: 'd', name: '라', min: 25 }, { id: 'D', name: '목적', min: 0 }];
const aft = [{ id: 'a', name: '가', min: 18 }, { id: 'b', name: '나', min: 15 }, { id: 'c', name: '다', min: 22 }, { id: 'd', name: '라', min: 25 }, { id: 'n', name: '새역', min: 35 }];
const price = { a: 90000, b: 60000, c: 40000, d: 120000 };
const pr = id => price[id] == null ? null : price[id];

console.log('\n[지금 기준]');
let r = Q.pick(now, null, pr, { budget: 0, withUnopened: false, dest: 'D' });
check('가까운 순 가·라·나, 목적지 역 뺌', r.top.map(x => x.name).join() === '가,라,나', r.top);
r = Q.pick(now, null, pr, { budget: 70000, withUnopened: false, dest: 'D' });
check('예산 7억: 나(6억)·다(4억)만', r.top.map(x => x.name).join() === '나,다' && r.pool === 2, r);
const withNull = now.concat([{ id: 'z', name: '시세없음', min: 5 }]);
r = Q.pick(withNull, null, pr, { budget: 200000, withUnopened: false });
check('예산을 고르면 시세 없는 역은 뺌(0원 취급 안 함)', !r.top.some(x => x.id === 'z'));
r = Q.pick(withNull, null, pr, { budget: 0, withUnopened: false, dest: 'D' });
check('예산 상관없음이면 시세 없는 역도 들어감', r.top[0].id === 'z');

console.log('\n[개통 예정 포함]');
r = Q.pick(now, aft, pr, { budget: 0, withUnopened: true, dest: 'D' });
check('신규 역이 맨 앞, 그다음 많이 줄어드는 순(다 −18, 나 −15)', r.top.map(x => x.name).join() === '새역,다,나', r.top.map(x => [x.name, x.gain]));
check('줄어드는 분 = 지금 − 개통 후', r.top[1].gain === 18 && r.top[1].minNow === 40 && r.top[1].min === 22);
check('규칙 문장을 돌려준다', /가장 많이 줄어드는/.test(r.rule));

console.log('\n[주소]');
const qs = Q.toQuery({ dest: 'st-1', limit: 60, budget: 100000, withUnopened: true });
check('toQuery', qs === '?quiz=1&d=st-1&t=60&b=100000&u=1', qs);
const back = Q.fromQuery(qs);
check('fromQuery 왕복', back.dest === 'st-1' && back.limit === 60 && back.budget === 100000 && back.withUnopened === true, back);
check('엉뚱한 값은 기본값으로', Q.fromQuery('?quiz=1&d=x&t=999&b=-5').limit === 45 && Q.fromQuery('?quiz=1&d=x&t=999&b=-5').budget === 0);
check('quiz=1 아니면 null', Q.fromQuery('?a=1') === null);
check('예산 글자', Q.budgetLabel(0) === '상관없음' && Q.budgetLabel(70000) === '7억원 이하');

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
