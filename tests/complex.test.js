/* 단지 단위 시세 데이터 검사 — data/station-complex.json
 *
 * 법정동 중위값 하나만 주면 판단이 안 된다. 같은 잠실동에서도 1979년 5층과
 * 2008년 33층이 같은 값을 받지 않으므로 단지별로 나눠 담았다.
 *
 * 이 파일이 조용히 망가지는 경우가 몇 가지 있다. 전부 실제로 겪었다.
 *   - 범위 파일과 월별 파일을 같이 읽어 같은 거래가 두 번 들어간다
 *     → 건수가 부풀고 평당가가 이상해진다.
 *   - 계약해제를 안 빼서 취소된 거래가 시세에 섞인다.
 *   - 단지 1건짜리를 목록에 올려 그 거래의 층·수리 상태를 '단지 시세'로
 *     말하게 된다.
 *   - 역 이름 매칭이 어긋나 엉뚱한 동네 단지가 붙는다.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ✓ ' + name + (detail ? '  [' + detail + ']' : '')); }
  else { fail++; console.log('  ✗ ' + name + (detail ? '  [' + detail + ']' : '')); }
}
function section(t) { console.log('\n[' + t + ']'); }

const readJson = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const cx = readJson('data/station-complex.json');
const price = readJson('data/station-price.json');
const stations = readJson('data/stations.geojson');
const districts = cx.districts || {};
const stMap = cx.stations || {};

section('파일 기본');
check('districts 가 있다', Object.keys(districts).length > 0, Object.keys(districts).length + '곳');
check('stations 가 있다', Object.keys(stMap).length > 0, Object.keys(stMap).length + '곳');
check('기준 월이 있다', /^\d{4}-\d{2}$/.test(cx.updated || ''), cx.updated);
check('출처를 밝힌다', /국토교통부/.test(cx.source || ''), cx.source);
check('집계 기준을 밝힌다', /단지/.test(cx.basis || '') && /법정동/.test(cx.basis || ''), cx.basis);

section('역 연결이 실제 역 이름과 맞는다');
{
  // 공식 주소데이터는 '상봉(시외버스터미널)' 처럼 부기를 붙이고, 개명 전
  // 이름('총신대입구')을 쓰기도 한다. 그래서 이름을 세 단계로 맞춘다 —
  // 괄호 떼기, 끝의 '역' 떼기, 별칭 찾기. 검사도 같은 규칙으로 한다.
  const norm = n => String(n).replace(/\s*\(.*?\)\s*/g, '').trim();
  const names = new Set();
  const alias = {};
  for (const f of stations.features) {
    const p = f.properties;
    names.add(p.name_ko);
    for (const a of p.aliases || []) alias[a] = p.name_ko;
  }
  const resolves = n => {
    for (const c of [n, norm(n)]) if (names.has(c)) return true;
    const b = norm(n);
    if (b.endsWith('역') && names.has(b.slice(0, -1))) return true;
    if (alias[b] || alias[n]) return true;
    return false;
  };
  const ghost = Object.keys(stMap).filter(n => !resolves(n));
  check('없는 역 이름에 단지를 붙이지 않았다', ghost.length === 0,
    ghost.length ? ghost.slice(0, 5).join(', ') : '전부 실제 역');
  // 부기가 붙은 이름도 등록돼 있어야 한다. 이게 빠지면 상봉역처럼 공식
  // 이름에 부기가 있는 역에서 단지 목록이 통째로 안 뜬다.
  const withParen = Object.keys(stMap).filter(n => /\(/.test(n));
  check('부기 붙은 이름도 함께 등록', withParen.length > 0, withParen.length + '개');
  // 개명된 역은 옛 이름과 새 이름 양쪽에서 열려야 한다. 이수역은 지도에
  // '이수' 와 '총신대입구(이수)' 로 두 번 들어 있어 둘 다 확인한다.
  check('개명역(이수)이 두 이름 모두 열린다',
    !!stMap['이수'] && !!stMap['총신대입구(이수)'],
    (stMap['이수'] || 'X') + ' / ' + (stMap['총신대입구(이수)'] || 'X'));
}
{
  const badKey = Object.keys(stMap).filter(n => !districts[stMap[n]]);
  check('모든 역이 실제 법정동을 가리킨다', badKey.length === 0,
    badKey.length ? badKey.slice(0, 5).join(', ') : '전부');
}
{
  // 시세 요약과 단지 목록이 같은 법정동을 봐야 한다. 어긋나면 패널에서
  // 위에는 A동 값, 아래에는 B동 단지가 나온다.
  const mismatch = [];
  for (const [name, dk] of Object.entries(stMap)) {
    const p = price.stations[name];
    if (!p) continue;
    const dong = dk.split('|')[1];
    if (p.dong !== dong) mismatch.push(name + ':' + p.dong + '/' + dong);
  }
  check('시세 요약과 같은 법정동을 본다', mismatch.length === 0,
    mismatch.length ? mismatch.slice(0, 5).join(', ') : '전부 일치');
}

section('집계가 성립한다');
{
  let under = 0, over = 0, noPp = 0, total = 0, minDeals = Infinity;
  for (const d of Object.values(districts)) {
    for (const c of d.complexes || []) {
      total++;
      if (c.n_deals < 2) under++;
      minDeals = Math.min(minDeals, c.n_deals);
      if (c.pp == null) noPp++;
      // 평당가 상한 — 2026년 기준 국내 최고가 단지가 평당 3억 안쪽이다.
      // 이걸 넘으면 면적 단위를 잘못 읽은 것이다(㎡를 평으로 착각 등).
      if (c.pp != null && c.pp > 40000) over++;
    }
  }
  check('거래 2건 미만 단지가 없다', under === 0, under + '곳 / 전체 ' + total);
  check('평당가 없는 단지가 없다', noPp === 0, noPp + '곳');
  check('평당가가 비상식적이지 않다 (4억/평 이하)', over === 0, over + '곳');
  check('단지가 실제로 여러 곳 있다', total > 2000, total + '곳');
}
{
  // 평형대 합이 단지 건수와 같아야 한다. 다르면 밴드 계산에서 거래가 샜다.
  let bad = 0, checked = 0;
  for (const d of Object.values(districts)) {
    for (const c of d.complexes || []) {
      const sum = (c.bands || []).reduce((a, b) => a + b.n, 0);
      checked++;
      if (sum !== c.n_deals) bad++;
    }
  }
  check('평형대별 건수 합 = 단지 건수', bad === 0, bad + '곳 어긋남 / ' + checked + '곳 확인');
}
{
  // 준공연도는 건축년도다. 1900년 이전이나 미래가 나오면 파싱이 깨진 것.
  let bad = 0;
  for (const d of Object.values(districts)) {
    for (const c of d.complexes || []) {
      if (!c.y) continue;
      if (c.y < 1950 || c.y > 2027) bad++;
    }
  }
  check('준공연도가 상식 범위', bad === 0, bad + '곳');
}

section('평당가 순서');
{
  const unsorted = Object.values(districts).filter(d => {
    const list = (d.complexes || []).map(c => c.pp || 0);
    for (let i = 1; i < list.length; i++) if (list[i] > list[i - 1]) return true;
    return false;
  });
  check('단지가 평당가 높은 순으로 정렬됨', unsorted.length === 0,
    unsorted.length ? unsorted.length + '곳' : '전부');
}

section('세대수·공급면적 (K-apt)');
{
  // 세대수(h)·공급면적(sa)·전용률(pr)은 실거래가가 아니라 K-apt 에서 온다.
  // 단지명으로 이어 붙이므로, 이름이 어긋나면 조용히 사라진다. 사라지는 건
  // 괜찮지만 **틀린 값이 붙는 건 안 된다.** 그래서 범위를 잠근다.
  const all = [];
  for (const d of Object.values(districts)) for (const c of d.complexes || []) all.push(c);

  const withH = all.filter(c => c.h != null);
  const meta = cx.units || {};
  check('K-apt 출처를 밝힌다', /K-apt|공동주택/.test(meta.source || ''), meta.source || '없음');
  check('붙은 단지 수가 메타와 같다', withH.length === (meta.complexes || 0),
    withH.length + ' / ' + (meta.complexes || 0));
  check('메타의 분모가 전체 단지 수와 같다', (meta.of || 0) === all.length,
    (meta.of || 0) + ' / ' + all.length);

  check('세대수는 1 이상 정수', withH.every(c => Number.isInteger(c.h) && c.h > 0),
    withH.filter(c => !(Number.isInteger(c.h) && c.h > 0)).length + '곳 위반');

  // 10㎡ 미만이거나 500㎡ 를 넘는 '한 세대 평균'은 아파트가 아니다.
  // K-apt 의 kaptMarea 에 상가·주차장이 섞여 들어간 경우이고, 그런 값은 버려야 한다.
  const badBa = all.filter(c => c.ba != null && (c.ba < 10 || c.ba > 500));
  check('관리비부과면적이 상식 범위(10~500㎡)', badBa.length === 0, badBa.length + '곳');

  const badPr = all.filter(c => c.pr != null && (c.pr < 0.50 || c.pr > 0.98));
  check('전용률이 상식 범위(50~98%)', badPr.length === 0, badPr.length + '곳');

  // 공급면적은 세대수로 나눠서 나온다. 세대수가 없는데 면적만 있으면 계산이 틀린 것.
  check('면적이 있으면 세대수도 있다', all.every(c => c.ba == null || c.h != null),
    all.filter(c => c.ba != null && c.h == null).length + '곳 위반');

  // 전용면적은 공급면적보다 작아야 한다. 뒤집히면 필드 이름을 잘못 짚은 것이다.
  check('전용면적 < 공급면적', all.every(c => c.ea == null || c.ba == null || c.ea <= c.ba),
    all.filter(c => c.ea != null && c.ba != null && c.ea > c.ba).length + '곳 위반');

  // 평형 구성(bd)은 전용면적 구간별 세대수다. 합이 세대수와 어긋나면
  // 다른 필드(kaptMparea60 같은)를 잘못 짚었거나 둘 중 하나가 틀린 것이다.
  //
  // 다만 **정확히 같기를 요구하면 안 된다.** 같은 세대를 두 방식으로 센 값이라
  // 반올림·임대 포함 여부 때문에 ±1~3 은 실제로 어긋난다(5,301곳 중 61곳).
  // 그 이상 벌어지는 것(광진코지웰 296 vs 364)은 fetch_kapt 의 plausible() 이
  // 구성을 아예 버리므로 여기까지 오지 않는다. 그래서 여기서는 같은 기준
  // (max(2, 2%))으로만 본다 — 두 곳의 기준이 어긋나면 안 된다.
  const withBd = all.filter(c => Array.isArray(c.bd));
  check('평형 구성은 4개 구간', withBd.every(c => c.bd.length === 4),
    withBd.filter(c => c.bd.length !== 4).length + '곳 위반');
  const bdOff = withBd.filter(c => Math.abs(c.bd.reduce((a, b) => a + b, 0) - c.h) >
    Math.max(2, c.h * 0.02));
  check('평형 구성 합 ≈ 세대수 (±2 또는 2%)', bdOff.length === 0, bdOff.length + '곳 위반');
  check('평형 구성이 있으면 세대수도 있다', withBd.every(c => c.h != null),
    withBd.filter(c => c.h == null).length + '곳 위반');
  check('평형 구성은 음수 없음', withBd.every(c => c.bd.every(n => Number.isInteger(n) && n >= 0)),
    withBd.filter(c => c.bd.some(n => !(Number.isInteger(n) && n >= 0))).length + '곳 위반');

  // 사용승인 연도는 K-apt 값이라 실거래가의 건축년도와 크게 어긋나면 안 된다.
  const badY = all.filter(c => c.y && (c.y < 1950 || c.y > 2027));
  check('사용승인 연도가 상식 범위', badY.length === 0, badY.length + '곳');

  // 붙은 단지가 있으면 평균 전용면적이 실거래 전용면적과 크게 어긋나면 안 된다.
  // 단지 평균과 개별 거래라 정확히 같을 수는 없으니 배수로만 본다.
  const off = all.filter(c => c.ea && c.a && (c.ea > c.a * 2.5 || c.ea < c.a / 2.5));
  check('단지 평균 전용면적이 거래 면적과 같은 자릿수', off.length === 0, off.length + '곳');
}

console.log('\n결과: ' + pass + ' 통과 / ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
