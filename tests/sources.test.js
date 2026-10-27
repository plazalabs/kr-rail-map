#!/usr/bin/env node
/* 출처·라이선스 매니페스트 검사
 *
 * 왜 필요한가:
 *   라이선스는 돈이 걸린 문제다. 표를 손으로 고치다 보면 실제 원천과
 *   어긋나고, 어긋난 표는 "이 데이터 상업적으로 써도 된다"는 잘못된
 *   답을 준다. 그래서 표(data.html)와 원본(data/sources.json)이 같은지,
 *   빠뜨린 데이터 파일은 없는지 기계가 확인한다.
 *
 *   특히 마지막 검사(고아 데이터)가 중요하다. 새 데이터 파일을 추가하고
 *   출처를 안 적으면, 라이선스를 모르는 데이터가 사이트에 실린다.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0;
const fails = [];

function check(name, ok, detail) {
  if (ok) {
    pass++;
  } else {
    fails.push(name + (detail ? ' — ' + detail : ''));
    console.log('  ✗ ' + name + (detail ? ' — ' + detail : ''));
  }
}

function section(t) {
  console.log('\n' + t);
}

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

const src = JSON.parse(read('data/sources.json'));
const page = read('data.html');
const index = read('index.html');

// ── 1. 파일 구조 ────────────────────────────────────────────────
section('매니페스트 구조');
check('스키마 이름이 있다', src.schema === 'kr-rail-map/sources/1', src.schema);
check('갱신일이 ISO 날짜다', /^\d{4}-\d{2}-\d{2}$/.test(src.updated || ''), src.updated);
check('원천이 8개 이상', Array.isArray(src.sources) && src.sources.length >= 8,
  String((src.sources || []).length));
check('라이선스 정의가 4개 이상', Object.keys(src.licences || {}).length >= 4,
  String(Object.keys(src.licences || {}).length));

// ── 2. 원천마다 필수 항목 ───────────────────────────────────────
section('원천마다 필수 항목');
const REQ = ['id', 'title', 'provider', 'licence', 'used_for', 'commercial'];
for (const s of src.sources) {
  const missing = REQ.filter((k) => !s[k]);
  check('"' + s.id + '" 필수 항목', missing.length === 0, missing.join(', '));
}
const ids = src.sources.map((s) => s.id);
check('id 가 중복되지 않는다', new Set(ids).size === ids.length,
  ids.filter((v, i) => ids.indexOf(v) !== i).join(', '));

// ── 3. 라이선스 연결 ────────────────────────────────────────────
section('라이선스 연결');
for (const s of src.sources) {
  check('"' + s.id + '" 라이선스가 정의돼 있다', !!src.licences[s.licence], s.licence);
  const lic = src.licences[s.licence];
  if (!lic) continue;
  // 원천의 상업적 이용 표시가 라이선스 정의와 어긋나면 안 된다.
  // 라이선스가 '미확인'인데 원천만 '가능'이라고 적는 실수를 막는다.
  check('"' + s.id + '" 상업적 이용 표시가 라이선스와 맞는다',
    lic.commercial_use === s.commercial,
    '라이선스 ' + lic.commercial_use + ' vs 원천 ' + s.commercial);
  check('"' + s.id + '" 상업적 이용 값이 정해진 것 중 하나',
    ['allowed', 'conditional', 'unverified'].includes(s.commercial), s.commercial);
}
// 출처 표시 의무가 있는 라이선스인데 문구가 비면 의무를 못 지킨다.
const noCredit = src.sources.filter((s) => {
  const lic = src.licences[s.licence];
  return lic && lic.attribution_required && !s.attribution;
});
check('출처 표시 의무가 있으면 문구가 있다', noCredit.length === 0,
  noCredit.map((s) => s.id).join(', '));

// ── 4. 가리키는 파일이 실제로 있는가 ────────────────────────────
section('파일 경로');
const paths = [];
for (const s of src.sources) {
  for (const f of (s.feeds || []).concat(s.affects || [])) paths.push([s.id, f]);
}
for (const [id, f] of paths) {
  check('"' + id + '" → ' + f, exists(f), '없는 파일');
}

// ── 5. 고아 데이터 — 출처를 안 적은 데이터 파일 ─────────────────
section('출처를 안 적은 데이터 파일이 없다');
const claimed = new Set();
for (const s of src.sources) {
  for (const f of (s.feeds || []).concat(s.affects || [])) claimed.add(f.replace(/\/$/, ''));
}
const shipped = fs.readdirSync(path.join(ROOT, 'data')).filter((f) => {
  if (f.startsWith('.') || f === 'sources.json') return false;
  return /\.(geojson|json|csv)$/.test(f) && !f.startsWith('_');
});
const orphan = shipped.filter((f) => !claimed.has('data/' + f));
check('data/ 의 배포 데이터가 모두 출처를 갖는다', orphan.length === 0,
  orphan.join(', '));

// ── 6. 화면 표가 매니페스트와 같은가 ────────────────────────────
section('data.html 표가 매니페스트와 같다');
check('표 생성 구간 표시가 있다',
  page.includes('<!-- sources:begin') && page.includes('<!-- sources:end -->'));
check('sources.json 을 링크한다', page.includes('data/sources.json'));

// 행 하나를 통째로 떼어 그 안의 배지·라이선스 문구를 본다.
const rows = {};
const re = /<tr data-src="([^"]+)">([\s\S]*?)<\/tr>/g;
let m;
while ((m = re.exec(page))) rows[m[1]] = m[2];
check('표에 실린 원천 수가 같다', Object.keys(rows).length === src.sources.length,
  '표 ' + Object.keys(rows).length + ' / 매니페스트 ' + src.sources.length);
for (const s of src.sources) {
  const row = rows[s.id];
  check('"' + s.id + '" 행이 표에 있다', !!row);
  if (!row) continue;
  const lic = src.licences[s.licence];
  check('"' + s.id + '" 행의 라이선스 이름이 맞다',
    row.includes(lic.name.replace(/&/g, '&amp;')), lic.name);
  const badge = { allowed: 'ok', conditional: 'cond', unverified: 'unv' }[s.commercial];
  check('"' + s.id + '" 행의 상업적 이용 배지가 맞다',
    row.includes('badge ' + badge), '기대 badge ' + badge);
}
// 미확인 원천이 있으면 경고 문구도 있어야 한다. 조용히 넘어가면 안 된다.
const unv = src.sources.filter((s) => s.commercial === 'unverified');
if (unv.length) {
  check('미확인 원천을 화면에서 경고한다', /상업적 이용은 원천별로 다릅니다/.test(page));
  check('미확인 원천 이름을 화면에 적었다',
    unv.every((s) => page.includes(s.title)), unv.map((s) => s.title).join(', '));
}

// ── 7. 지도 화면의 출처 표시 ────────────────────────────────────
section('지도 화면 출처 표시');
const must = ['© OpenStreetMap contributors', '© Esri', 'data.html'];
for (const t of must) {
  check('index.html 에 "' + t + '"', index.includes(t));
}
check('index.html 이 데이터 출처 페이지로 간다',
  /href="data\.html"[^>]*>데이터 출처/.test(index));

console.log('\n결과: ' + pass + '개 통과, ' + fails.length + '개 실패');
if (fails.length) {
  for (const f of fails) console.log('  ✗ ' + f);
  process.exit(1);
}
