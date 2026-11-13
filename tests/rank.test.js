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

console.log('\n[등급] 떡상·상승·보합·상대 하락·신규');
check('▲100 이상 떡상', RT.tierOf({ change: 236 }) === 'rocket' && RT.tierOf({ change: 100 }) === 'rocket');
check('▲10~99 상승', RT.tierOf({ change: 10 }) === 'up' && RT.tierOf({ change: 99 }) === 'up');
check('▲9 ~ ▼49 보합', RT.tierOf({ change: 9 }) === 'flat' && RT.tierOf({ change: -49 }) === 'flat');
check('▼50 이상 상대 하락', RT.tierOf({ change: -50 }) === 'down');
check('지금 갈 수 없던 역은 신규', RT.tierOf({ isNew: true, change: null }) === 'new');
check('개통 연도 읽기', RT.yearOf('2031년 목표 (2026년 9월 착공)') === 2031 && RT.yearOf('1단계: 2033년 목표') === 2033 && RT.yearOf('미정') === null);
{
  const c = RT.compute(doc, { weight: 'avg', region: 'capital' });
  const n = RT.tierCounts(c.rows);
  check('등급 수 합 = 역 수', Object.values(n).reduce((a, b) => a + b, 0) === c.rows.length, JSON.stringify(n));
  const k = c.rows.find(r => r.name === '광운대');
  check('광운대는 떡상', RT.tierOf(k) === 'rocket', k && k.change);
  // 개통 연도별 (2026-11-12) — 그 해까지 개통한 노선만
  // 2026-11-13: 수도권에 역이 있는 노선만 연도 단계 — 2028(광주2·대전2)·2026(양산선)은 수도권 순위를 안 바꾸는 빈 단추였다
  check('연도 단계 2027·2030·2031·2033·2035', JSON.stringify(doc.years) === '[2027,2030,2031,2033,2035]', JSON.stringify(doc.years));
  check('2031년 개통 노선 = GTX-B·C·C 상록수 갈래', (doc.year_lines['2031'] || []).sort().join() === 'gtx-b,gtx-c,gtx-c-sangnoksu', JSON.stringify(doc.year_lines['2031']));
  check('시기 미정 노선은 연도 단계에 없음 (평택 연장·동부선·GTX-G·H)', ['gtx-a-pyeongtaek', 'dongbu-line', 'gtx-g', 'gtx-h'].every(x => doc.undated_lines.includes(x)));
  const at = y => RT.compute(doc, { weight: 'avg', region: 'capital', at: y }).rows.find(r => r.name === '광운대');
  const k27 = at(2027), k31 = at(2031);
  // 2026-11-12 코레일 구간 공식 시각표 시간: 광운대 지금 25/42/28분 (전엔 추정 26/44/24)
  check('광운대 2027년: 아직 GTX-C 전 — 지금과 같은 시간', k27 && k27.aft.times.join() === k27.now.times.join(), k27 && k27.aft.times.join() + ' / 지금 ' + k27.now.times.join());
  check('광운대 2031년: GTX-C 개통 — 9/15/9분, 10위 안', k31 && k31.aft.times.join() === '9,15,9' && k31.aft.rank <= 10, k31 && k31.aft.rank);
  const kRow = doc.rows.find(r => r.n === '광운대');
  check('연도별 시간은 해가 갈수록 늘지 않는다 (개통은 길을 더할 뿐)', doc.rows.every(r => { let p = r.now; return doc.years.every(y => { const v = r.y[y]; const ok = v.every((t, i) => t == null || p[i] == null || t <= p[i]); p = v; return ok; }); }), kRow && JSON.stringify(kRow.y));
  const cn = doc.rows.find(r => r.n === '창릉');
  check('창릉은 2030년부터 생긴다', cn && cn.y['2027'].every(v => v == null) && cn.y['2030'].every(v => v != null), cn && JSON.stringify(cn.y));
  check('GTX-C 개통 연도가 2031년 (2026-09 착공·60개월)', RT.yearOf((doc.lines['gtx-c'] || {}).o) === 2031, (doc.lines['gtx-c'] || {}).o);
}

console.log('\n[⏱ 출퇴근 배차] data/headways.json — 공식 시간표로 센 값, 추정은 개통 전 노선만');
{
  const H = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/headways.json'), 'utf8'));
  const L = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/lines.geojson'), 'utf8')).features;
  const status = new Map(L.map(f => [f.properties.id, f.properties.status]));
  const official = Object.entries(H.lines).filter(([, v]) => v.src === 'official');
  const est = Object.entries(H.lines).filter(([, v]) => v.src !== 'official');
  check('공식 값 노선 30개 이상', official.length >= 30, official.length);
  check('추정은 개통 전 노선뿐 (운행 중 노선 추정 0)', est.every(([id]) => status.get(id) && status.get(id) !== 'open'), est.filter(([id]) => status.get(id) === 'open').map(([id]) => id).join(','));
  check('공식 값마다 출처가 적혀 있음', official.every(([, v]) => /시각표|운행정보|국토교통부/.test(v.source || '')));
  const st = (id, n) => (H.lines[id].stations || {})[n];
  check('2호선 강남 3.2분 · 1호선 수원 6.7분 · 경춘선 중앙 20분 (시각표에서 센 값)', st('seoul-subway-line-2', '강남') === 3.16 && st('seoul-metropolitan-subway-line-1', '수원') === 6.67 && H.lines['seoul-metropolitan-subway-gyeongchun-line'].min === 20);
  check('GTX-A 운정중앙~서울역 6.25분 (국토부), 수서~동탄 17분', H.lines['great-train-express-line-a'].min === 6.25 && H.lines['great-train-express-line-a'].south_min === 17);
  const c0 = RT.compute(doc, { weight: 'avg', region: 'capital' }), c1 = RT.compute(doc, { weight: 'avg', region: 'capital', wait: true });
  const k0 = c0.rows.find(r => r.name === '광운대'), k1 = c1.rows.find(r => r.name === '광운대');
  check('배차 포함하면 시간이 늘기만 한다 (광운대 9/15/9 → 12/19/12)', k1 && k1.aft.times.join() === '12,19,12' && k1.aft.times.every((t, i) => t >= k0.aft.times[i]), k1 && k1.aft.times.join());
  check('배차 포함 광운대 수도권 10위 안', k1 && k1.aft.rank <= 10, k1 && k1.aft.rank);
  check('모든 역이 배차 포함 값을 가짐 (now_w·aft_w·y_w)', doc.rows.every(r => Array.isArray(r.now_w) && Array.isArray(r.aft_w) && r.y_w && Object.keys(r.y_w).length === doc.years.length));
  const html2 = fs.readFileSync(path.join(ROOT, 'rank.html'), 'utf8');
  check('순위표에 ⏱ 배차 포함 스위치 (기본 꺼짐, 주소 wait=1)', /id="wait" aria-pressed="false"/.test(html2) && /qs\.get\('wait'\) === '1'/.test(html2));
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
// 2026-11-12 레시피 비공개: 계산법은 지우고 '숫자 읽는 법'(정의)만 남긴다
check('숫자 읽는 법: 시간 정의·배차 스위치 뜻·점수·등급·추정값', /숫자 읽는 법/.test(html) && /타고 가는 시간 \+ 갈아탈 때 걷는 시간/.test(html) &&
  /점수<\/b> = 100 − 세 곳 평균 분/.test(html) && /떡상 100계단 이상/.test(html) && /추정값/.test(html));
check('계산 계수·자료 처리 과정을 적지 않음', !/0\.41|0\.413|1\.79|중앙값|94%|07~09시|열차 수를 세어/.test(html));
check('역을 누르면 지도 + 떡상 패널로 (?rocket=1&st=, v109)', /\.\/\?rocket=1&st=/.test(html));
// 예외는 방문 통계 Umami 하나뿐 (회장님 확정 2026-11-12, 쿠키 없음) — 그 밖의 바깥 스크립트는 여전히 금지
check('밖에서 불러오는 스크립트 없음 (Umami 통계만 예외)', !/<script[^>]+src="https?:/.test(html.replace(/<script defer src="https:\/\/cloud\.umami\.is\/script\.js"[^>]*><\/script>/g, '')));
check('링크 미리보기 그림 og-rank.jpg (1200×630, 300KB 아래)', /og:image" content="[^"]+\/image\/og-rank\.jpg"/.test(html) && fs.existsSync(path.join(ROOT, 'image/og-rank.jpg')) && fs.statSync(path.join(ROOT, 'image/og-rank.jpg')).size < 300 * 1024);
// 글자 대비 (WCAG AA 4.5) — 라이트 모드 등급 글자색(--i-*)이 흰 바탕·연한 등급 바탕 위에서 (2026-11-12)
{
  const v = name => { const m = new RegExp('--' + name + ':(#[0-9a-fA-F]{6})').exec(html); return m && m[1]; };
  const lum = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(x => x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const bad = [];
  for (const t of ['rocket', 'up', 'flat', 'down', 'new']) {
    const ink = v('i-' + t), bg = v('t-' + t + '-bg');
    if (!ink || !bg) { bad.push(t + ' 색 없음'); continue; }
    const a = cr(ink, '#ffffff'), b = cr(ink, bg);
    if (a < 4.5 || b < 4.5) bad.push(t + ' ' + a.toFixed(2) + '/' + b.toFixed(2));
  }
  const mu = v('muted');
  if (!mu || cr(mu, '#ffffff') < 4.5 || cr(mu, '#f6f7f9') < 4.5) bad.push('muted ' + mu);
  check('라이트 모드 글자 대비 4.5 이상 (등급 글자·흐린 글자)', bad.length === 0, bad.join(', '));
}
const app = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
check('지도가 ?st= 를 받아 역 상세를 연다', /q\.get\('st'\)/.test(app));
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
// 작업 5(2026-11-12): 지도 범례의 '순위표 →' 는 지웠다 — 순위는 지도 안 떡상 패널(./?rocket=1)에서. rank.html 은 검색 유입용으로 남김
check('지도 범례에 rank.html 링크 없음', !/href="rank\.html"/.test(idx));
check('게시판·자료 머리 메뉴에 떡상 랭킹(지도 패널)', ['board.html', 'data.html'].every(f => fs.readFileSync(path.join(ROOT, f), 'utf8').includes('href="./?rocket=1"')));
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
check('서비스워커 앱 셸에 rank.html·rank.js', /'\.\/rank\.html'/.test(sw) && /'\.\/js\/rank\.js'/.test(sw));

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
