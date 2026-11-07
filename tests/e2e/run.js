#!/usr/bin/env node
/* 화면 점검(e2e) 실행기 — 외부 패키지 없음
 *
 *   node tests/e2e/run.js                 전 항목
 *   node tests/e2e/run.js --only a,b      일부 항목
 *   node tests/e2e/run.js --list          항목 목록
 *
 * 하는 일: 저장소 루트를 Node 정적 서버로 띄우고(기본 127.0.0.1:8124), 각 점검을 별도 프로세스로
 * 하나씩 돌린다. 점검마다 걸린 시간과 통과/실패를 모아 찍고, 하나라도 실패하면 종료 코드 1.
 *
 * 환경 변수:
 *   E2E_PORT    정적 서버 포트 (기본 8124)
 *   E2E_BASE    이미 떠 있는 주소를 쓸 때 (예: https://plazalabs.github.io/kr-rail-map/index.html). 주면 서버를 띄우지 않는다
 *   E2E_OUT     스크린샷·결과 JSON 폴더 (기본: OS 임시 폴더/kr-rail-map-e2e)
 *   CHROME_PATH 크롬 실행 파일 (기본: 자동 탐색)
 *   E2E_RETRY   실패한 점검을 다시 돌릴 횟수 (기본 0). 재시도로 통과하면 'flaky' 로 따로 표시한다
 *
 * 단위 테스트(tests/*.test.js)와는 따로 돈다. 네트워크(배경 지도 타일·글꼴)가 필요하다.
 */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { start } = require('./lib/serve');
const { findChrome } = require('./lib/cdp');

// [이름, 파일, 추가 환경 변수, 설명]
const CHECKS = [
  ['theme-switch', 'theme-switch.e2e.js', {}, '테마·배경 전환 후 레이어 복원 (버그 ①)'],
  ['toolbar-menus', 'toolbar-menus.e2e.js', {}, '툴바 메뉴 3개·13항목, 모바일/태블릿/데스크톱 (버그 ②)'],
  ['same-name-stations', 'same-name-stations.e2e.js', {}, '동명역 선택·공유/옛 링크·역 상세 출발 (버그 ③)'],
  ['route-extras', 'route-extras.e2e.js', {}, '길찾기 키보드·⇄·즐겨찾기 ID 유지 (IMPL3)'],
  ['satellite-labels', 'satellite-labels.e2e.js', {}, '위성 등 배경별 역 이름·출구 번호 글자 (버그 ⑦)'],
  ['station-area', 'station-area.e2e.js', {}, '역세권 범위 근사 레이어 (IMPL5B)'],
  ['station-detail-data', 'station-detail-data.e2e.js', {}, '역 상세·투자분석 데이터 지연 로딩, 키보드로 역 열기 (IMPL9)'],
  ['region-labels', 'region-labels.e2e.js', {}, '동명역 지역 표시 — 자동완성·검색 (IMPL9)'],
  ['ui-fixes', 'ui-fixes.e2e.js', {}, '노선 비교·노선도 카드·노선도 툴바·영향권·style=local·그린 노선/위치 (IMPL7, 데스크톱)'],
  ['ui-fixes-mobile', 'ui-fixes.e2e.js', { MOBILE: '1' }, '같은 항목, 모바일 390×844'],
];

function arg(name) { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; }

function runOne(file, env) {
  return new Promise(resolve => {
    const t0 = Date.now();
    const p = spawn(process.execPath, [path.join(__dirname, file)], { env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
    let summary = null;
    const onData = (buf, err) => {
      const s = buf.toString();
      (err ? process.stderr : process.stdout).write(s.split('\n').map(l => l ? '  ' + l : l).join('\n'));
      const m = s.match(/E2E-SUMMARY [^:]+: pass (\d+) fail (\d+) 미검증 (\d+)/);
      if (m) summary = { pass: +m[1], fail: +m[2], unv: +m[3] };
    };
    p.stdout.on('data', d => onData(d, false));
    p.stderr.on('data', d => onData(d, true));
    p.on('close', code => resolve({ code, summary, sec: Math.round((Date.now() - t0) / 100) / 10 }));
  });
}

(async () => {
  if (process.argv.includes('--list')) { CHECKS.forEach(c => console.log(c[0].padEnd(20), c[3])); return; }
  const only = (arg('--only') || '').split(',').filter(Boolean);
  const unknown = only.filter(n => !CHECKS.some(c => c[0] === n));
  if (unknown.length) { console.error('없는 항목:', unknown.join(', ')); process.exit(2); }
  const todo = only.length ? CHECKS.filter(c => only.includes(c[0])) : CHECKS;
  const retry = Number(process.env.E2E_RETRY || 0);

  let chrome;
  try { chrome = findChrome(); } catch (e) { console.error(e.message); process.exit(2); }
  let server = null, base = process.env.E2E_BASE;
  if (!base) {
    const port = Number(process.env.E2E_PORT || 8124);
    server = await start(port);
    base = `http://127.0.0.1:${port}/index.html`;
  }
  const out = process.env.E2E_OUT || path.join(os.tmpdir(), 'kr-rail-map-e2e');
  console.log(`e2e: ${todo.length}개 항목 · 주소 ${base} · 크롬 ${chrome} · 결과 ${out}\n`);

  const results = [];
  const T0 = Date.now();
  for (const [name, file, env, desc] of todo) {
    console.log(`▶ ${name} — ${desc}`);
    let r = await runOne(file, Object.assign({ E2E_BASE: base, E2E_OUT: out }, env));
    let tries = 1;
    while (r.code !== 0 && tries <= retry) {
      console.log(`  ↻ ${name} 재시도 ${tries}/${retry}`);
      const r2 = await runOne(file, Object.assign({ E2E_BASE: base, E2E_OUT: out }, env));
      r2.firstFail = r.firstFail || r; r = r2; tries++;
    }
    const ok = r.code === 0;
    const flaky = ok && tries > 1;
    results.push({ name, ok, flaky, code: r.code, sec: r.sec, summary: r.summary, tries });
    console.log(`◀ ${name}: ${ok ? (flaky ? 'PASS(재시도 후 — flaky)' : 'PASS') : 'FAIL'} (${r.sec}s${r.summary ? `, 판정 ${r.summary.pass} 통과 / ${r.summary.fail} 실패 / 미검증 ${r.summary.unv}` : ', 요약 없음'})\n`);
  }
  if (server) server.close();

  const total = Math.round((Date.now() - T0) / 1000);
  console.log('──────── e2e 요약 ────────');
  results.forEach(r => console.log(`${r.ok ? (r.flaky ? 'FLAKY' : 'PASS ') : 'FAIL '} ${r.name.padEnd(20)} ${String(r.sec).padStart(6)}s  ${r.summary ? `${r.summary.pass}/${r.summary.fail}/${r.summary.unv}` : '-'}`));
  const fail = results.filter(r => !r.ok).length;
  const items = results.reduce((a, r) => (r.summary ? [a[0] + r.summary.pass, a[1] + r.summary.fail, a[2] + r.summary.unv] : a), [0, 0, 0]);
  console.log(`항목 ${results.length - fail}/${results.length} 통과 · 판정 ${items[0]} 통과 / ${items[1]} 실패 / 미검증 ${items[2]} · ${total}s`);
  try { fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify({ base, total, results }, null, 1)); } catch (e) {}
  process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
