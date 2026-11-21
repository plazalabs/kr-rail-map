// 회귀(숙제 66): 노선 상태 말은 status 하나에서 함수 하나(js/line-status.js LineStatus.word)로만 만든다.
// 표기 규칙(CLAUDE.md 3장): '운행 중 / 공사 중 / 계획 / 구상'.
// 검수 때: GTX-D 가 검색 후보 '미개통' / 역 상세 '계획중' / 지도 라벨 '구상'으로 서로 달랐고,
// 지도 라벨 'GTX-E 개통 예정(구상중)'은 한 라벨 안에서 모순이었다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const ROOT = process.env.KR_RAIL_ROOT || process.cwd();
const read = p => readFileSync(join(ROOT, p), 'utf8');

test('[R-66] LineStatus.word: status 하나 → 표기 규칙 말 하나', () => {
  assert.ok(existsSync(join(ROOT, 'js/line-status.js')), 'js/line-status.js 없음');
  const LS = createRequire(import.meta.url)(join(ROOT, 'js/line-status.js'));
  assert.equal(LS.word('open'), '운행 중');
  assert.equal(LS.word('construction'), '공사 중');
  assert.equal(LS.word('planned'), '계획');
  assert.equal(LS.word('proposed'), '구상');
  assert.equal(LS.word(undefined), '운행 중');   // status 없는 노선 = 운행 중 (lines.geojson 기본)
  const lines = JSON.parse(read('data/lines.geojson')).features;
  for (const f of lines) assert.ok(LS.word(f.properties.status), `${f.properties.id}: 상태 말 없음 (${f.properties.status})`);
});

test('[R-66] 화면 파일은 상태 말을 직접 쓰지 않는다 (붙여 쓴 옛 말·한 라벨 안 모순)', () => {
  const bad = [];
  for (const f of readdirSync(join(ROOT, 'js')).filter(f => f.endsWith('.js') && f !== 'line-status.js')) {
    read('js/' + f).split(/\r?\n/).forEach((ln, i) => {
      const code = ln.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
      if (/운행중|공사중|계획중|구상중/.test(code)) bad.push(`${f}:${i + 1}: ${code.trim().slice(0, 80)}`);
      if (/개통 예정',?\s*$|' 개통 예정'/.test(code)) bad.push(`${f}:${i + 1}: 지도 라벨 '개통 예정(상태)' — ${code.trim().slice(0, 80)}`);
      if (/'\(미개통\)'|\+ '\(미개통\)'/.test(code)) bad.push(`${f}:${i + 1}: 검색 후보 '(미개통)' — ${code.trim().slice(0, 80)}`);
    });
  }
  assert.deepEqual(bad, []);
});

test('[R-66] 화면이 line-status.js 를 먼저 불러온다 (index.html · sw.js)', () => {
  const html = read('index.html');
  const i = html.indexOf('js/line-status.js');
  assert.ok(i > 0, 'index.html 에 line-status.js 없음');
  for (const f of ['app.js', 'station-detail.js', 'compare.js', 'stats.js', 'timeline.js', 'route-compare.js', 'invest.js', 'coverage.js'])
    assert.ok(i < html.indexOf('js/' + f), `${f} 보다 먼저 불러와야 함`);
  assert.match(read('sw.js'), /js\/line-status\.js/);
});

// ── 화면 네 곳(지도 글자·검색 후보·역 상세 배지·공유 카드)의 상태 말을 실제 코드로 만들어 맞춰 본다 ──
// 화면 파일에서 함수·식을 그대로 꺼내 돌린다(브라우저 없이). 꺼내지 못하면 실패 — 이름이 바뀌면 이 시험도 같이 고친다.
const LSmod = () => createRequire(import.meta.url)(join(ROOT, 'js/line-status.js'));
function sliceBalanced(src, start, open, close) {
  let d = 0;
  for (let i = src.indexOf(open, start); i < src.length; i++) {
    if (src[i] === open) d++; else if (src[i] === close && --d === 0) return src.slice(start, i + 1);
  }
  throw new Error('괄호 짝 없음');
}
function fnSource(file, name) {
  const src = read(file), i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, `${file}: function ${name} 없음`);
  return sliceBalanced(src, i, '{', '}');
}
// MapLibre 식 중 이 라벨이 쓰는 것만(match·get·concat·case·==·typeof·to-string)
function evalExpr(e, props) {
  if (!Array.isArray(e)) return e;
  const [op, ...a] = e;
  if (op === 'get') return props[a[0]];
  if (op === 'concat') return a.map(x => evalExpr(x, props)).join('');
  if (op === 'case') {
    for (let i = 0; i + 1 < a.length; i += 2) if (evalExpr(a[i], props)) return evalExpr(a[i + 1], props);
    return evalExpr(a[a.length - 1], props);
  }
  if (op === '==') return evalExpr(a[0], props) === evalExpr(a[1], props);
  if (op === 'typeof') { const v = evalExpr(a[0], props); return v == null ? 'null' : typeof v; }
  if (op === 'to-string') { const v = evalExpr(a[0], props); return v == null ? '' : String(v); }
  if (op === 'match') {
    const v = evalExpr(a[0], props);
    for (let i = 1; i + 1 < a.length; i += 2) if ((Array.isArray(a[i]) ? a[i] : [a[i]]).includes(v)) return evalExpr(a[i + 1], props);
    return evalExpr(a[a.length - 1], props);
  }
  throw new Error('모르는 식 ' + op);
}
function surfaces() {
  const LS = LSmod();
  const app = read('js/app.js');
  // 지도 글자: 미개통 라벨 레이어의 text-field
  const exprLine = app.split(/\r?\n/).find(l => /^const STATUS_WORD_EXPR\s*=/.test(l));
  assert.ok(exprLine, 'app.js: STATUS_WORD_EXPR 없음');
  const STATUS_WORD_EXPR = new Function('LineStatus', exprLine.replace(/^const STATUS_WORD_EXPR\s*=/, 'return ').replace(/;\s*$/, ''))(LS);
  // 개통 연도 꼬리(숙제 74) — 없으면 빈 글자로 두고 R-74 가 실패한다
  const yearLine = app.split(/\r?\n/).find(l => /^const OPEN_YEAR_EXPR\s*=/.test(l));
  const OPEN_YEAR_EXPR = yearLine ? new Function('return ' + yearLine.replace(/^const OPEN_YEAR_EXPR\s*=/, '').replace(/;\s*$/, ''))() : '';
  const li = app.indexOf("id: 'rail-lines-unopened-label'");
  const ti = app.indexOf("'text-field':", li);
  assert.ok(li > 0 && ti > 0, 'app.js: 미개통 라벨 text-field 없음');
  const tf = new Function('STATUS_WORD_EXPR', 'OPEN_YEAR_EXPR', 'return ' + sliceBalanced(app, app.indexOf('[', ti), '[', ']'))(STATUS_WORD_EXPR, OPEN_YEAR_EXPR);
  const lines = JSON.parse(read('data/lines.geojson')).features.map(f => f.properties);
  const byId = new Map(lines.map(p => [p.id, p]));
  // 검색 후보
  const lineLabelOf = new Function('lineNameOf', 'RouteFinder', 'LineStatus', fnSource('js/app.js', 'lineLabelOf') + '; return lineLabelOf;')(
    new Map(lines.map(p => [p.id, p.name_ko])), { statusOf: id => (byId.get(id) || {}).status || 'open' }, LS);
  // 역 상세 배지
  const lineRow = new Function('lineById', 'esc', 'LineStatus', fnSource('js/station-detail.js', 'lineRow') + '; return lineRow;')(
    id => byId.has(id) ? { properties: byId.get(id) } : null, s => String(s), LS);
  // 공유 카드
  const planLabel = new Function('RankTable', 'LineStatus', fnSource('js/station-share.js', 'planLabel') + '; return planLabel;')({ yearOf: () => null }, LS);
  return lines.filter(p => (p.status || 'open') !== 'open').map(p => ({
    id: p.id, name: p.name_ko, status: p.status, word: LS.word(p.status), year: p.open_year,
    map: evalExpr(tf, p),
    search: lineLabelOf(p.id),
    detail: (lineRow(p.id).match(/class="sd-badge [^"]*">([^<]*)</) || [])[1],
    share: planLabel({ n: p.name_ko, s: p.status, y: p.open_year }),
  }));
}

test('[R-66] GTX-D 상태 말: 지도 라벨 = 검색 후보 = 역 상세 (= 공유 카드)', () => {
  const g = surfaces().find(r => r.id === 'gtx-d');
  assert.ok(g, 'gtx-d 없음');
  const got = { map: g.map, search: g.search, detail: g.detail, share: g.share };
  assert.ok(g.map.includes(' ' + g.word + ' ') && g.map.includes('갈래 여러 안'), '지도 ' + JSON.stringify(got));
  assert.equal(g.search, 'GTX-D(' + g.word + ')', '검색 ' + JSON.stringify(got));
  assert.equal(g.detail, g.word, '상세 ' + JSON.stringify(got));
  assert.equal(g.share, 'GTX-D (' + g.word + ')', '공유 ' + JSON.stringify(got));
});

test('[R-66] 모든 미개통 노선: 네 화면이 같은 상태 말, 구상 노선이 계획으로 안 나옴', () => {
  const bad = [];
  const other = { 공사: '공사 중', 계획: '계획', 구상: '구상' };
  for (const r of surfaces()) {
    for (const k of ['map', 'search', 'detail']) {
      const s = String(r[k]);
      if (!s.includes(r.word)) bad.push(`${r.id}(${r.status}) ${k}: '${s}' 에 '${r.word}' 없음`);
      for (const w of Object.values(other)) if (w !== r.word && !r.word.includes(w) && s.includes(w)) bad.push(`${r.id}(${r.status}) ${k}: '${s}' 에 다른 상태 말 '${w}'`);
    }
    // 공유 카드는 공사 중이면 연도를 쓴다(상태 말 없음) — 계획·구상만 본다
    if (r.status !== 'construction' && !String(r.share).endsWith('(' + r.word + ')')) bad.push(`${r.id}(${r.status}) share: '${r.share}'`);
  }
  const proposed = surfaces().filter(r => r.status === 'proposed');
  assert.ok(proposed.length > 0, '구상 노선이 하나도 없음 — 시험이 비어 있음');
  assert.deepEqual(bad, []);
});

// 숙제 74: 지도 미개통 라벨에 개통 연도 — '동북선 (공사 중 · 2027)'. 연도는 lines.geojson open_year 한 곳(자유 문장 opened 아님),
// open_year 가 null 이면 상태 말만('동부선 (구상)'). GTX-D 는 'GTX-D 계획 · 2035 (갈래 여러 안)'.
test('[R-74] 지도 라벨 연도 = open_year, null 이면 상태 말만 (구상 노선 포함)', () => {
  const rows = surfaces();
  const bad = [];
  for (const r of rows) {
    const yr = r.year == null ? '' : ' · ' + r.year;
    const want = r.id === 'gtx-d' ? `${r.name} ${r.word}${yr} (갈래 여러 안)` : `${r.name} (${r.word}${yr})`;
    if (r.map !== want) bad.push(`${r.id}(${r.status}, open_year ${r.year}): 지도 '${r.map}' ≠ '${want}'`);
  }
  assert.deepEqual(bad, []);
  const by = id => rows.find(r => r.id === id);
  assert.equal(by('dongbuk-line').map, '동북선 (공사 중 · 2027)');
  assert.equal(by('dongbu-line').map, '동부선 (구상)');          // 구상 + 연도 없음 → '(계획)' 아님
  assert.ok(rows.some(r => r.status === 'proposed' && r.year == null), '연도 없는 구상 노선이 없음 — 시험이 비어 있음');
  assert.ok(rows.some(r => r.status === 'proposed' && r.year != null), '연도 있는 구상 노선이 없음 — 시험이 비어 있음');
});

// 숙제 76: rank.html 공유 그림이 구상 노선도 '(계획)'으로 썼다(앱 공유 카드 planLabel 을 손으로 베낀 것 — 66 에서 한쪽만 고침).
// 노선 글자 함수는 LineStatus.label 하나 — 앱 공유 카드(station-share.js)와 rank.html 공유 그림(rank-page.js)이 같이 부른다.
test('[R-76] 공유 카드 = rank.html 공유 그림: 같은 함수 LineStatus.label, rank.html 이 line-status.js 를 먼저 불러옴', () => {
  const LS = createRequire(import.meta.url)(join(ROOT, 'js/line-status.js'));
  assert.equal(typeof LS.label, 'function', 'LineStatus.label 없음');
  const share = read('js/station-share.js'), rank = read('js/rank-page.js');
  assert.match(fnSource('js/station-share.js', 'planLabel'), /LineStatus\.label\(/, 'station-share.js planLabel 이 LineStatus.label 을 안 씀');
  const plan = rank.split(/\r?\n/).find(l => /const plan = lineChips\(r\.lines, true\)\.slice\(0, 3\)/.test(l)) || '';
  assert.match(plan, /LineStatus\.label\(x\.m\)/, 'rank-page.js 공유 그림 노선 글자: ' + plan.trim());
  for (const [f, src] of [['station-share.js', share], ['rank-page.js', rank]]) assert.ok(!/' \((계획|구상)\)'/.test(src), f + ': 상태 말 글자를 직접 씀');
  const html = read('rank.html');
  const a = html.indexOf('src="js/line-status.js"'), b = html.indexOf('src="js/rank-page.js"');
  assert.ok(a > 0 && a < b, 'rank.html: line-status.js 가 rank-page.js 보다 먼저 있어야 함');
  // 값: 구상 'GTX-E (구상)', 계획 'GTX-D (계획)', 공사 중 'GTX-C 2031', 연도 없는 계획 'GTX-G (계획)'
  const rj = JSON.parse(read('data/rank.json')).lines;
  assert.deepEqual(['gtx-e', 'gtx-d', 'gtx-c', 'gtx-g'].map(id => LS.label(rj[id])), ['GTX-E (구상)', 'GTX-D (계획)', 'GTX-C 2031', 'GTX-G (계획)']);
});
