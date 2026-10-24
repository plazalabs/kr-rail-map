/* 국가철도공단 역위치 CSV 를 정답지로 삼아 '역↔노선' 배정을 검사한다.
 *
 * 왜 이 테스트가 필요한가:
 *   data/fix_station_lines.py 가 노선 선형에서 80m 이내면 그 노선 역으로
 *   간주한다. 같은 선로를 쓰는 노선을 구분하지 못해서, 서울~수색 구간의
 *   경의중앙선 역들에 공항철도가 붙었다. 대흥·효창공원앞·서강대·수색·
 *   가좌·남영·숙대입구·송정 — 공항철도가 정차하지 않는 역들이다.
 *
 *   이 상태면 경로 탐색이 '대흥에서 공항철도를 타세요' 라고 답한다.
 *   부동산으로 치면 '이 집은 공항철도 역세권' 이라는 잘못된 판단을 만든다.
 *
 * 정답지는 data/_gov 의 공식 CSV 다. 좌표는 6호선처럼 틀린 곳이 있어
 * 못 믿지만, **정차역 목록은 믿을 만하다.** 그래서 목록만 근거로 쓴다.
 *
 * 표기 차이는 오류가 아니다. 공식은 '숙대입구(갈월)', '총신대입구(이수)'
 * 처럼 괄호 부기를 붙인다. 그건 VARIANTS 에 적어 허용한다.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const GOV = path.join(ROOT, 'data', '_gov');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ✓ ' + name + (detail ? '  [' + detail + ']' : '')); }
  else { fail++; console.log('  ✗ ' + name + (detail ? '  [' + detail + ']' : '')); }
}
function section(t) { console.log('\n[' + t + ']'); }

// 공식 '선명' → 우리 노선 id
const LINE_MAP = {
  '1호선': 'seoul-metropolitan-subway-line-1',
  '2호선': 'seoul-subway-line-2',
  '3호선': 'seoul-metro-line-3',
  '4호선': 'seoul-metropolitan-subway-line-4',
  '5호선': 'seoul-subway-line-5',
  '6호선': 'seoul-subway-line-6',
  '7호선': 'seoul-subway-line-7',
  '8호선': 'seoul-subway-line-8',
  '9호선': 'seoul-subway-line-9',
  '공항철도': 'arex',
  '수인분당': 'suin-bundang-line',
  '신분당선': 'seoul-metropolitan-subway-shinbundang-line',
  '용인에버라인': 'everline',
  '의정부': 'uijeongbu-lrt',
  '우이신설': 'ui-sinseol-line',
  '인천1호선': 'incheon-subway-line-1',
  '인천2호선': 'incheon-subway-line-2',
  '자기부상': 'incheon-airport-maglev-line-eastbound',
};

// 같은 역인데 표기가 다른 것. 오류가 아니므로 허용한다.
const VARIANTS = {
  '이수': ['총신대입구'],
  '서해구청': ['서구청'],
};

// 남은 차이 중 '알고 있는 것'만 적는다. 여기에 없는 차이가 생기면 실패한다.
const KNOWN = {
  // 부천시청 역 자체가 우리 데이터에 없다 (7호선). 별도 보충 과제.
  'seoul-subway-line-7': { extra: [], missing: ['부천시청'] },
  // 8호선 별내선 연장(2024) 구간의 구리역이 우리 데이터에 없다.
  'seoul-subway-line-8': { extra: [], missing: ['구리'] },
  // 인천1호선 박촌·임학 역이 우리 데이터에 없다.
  'incheon-subway-line-1': { extra: [], missing: ['박촌', '임학'] },
  // 용인에버라인은 노선만 있고 역이 하나도 붙어 있지 않다 (15개 전부 미배정).
  'everline': { extra: [], missing: 'ALL' },
  // 우리 동해선은 부전~삼척 전 구간, 공식 CSV 는 부산 구간(부전~태화강)만.
  // 범위 차이라 오류가 아니다.
  'donghae-line': { extra: 'ALL', missing: [] },
  // 공식 수인분당 CSV 에 대청이 빠져 있다 (2020년 개통역). 공식 쪽 누락.
  'suin-bundang-line': { extra: ['대청'], missing: [] },
  // 승객역이 아닌 차량기지 임시승강장. 표시는 하되 정차역 검사에서는 뺀다.
  'uijeongbu-lrt': { extra: ['차량기지임시승강장'], missing: [] },
};

function norm(s) {
  let t = String(s || '').trim();
  t = t.replace(/\(.*?\)/g, '');                    // 괄호 부기 제거
  t = t.replace(/[·ㆍ\-.\s]/g, '');
  if (t.length > 2 && t.endsWith('역')) t = t.slice(0, -1);
  return t;
}

// 표기 차이는 양방향으로 봐야 한다. VARIANTS 는 '우리 이름 → 공식 이름' 인데,
// 검사 방향에 따라 반대로 찾을 일이 생긴다 (공식 '서구청' ↔ 우리 '서해구청').
function sameStation(a, b) {
  if (a === b) return true;
  if ((VARIANTS[a] || []).includes(b)) return true;
  if ((VARIANTS[b] || []).includes(a)) return true;
  return false;
}
const matchesAny = (name, set) => [...set].some(o => sameStation(name, o));

function readGov() {
  const byLine = {};
  if (!fs.existsSync(GOV)) return byLine;
  for (const f of fs.readdirSync(GOV).filter(x => x.endsWith('.csv'))) {
    const lines = fs.readFileSync(path.join(GOV, f), 'utf8').split(/\r?\n/);
    const head = lines[0].split(',');
    const iLine = head.findIndex(h => h.trim() === '선명');
    const iName = head.findIndex(h => h.trim() === '역명');
    if (iLine < 0 || iName < 0) continue;
    for (const row of lines.slice(1)) {
      if (!row.trim()) continue;
      const c = row.split(',');
      const ln = (c[iLine] || '').trim();
      const nm = (c[iName] || '').trim();
      if (ln && nm) (byLine[ln] = byLine[ln] || new Set()).add(norm(nm));
    }
  }
  return byLine;
}

const gov = readGov();
const st = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stations.geojson'), 'utf8'));
const ours = {};
for (const f of st.features) {
  const p = f.properties;
  for (const lid of (p.lines || [])) {
    (ours[lid] = ours[lid] || {})[norm(p.name_ko)] = p.name_ko;
  }
}

section('정답지(공식 CSV) 확보');
check('data/_gov 에 CSV 가 있다', Object.keys(gov).length >= 19,
  Object.keys(gov).length + '개 노선');
check('매핑된 노선이 모두 있다',
  Object.keys(LINE_MAP).every(k => gov[k]), Object.keys(gov).join(',').slice(0, 60));

section('공항철도 — 이번 수정의 핵심');
{
  // 공식 정차역은 14개다. 여기에 없는 역이 붙어 있으면 경로 탐색이 거짓말을 한다.
  const official = gov['공항철도'] || new Set();
  const mine = Object.keys(ours['arex'] || {});
  const extra = mine.filter(k => !official.has(k)).map(k => ours['arex'][k]);
  check('정차역이 14개', mine.length === 14, mine.length + '개');
  check('공식 목록에 없는 역이 없다', extra.length === 0,
    extra.length ? extra.join(', ') : '0개');
  const mustHave = ['서울', '공덕', '홍대입구', '디지털미디어시티', '김포공항',
    '계양', '검암', '청라국제도시', '영종', '운서', '공항화물청사',
    '인천공항1터미널', '인천공항2터미널', '마곡나루'];
  const missing = mustHave.filter(n => !(ours['arex'] || {})[norm(n)]);
  check('필수 정차역 14곳 모두 있음', missing.length === 0,
    missing.length ? missing.join(', ') : '14/14');
}

section('노선별 정차역 대조');
{
  let bad = 0;
  const report = [];
  for (const [govLine, lid] of Object.entries(LINE_MAP)) {
    const official = gov[govLine];
    if (!official) continue;
    const mine = ours[lid] || {};
    const known = KNOWN[lid] || { extra: [], missing: [] };
    if (known.extra === 'ALL') continue;
    if (known.missing === 'ALL') {
      // 역이 통째로 없는 노선 — 따로 확인한다
      const cnt = Object.keys(mine).length;
      if (cnt > 0) { bad++; report.push(`${govLine}: 역이 ${cnt}개나 붙어 있음`); }
      continue;
    }

    const extra = Object.keys(mine)
      .filter(k => !matchesAny(k, official))
      .filter(k => !known.extra.includes(mine[k]));
    const missing = [...official]
      .filter(k => !mine[k] && !matchesAny(k, new Set(Object.keys(mine))))
      .filter(k => !known.missing.map(norm).includes(k));

    if (extra.length || missing.length) {
      bad++;
      report.push(`${govLine}: +${extra.map(k => mine[k]).join(',') || '-'} `
        + `-${missing.join(',') || '-'}`);
    }
  }
  check('알고 있는 차이 외에 불일치가 없다', bad === 0,
    bad ? report.join(' | ') : Object.keys(LINE_MAP).length + '개 노선 일치');
}

section('오배정 재발 방지');
{
  // 이번에 고친 10건이 되돌아오지 않았는지 역별로 확인한다.
  const BAN = {
    '수색': ['arex'], '서강대': ['arex'], '가좌': ['arex'], '송정': ['arex'],
    '효창공원앞': ['arex'], '남영': ['arex', 'seoul-metropolitan-subway-line-4'],
    '숙대입구': ['arex', 'seoul-metropolitan-subway-line-1'],
    '대흥': ['arex', 'gyeongui-jungang-line'],
    '천안아산': ['seoul-metropolitan-subway-line-1'],
    '신답': ['seoul-subway-line-5'],
  };
  const bad = [];
  for (const f of st.features) {
    const p = f.properties;
    for (const lid of (BAN[p.name_ko] || [])) {
      if ((p.lines || []).includes(lid)) bad.push(p.name_ko + '→' + lid);
    }
  }
  check('고친 10건이 되돌아오지 않음', bad.length === 0,
    bad.length ? bad.join(', ') : '10/10');
}

section('역 데이터 기본 정합성');
{
  const noLines = st.features.filter(f => !(f.properties.lines || []).length);
  check('노선이 하나도 없는 역이 없다', noLines.length === 0,
    noLines.length ? noLines.slice(0, 5).map(f => f.properties.name_ko).join(',') : '0개');
  const allIds = new Set(JSON.parse(fs.readFileSync(
    path.join(ROOT, 'data/lines.geojson'), 'utf8')).features.map(f => f.properties.id));
  const ghost = [];
  for (const f of st.features) {
    for (const lid of (f.properties.lines || [])) if (!allIds.has(lid)) ghost.push(lid);
  }
  check('존재하지 않는 노선 id 를 가리키는 역이 없다', ghost.length === 0,
    [...new Set(ghost)].slice(0, 5).join(',') || '0개');
}

console.log('\n결과: ' + pass + ' 통과 / ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
