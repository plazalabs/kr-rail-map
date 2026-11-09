/* 투자 모드 스위치 (js/mode.js) 단위 시험 — 2026-11-09 회장님 결정: 기본 꺼짐
 * 실행: node tests/mode.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}  ${detail === undefined ? '' : JSON.stringify(detail)}`); }
}

// 브라우저 없이 mode.js 를 돌린다. stored = localStorage 값, search = 주소 쿼리
function boot(stored, search, opts) {
  const store = {};
  if (stored !== undefined) store['krrail-mode'] = stored;
  const ls = (opts && opts.brokenStorage)
    ? { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } }
    : { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  const win = { localStorage: ls, location: { search: search || '' } };
  vm.runInNewContext(read('js/mode.js'), { window: win });
  return { M: win.KR_MODE, store };
}

console.log('[시작 모드]');
check('처음 온 사람 = 철도 모드 (기본 꺼짐)', boot().M.get() === 'rail');
check('저장값 invest → 투자 모드', boot('invest').M.isInvest() === true);
check('저장값 rail → 철도 모드', boot('rail').M.isInvest() === false);
check('이상한 저장값 → 철도 모드', boot('xyz').M.get() === 'rail');
check('저장소가 막혀도(사생활 보호) 철도 모드로 뜸', boot(undefined, '', { brokenStorage: true }).M.get() === 'rail');

console.log('\n[공유 링크 ?mode=]');
{
  const { M, store } = boot('rail', '?mode=invest');
  check('?mode=invest → 이번 방문은 투자 모드', M.isInvest() && M.fromUrl === true);
  check('받은 사람 저장값은 그대로 rail', store['krrail-mode'] === 'rail', store);
}
check('?mode=rail 이 저장값 invest 를 이번 방문만 덮음', boot('invest', '?x=1&mode=rail').M.get() === 'rail');
check('?mode=이상한값 은 무시', boot('invest', '?mode=zzz').M.get() === 'invest');

console.log('\n[스위치]');
{
  const { M, store } = boot();
  const seen = [];
  M.onChange(m => seen.push(m));
  M.toggle();
  check('toggle → 투자 모드 + 저장', M.isInvest() && store['krrail-mode'] === 'invest', store);
  M.toggle();
  check('다시 toggle → 철도 모드 + 저장', !M.isInvest() && store['krrail-mode'] === 'rail', store);
  M.set('rail');
  check('같은 모드로 set 하면 알림 안 함', seen.join(',') === 'invest,rail', seen);
  M.set('bogus');
  check('잘못된 값은 무시', M.get() === 'rail');
  M.set('invest', false);
  check('persist=false 면 저장 안 함', M.isInvest() && store['krrail-mode'] === 'rail', store);
}

console.log('\n[연결 — 소스 모양]');
const html = read('index.html'), sd = read('js/station-detail.js'), app = read('js/app.js'), sw = read('sw.js');
check('index.html: mode.js 를 다른 모듈보다 먼저 불러옴',
  html.indexOf('js/mode.js') > 0 && html.indexOf('js/mode.js') < html.indexOf('js/ui.js'));
check('툴바 맨 끝에 스위치 버튼 (#mode-btn, aria-pressed) — 드롭다운 nth-child 를 밀지 않게',
  /<button id="mode-btn"[^>]*aria-pressed="false"/.test(html) &&
  html.indexOf('id="mode-btn"') > html.indexOf('id="report-btn"'));
check('서비스워커가 mode.js 를 캐시', sw.includes("'./js/mode.js'"));
check('역 상세: 시세·공급은 투자 모드일 때만', /if \(invest\) html \+= priceSection\(sid\)/.test(sd) && /if \(invest && typeof StationDev/.test(sd));
check('역 상세: 철도 모드에서 맨 아래 "투자 모드 켜기" 안내 줄', /if \(!invest\) \{[\s\S]{0,200}sd-mode-on[\s\S]{0,200}투자 모드 켜기/.test(sd));
check('안내 줄을 누르면 투자 모드로', /\.sd-mode-on'\);[\s\S]{0,200}KR_MODE\.set\('invest'\)/.test(sd));
check('도심 접근성은 모드와 상관없이 그림 (철도 정보)', !/invest && typeof StationAccess/.test(sd));
check('app.js: 모드를 끄면 투자분석도 끔', /mode === 'invest'[\s\S]{0,600}InvestAnalyzer\.setMode\(false\)/.test(app));

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
