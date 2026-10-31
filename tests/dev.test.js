/* 공급(앞으로 들어올 세대) 테스트 — 의존성 없이 실행: node tests/dev.test.js
 *
 * 두 가지를 본다.
 *   1) data/station-dev.json 이 스스로 모순되지 않는가
 *      — 확정+계획이 총계와 같은가, 연도별 합이 총계와 같은가.
 *        이게 깨지면 화면에 '1,200세대'와 '확정 800 · 계획 300' 이 같이 뜬다.
 *   2) 화면이 0세대와 '자료 없음'을 구별하는가
 *      — 둘을 같은 문장으로 보여주면 사이트가 거짓말을 한다.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const Dev = require(path.join(ROOT, 'js/dev.js'));

let pass = 0, fail = 0;
const fails = [];
function check(name, ok, detail) {
  if (ok) { pass++; return; }
  fail++; fails.push(name + (detail ? '  (' + detail + ')' : ''));
}
function section(t) { console.log('\n[' + t + ']'); }

// ---------------------------------------------------------------- 자료
const file = path.join(ROOT, 'data/station-dev.json');
const has = fs.existsSync(file);
const doc = has ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;

section('파일 구조');
check('station-dev.json 이 있다', has);
if (has) {
  check('source 를 밝힌다', /주택인허가/.test(doc.source || ''), doc.source);
  check('입도를 밝힌다', /법정동/.test(doc.basis || ''), doc.basis);
  check('역 표가 있다', doc.stations && Object.keys(doc.stations).length > 100,
    doc.stations && Object.keys(doc.stations).length);
}

// ---------------------------------------------------------------- 모순 없음
if (has) {
  section('숫자가 맞는다');
  let bad = 0, badYear = 0, badHh = 0, neg = 0;
  for (const [name, r] of Object.entries(doc.stations)) {
    if (r.overdue > r.hh) { bad++; if (bad < 4) fails.push('지남 ' + name); }
    if (r.hh < 0 || r.overdue < 0) neg++;
    const ys = Object.values(r.byYear || {}).reduce((a, b) => a + b, 0);
    // 연도별 합은 총계와 같아야 한다. 단, 연도가 없는 건(예정일 없음)은
    // 애초에 '앞으로'로 세지 않으므로 여기 들어오지 않는다.
    if (ys !== r.hh) { badYear++; if (badYear < 4) fails.push('연도 ' + name + ' ' + ys + '/' + r.hh); }
    const ls = (r.list || []).reduce((a, c) => a + c.h, 0);
    if (ls > r.hh) badHh++;
  }
  check('착공예정 지난 물량이 총계를 넘지 않는다', bad === 0, bad + '곳');
  check('연도별 합 = 총계 (전 역)', badYear === 0, badYear + '곳');
  check('음수 없음', neg === 0, neg + '곳');
  check('목록 합이 총계를 넘지 않는다', badHh === 0, badHh + '곳');

  section('목록');
  const top = Object.entries(doc.stations).sort((a, b) => b[1].hh - a[1].hh)[0];
  check('가장 많은 역은 1,000세대 이상', top && top[1].hh >= 1000, top && top[0] + ' ' + top[1].hh);
  const withList = Object.values(doc.stations).filter(r => (r.list || []).length);
  check('사업 목록이 붙은 역이 있다', withList.length > 50, withList.length);
  const maxList = Math.max(...withList.map(r => r.list.length));
  check('목록은 6건까지만', maxList <= 6, maxList);
  check('목록은 세대수 큰 것부터', withList.every(r =>
    r.list.every((c, i) => i === 0 || r.list[i - 1].h >= c.h)));
  check('법정동 이름이 있다', Object.values(doc.stations).every(r => r.dong));

  section('기간');
  const ys = new Set();
  for (const r of Object.values(doc.stations)) {
    for (const y of Object.keys(r.byYear || {})) ys.add(+y);
  }
  const nowY = new Date().getFullYear();
  check('연도는 올해 이후만', [...ys].every(y => y >= nowY), [...ys].filter(y => y < nowY).join(','));
  check('10년 안쪽 연도만', [...ys].every(y => y <= nowY + 12),
    [...ys].filter(y => y > nowY + 12).join(','));
}

// ---------------------------------------------------------------- 화면
section('화면 — 0세대와 자료 없음을 구별한다');
const sample = {
  sgg: '팔달구', dong: '매산동', cnt: 2, hh: 1200, overdue: 800,
  byYear: { 2027: 800, 2028: 400 },
  list: [
    { n: '래미안 <테스트>', h: 800, y: 2027, stp: '2025-06-01' },
    { n: '힐스테이트', h: 400, y: 2028, stp: '2027-01-01' },
  ],
  recent: { cnt: 2, hh: 300, byYear: { 2024: 300 } },
};
Dev.setDoc({ stations: { '수원': sample, '한빛': Object.assign({}, sample, {
  cnt: 0, hh: 0, started: 0, planned: 0, byYear: {}, list: [], recent: null }) } });

const h = Dev.sectionHtml('수원');
check('총 세대수를 보여준다', /1,200/.test(h));
check('착공예정일이 지난 물량을 알려준다', /착공예정일이 지난/.test(h) && /800/.test(h));
check('착공 여부는 알 수 없다고 밝힌다', /착공 여부를 알 수 없습니다/.test(h));
check('연도를 보여준다', /2027/.test(h) && /2028/.test(h));
// 목록에는 연도만 낸다. 착공예정일을 같이 넣으면 바로 앞의 연도와 헷갈린다.
check('사업별 예정 연도를 보여준다', /2027년/.test(h) && /2028년/.test(h));
check('목록에 날짜를 넣지 않는다', !/2025-06/.test(h));
check('최근 입주를 같이 보여준다', /최근 입주/.test(h) && /300/.test(h));
check('법정동 단위라고 밝힌다', /법정동/.test(h) && /단위입니다/.test(h) && /매산동/.test(h));
check('이름을 이스케이프한다', /&lt;테스트&gt;/.test(h) && !/<테스트>/.test(h));

const zero = Dev.sectionHtml('한빛');
check('0세대는 0이라고 말한다', /없습니다/.test(zero) && !/자료가 없습니다/.test(zero));

const none = Dev.sectionHtml('없는역');
check('자료 없는 역은 자료가 없다고 말한다', /자료를 받지 못한 동네/.test(none));
check('자료 없음을 0세대라고 하지 않는다', !/0세대/.test(none));

check('of() 는 없는 역에 null', Dev.of('없는역') === null);
check('brief() 요약', Dev.brief('수원').hh === 1200 && Dev.brief('수원').overdue === 800);
check('빈 문서는 거부한다', Dev.setDoc({}) === false && Dev.setDoc(null) === false);

console.log('\n결과: ' + pass + '개 통과, ' + fail + '개 실패');
if (fail) {
  console.log('\n실패 목록');
  fails.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}
