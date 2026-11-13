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
const Profiles = require('./lib/profiles');
const MB = b => (b / 1048576).toFixed(0) + 'MB';

// [이름, 파일, 추가 환경 변수, 설명]
const CHECKS = [
  ['theme-switch', 'theme-switch.e2e.js', {}, '테마·배경 전환 후 레이어 복원 (버그 ①)'],
  ['toolbar-menus', 'toolbar-menus.e2e.js', {}, '툴바 메뉴 3개·14항목, 모바일/태블릿/데스크톱 (버그 ②)'],
  ['same-name-stations', 'same-name-stations.e2e.js', {}, '동명역 선택·공유/옛 링크·역 상세 출발 (버그 ③)'],
  ['route-peek', 'route-peek.e2e.js', {}, '휴대폰 길찾기 결과 요약 한 줄 — 지도·경로가 보이게 (2026-11-13)'],
  ['route-extras', 'route-extras.e2e.js', {}, '길찾기 키보드·⇄·즐겨찾기 ID 유지 (IMPL3)'],
  ['palette', 'palette.e2e.js', {}, '검색 팔레트 — 기능 바로 실행·A에서 B 길찾기 (2026-11-13)'],
  ['share-line', 'share-line.e2e.js', {}, '나만의 노선 링크 공유 — 받기·저장·왕복·HTML 글자로만 (2026-11-13)'],
  ['quiz', 'quiz.e2e.js', {}, '나에게 맞는 역 찾기 — 질문 4개·TOP 3·결과 주소 (2026-11-13)'],
  ['draw-export', 'draw-export.e2e.js', {}, '그리기 → 저장 → GeoJSON 내보내기 · Esc 취소 (2차 감사 V1)'],
  ['home-cards', 'home-cards.e2e.js', {}, '사이드바 TOP 3·커뮤니티 · 지도 위 켜진 분석 (시안 C, 68점 12번)'],
  ['market-map', 'market-map.e2e.js', {}, 'RAIL MARKET MAP 역 타일 — 타일↔지도 양방향·휴대폰 탭 (2026-11-13)'],
  ['satellite-labels', 'satellite-labels.e2e.js', {}, '위성 등 배경별 역 이름·출구 번호 글자 (버그 ⑦)'],
  ['station-area', 'station-area.e2e.js', {}, '역세권 범위 근사 레이어 (IMPL5B)'],
  ['station-detail-data', 'station-detail-data.e2e.js', {}, '역 상세·투자분석 데이터 지연 로딩, 키보드로 역 열기 (IMPL9)'],
  ['region-labels', 'region-labels.e2e.js', {}, '동명역 지역 표시 — 자동완성·검색 (IMPL9)'],
  ['nearby-first', 'nearby-first.e2e.js', {}, '자동완성 동명역을 지도 중심에 가까운 순으로 (IMPL9)'],
  ['fav-stations', 'fav-stations.e2e.js', {}, '역 즐겨찾기를 역 ID 로 — 동명역 구분·옛 저장분 (IMPL9)'],
  ['focus-return', 'focus-return.e2e.js', {}, '키보드로 역 고르기, 패널 열고 닫을 때 포커스 (IMPL9)'],
  ['map-keyboard', 'map-keyboard.e2e.js', {}, '지도 위 역 키보드 탐색: N/P 로 역 고르기·Enter 로 열기·Esc·한글 자판 (2026-11-11)'],
  ['diagram-layout', 'diagram-layout.e2e.js', {}, '개략 노선도 배치: 역 포개짐 0쌍·45° 맞춤 90% 이상·3초 안 (2026-11-11)'],
  ['commute', 'commute.e2e.js', {}, '통근권 찾기: 목적지까지 N분 안 역·길찾기와 같은 분·시세 정렬 (2026-11-11)'],
  ['route-fit', 'route-fit.e2e.js', {}, '길찾기 결과가 한눈에: 결과 칸 안쪽 스크롤 없음·창이 화면 안·탭 한 줄 (2026-11-11)'],
  ['guide', 'guide.e2e.js', {}, '처음 온 사람 안내 카드: 첫 방문만·링크로 오면 안 뜸·항목 누르면 그 기능·✕ (2026-11-11)'],
  ['first-hints', 'first-hints.e2e.js', {}, '처음 쓰는 사람 안내: 노선도 안내 줄(휴대폰 포함)·카드 역 정보 버튼·투자 모드 첫 안내 한 번만·통근권 0역 안내·길찾기 결과 역 이름 → 역 정보 (2026-11-11)'],
  ['wait-setting', 'wait-setting.e2e.js', {}, '공통 출퇴근 배차 넣기 (D9)'],
  ['station-tabs', 'station-tabs.e2e.js', {}, '역 상세 탭 4개 — 교통·시세·개발·이야기, 키보드, 기억, 철도 모드, 휴대폰 (F3, 2026-11-13)'],
  ['jeonse', 'jeonse.e2e.js', {}, '전세가율: 같은 단지·같은 면적 짝 중위값, 80% 이상 짝 수, 철도 모드에선 숨김 (2026-11-11)'],
  ['panel-state', 'panel-state.e2e.js', {}, '영향권 패널 가림·노선도 버튼 상태·메모 핀 복원 (IMPL9)'],
  ['sw-navigate', 'sw-navigate.e2e.js', {}, '서비스워커가 노선 상세 페이지로 index.html 캐시를 덮어쓰지 않음 (IMPL12)'],
  ['dev-theme', 'dev-theme.e2e.js', {}, '개발(공급) 패널 색 변수·글자 대비 — 모든 테마 (IMPL12)'],
  ['invest-mode', 'invest-mode.e2e.js', {}, '투자 모드 스위치: 기본 꺼짐·안내 줄로 켜기·새로고침 유지·툴바로 끄기·?mode=invest 링크 (2026-11-09)'],
  ['unopened', 'unopened.e2e.js', {}, '미개통 노선 점선·개통 예정 글자, 길찾기 기본은 운행 중 노선만·스위치로 포함 (2026-11-09 결정 1)'],
  ['ktx-fare', 'ktx-fare.e2e.js', {}, 'KTX 공식 운임표(2026.9.1. 통합 운임): 서울→부산 54,400원, 공식·추정 요금 내역 구분 (2026-11-09)'],
  ['rank', 'rank.e2e.js', {}, 'GTX 떡상 랭킹: 가로 스크롤·TOP 10·등급 칩·GBD 중시·찾기·지금 시점·연도 슬라이더·역 카드·공유 이미지·지도 상세 (2026-11-12)'],
  ['rocket-map', 'rocket-map.e2e.js', {}, '🚀 떡상 지도 레이어: 기본 꺼짐·켜면 등급 색·광운대 떡상·배경 바꿔도 복원·끄기 (2026-11-12)'],
  ['rocket-panel', 'rocket-panel.e2e.js', {}, '지도 안 떡상 패널(v109): 툴바 버튼·문장형 제목·취소선 순위·곡선·막대·연도/기준·목록→지도·지도 역→패널·닫기·주소·휴대폰 시트 (2026-11-12)'],
  ['station-talk', 'station-talk.e2e.js', {}, '역 상세 💬 이 역 이야기: 설정 없으면 준비 중·역 ID 로 거른 목록·XSS 막힘·글쓰기·신고·다른 역 (커뮤니티, 2026-11-12)'],
  ['basemap-down', 'basemap-down.e2e.js', {}, '배경 지도 서버가 죽어도 노선·역·길찾기는 된다 (비상 배경, 2026-11-12)'],
  ['board', 'board.e2e.js', {}, '게시판: 설정 없으면 준비 중, 있으면 목록·글쓰기·도배 막기·신고·XSS 막힘 (Supabase 흉내, 2026-11-12)'],
  ['ui-fixes', 'ui-fixes.e2e.js', {}, '노선 비교·노선도 카드·노선도 툴바·영향권·style=local·그린 노선/위치 (IMPL7, 데스크톱)'],
  ['ui-fixes-mobile', 'ui-fixes.e2e.js', { MOBILE: '1' }, '같은 항목, 모바일 390×844'],
  ['tabbar', 'tabbar.e2e.js', {}, '휴대폰 아래 탭 5칸(길찾기·떡상·시세·게시판·더보기)·더보기 시트·PC 엔 없음 (작업 1)'],
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
  // 크롬 임시 프로필 — 주인이 끝난 옛 프로필을 먼저 치운다 (돌고 있는 다른 e2e 의 프로필은 건드리지 않는다)
  const pf0 = Profiles.stats(), sw0 = Profiles.sweep(), pf1 = Profiles.stats();
  console.log(`크롬 임시 프로필(시작): ${pf0.count}개 ${MB(pf0.bytes)} → 옛 것 ${sw0.removed}개 지움 → ${pf1.count}개 ${MB(pf1.bytes)}${sw0.inUse ? ` (다른 실행이 쓰는 중 ${sw0.inUse}개)` : ''}`);
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
  const sw1 = Profiles.sweep(), pf2 = Profiles.stats();
  console.log(`크롬 임시 프로필(끝): 남은 것 ${sw1.removed}개 지움 → ${pf2.count}개 ${MB(pf2.bytes)}${sw1.kept ? ` (실패 추적용 ${sw1.kept}개 보관, 최대 3)` : ''}`);

  const total = Math.round((Date.now() - T0) / 1000);
  console.log('──────── e2e 요약 ────────');
  results.forEach(r => console.log(`${r.ok ? (r.flaky ? 'FLAKY' : 'PASS ') : 'FAIL '} ${r.name.padEnd(20)} ${String(r.sec).padStart(6)}s  ${r.summary ? `${r.summary.pass}/${r.summary.fail}/${r.summary.unv}` : '-'}`));
  const fail = results.filter(r => !r.ok).length;
  const items = results.reduce((a, r) => (r.summary ? [a[0] + r.summary.pass, a[1] + r.summary.fail, a[2] + r.summary.unv] : a), [0, 0, 0]);
  console.log(`항목 ${results.length - fail}/${results.length} 통과 · 판정 ${items[0]} 통과 / ${items[1]} 실패 / 미검증 ${items[2]} · ${total}s`);
  try { fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify({ base, total, results }, null, 1)); } catch (e) {}
  process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
