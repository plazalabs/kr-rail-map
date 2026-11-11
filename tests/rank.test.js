/* 교통 순위표 (rank.html · js/rank.js · data/rank.json) 시험
 * 실행: node tests/rank.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const RT = require(path.join(ROOT, 'js/rank.js'));
const SA = require(path.join(ROOT, 'js/access.js'));
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const doc = read('data/rank.json');
const access = read('data/access.json');

let pass = 0, fail = 0;
function check(name, ok, info) {
  if (ok) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info != null ? ' — ' + info : '')); }
}

console.log('\n[계산] 점수·가중 평균');
check('점수 = 100 − 평균 분', RT.scoreOf(11) === 89);
check('점수는 0 아래로 안 내려감', RT.scoreOf(140) === 0);
check('평균 1:1:1', RT.minutesOf([9, 15, 9], RT.WEIGHTS.avg) === 11);
check('GBD 중시 = (C + Y + 2G) / 4', RT.minutesOf([9, 15, 9], RT.WEIGHTS.gbd) === 10.5);
check('CBD 중시 = (2C + Y + G) / 4', RT.minutesOf([8, 16, 12], RT.WEIGHTS.cbd) === 11);
check('두 번 세는 곳이 비면 점수 없음', RT.minutesOf([10, 20, null], RT.WEIGHTS.gbd) === null);
check('값이 하나뿐이면 점수 없음', RT.minutesOf([10, null, null], RT.WEIGHTS.avg) === null);

console.log('\n[공동 순위]');
{
  const toy = { rows: [
    { n: '가', id: 'a', r: '서울', l: [], now: [10, 10, 10], aft: [5, 5, 5] },
    { n: '나', id: 'b', r: '서울', l: [], now: [6, 6, 6], aft: [5, 5, 5] },
    { n: '다', id: 'c', r: '경기', l: [], now: [7, 7, 7], aft: [9, 9, 9] },
    { n: '라', id: 'd', r: '부산', l: [], now: [null, null, null], aft: [50, 50, 50] },
  ] };
  const c = RT.compute(toy, { weight: 'avg', region: 'all' });
  const by = n => c.rows.find(r => r.name === n);
  check('같은 점수는 같은 순위(공동 1위)', by('가').aft.rank === 1 && by('나').aft.rank === 1 && by('가').tie);
  check('공동 다음은 건너뛴 순위(3위)', by('다').aft.rank === 3, by('다').aft.rank);
  check('지금 순위 → 개통 후 순위 변동', by('가').change === 2 && by('다').change === -1, by('가').change + ',' + by('다').change);
  check('지금 갈 수 없던 역은 신규', by('라').isNew && by('라').change === null);
  check('오름 순 정렬: 많이 오른 역이 먼저, 신규는 뒤', RT.sortRows(c.rows, 'rise').map(r => r.name).join('') === '가나다라',
    RT.sortRows(c.rows, 'rise').map(r => r.name).join(''));
  check('지역 거르기: 서울', RT.compute(toy, { region: 'seoul' }).total === 2);
  check('지역 거르기: 수도권', RT.compute(toy, { region: 'capital' }).total === 3);
}

console.log('\n[자료] data/rank.json');
check('역 1,000곳 이상', doc.rows.length >= 1000, doc.rows.length);
check('access.json 과 날짜가 같다 (같이 다시 만들었는지)', doc.updated === access.updated, doc.updated + ' / ' + access.updated);
const cap = doc.rows.filter(r => ['서울', '경기', '인천'].includes(r.r));
check('수도권 600곳 이상에 지역이 붙음', cap.length >= 600, cap.length);
const nm = n => doc.rows.filter(r => r.n === n);
check('서울 시청·강남·여의도는 서울', ['시청', '강남', '여의도'].every(n => nm(n).some(r => r.r === '서울')));
check('경계 역 바로잡기: 까치울·갈매·풍무는 경기', ['까치울', '갈매', '풍무'].every(n => nm(n).every(r => r.r === '경기')));
check('부산 서면은 수도권이 아님', nm('서면').every(r => r.r === '부산'));
check('노선 색 정보', Object.values(doc.lines).every(l => l.n && /^#/.test(l.c || '#')));

console.log('\n[결론] 광운대 — 회장님 숫자와 맞는지');
{
  const k = nm('광운대')[0];
  // 2026-11-12 GTX 자체 산출 (광운대~삼성 9분 노원구 발표값 포함) — 회장님 숫자와 같다
  check('광운대 개통 후 CBD 9 / YBD 15 / GBD 9', k && k.aft.join() === '9,15,9', k && k.aft.join());
  const c = RT.compute(doc, { weight: 'avg', region: 'capital' });
  const kr = c.rows.find(r => r.name === '광운대');
  check('수도권 평균 10위 안 (공동 9위)', kr && kr.aft.rank <= 10, kr && kr.aft.rank);
  check('개통 후 100계단 넘게 오름', kr && kr.change > 100, kr && kr.change);
  check('수도권 1위는 서울역', RT.sortRows(c.rows, 'after')[0].name === '서울');
}

console.log('\n[일치] 역 상세의 순위와 순위표 전국 순위가 같다');
{
  SA.setDoc(access);
  const all = RT.compute(doc, { weight: 'avg', region: 'all' });
  const gbd = RT.compute(doc, { weight: 'gbd', region: 'all' });
  let bad = 0, n = 0;
  for (const name of ['광운대', '서울', '청량리', '노원', '동탄', '일산', '수서']) {
    const row = all.rows.find(r => r.name === name);
    const grow = gbd.rows.find(r => r.name === name);
    if (!row) continue;
    const a = SA.of(row.id);
    n++;
    // 역 상세는 동점을 이름 순서로 끊고, 순위표는 공동 순위 — 순위표 순위 ≤ 상세 순위 ≤ 순위표 순위 + 동점 수
    const cnt = all.rows.filter(r => r.aft.score === row.aft.score).length;
    const gcnt = gbd.rows.filter(r => r.aft.score === grow.aft.score).length;
    const ok = a && a.rank.after.rank >= row.aft.rank && a.rank.after.rank < row.aft.rank + cnt &&
      a.rank.gbd.rank >= grow.aft.rank && a.rank.gbd.rank < grow.aft.rank + gcnt;
    if (!ok) { bad++; console.log('    ', name, a && a.rank.after.rank, row.aft.rank, cnt, a && a.rank.gbd.rank, grow.aft.rank, gcnt); }
  }
  check('표본 ' + n + '역 순위 일치 (동점 범위 안)', bad === 0 && n >= 6, bad);
}

console.log('\n[화면] rank.html');
const html = fs.readFileSync(path.join(ROOT, 'rank.html'), 'utf8');
check('rank.js 를 불러옴', /<script src="js\/rank\.js"><\/script>/.test(html));
check('기준 버튼 4개 (평균·CBD·YBD·GBD 중시)', ['avg', 'cbd', 'ybd', 'gbd'].every(v => html.includes('data-v="' + v + '"')));
check('지역 버튼 (서울·수도권·전국)', ['seoul', 'capital', 'all'].every(v => html.includes('data-v="' + v + '"')));
check('기다리는 시간을 뺐다고 밝힘', /기다리는 시간은 넣지 않았습니다/.test(html));
check('역을 누르면 지도로 (?st=)', /\.\/\?st=/.test(html));
check('밖에서 불러오는 스크립트 없음', !/<script[^>]+src="https?:/.test(html));
const app = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
check('지도가 ?st= 를 받아 역 상세를 연다', /q\.get\('st'\)/.test(app));
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
check('분석 메뉴에 교통 순위표 링크', /href="rank\.html"/.test(idx));
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
check('서비스워커 앱 셸에 rank.html·rank.js', /'\.\/rank\.html'/.test(sw) && /'\.\/js\/rank\.js'/.test(sw));

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
