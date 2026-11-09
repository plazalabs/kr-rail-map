/* 역 즐겨찾기 — 동명역 해제 규칙 (app.js 의 favMatches·isFavStation·toggleFavStation 을 그대로 떼어 돌린다)
 * 2026-11-09: e2e fav-stations 의 '서울 시청만 해제 → 부산 시청은 남음' FLAKY 를 조사하며 넣었다.
 * 원인은 테스트(지도 이동 직후 눈감고 클릭)였고 앱 규칙은 맞았다 — 그 규칙이 깨지지 않게 동작으로 고정한다.
 * 실행: node tests/favorites.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}  ${detail === undefined ? '' : JSON.stringify(detail)}`); }
}

// app.js 에서 세 함수의 원문을 그대로 꺼낸다 (복사본을 만들지 않는다 — 앱이 바뀌면 이 시험도 바뀐 코드를 돈다)
function grab(name) {
  const i = app.indexOf('function ' + name + '(');
  if (i < 0) throw new Error(name + ' 없음');
  let depth = 0, j = app.indexOf('{', i);
  for (; j < app.length; j++) { if (app[j] === '{') depth++; else if (app[j] === '}' && --depth === 0) break; }
  return app.slice(i, j + 1);
}
const src = ['favMatches', 'isFavStation', 'toggleFavStation'].map(grab).join('\n');
function world(stations) {
  const ctx = { favorites: { stations: stations, routes: [] }, saved: 0 };
  vm.runInNewContext(src + '\nthis.isFavStation = isFavStation; this.toggleFavStation = toggleFavStation;' +
    '\nfunction saveFavorites() { saved++; } function renderFavorites() {}', ctx);
  return ctx;
}
const SEOUL = 'st-5935738063', BUSAN = 'st-355173718', DAEJEON = 'st-9271807339';

console.log('[동명역 — 역 ID 로]');
{
  const w = world([]);
  w.toggleFavStation('시청', SEOUL); w.toggleFavStation('시청', BUSAN);
  check('서울·부산 시청을 따로 저장', w.favorites.stations.length === 2 && w.favorites.stations.map(e => e.id).join() === [SEOUL, BUSAN].join());
  check('서울만 ⭐ 표시 판정', w.isFavStation('시청', SEOUL) && w.isFavStation('시청', BUSAN) && !w.isFavStation('시청', DAEJEON));
  w.toggleFavStation('시청', SEOUL);
  check('서울 시청만 해제 → 부산 시청은 남음', w.favorites.stations.length === 1 && w.favorites.stations[0].id === BUSAN, w.favorites.stations);
  check('해제 뒤 서울은 ⭐ 아님, 부산은 ⭐', !w.isFavStation('시청', SEOUL) && w.isFavStation('시청', BUSAN));
  check('저장을 매번 부름', w.saved === 3, w.saved);
}
console.log('\n[옛 저장분 — 이름 문자열]');
{
  const w = world(['시청']);
  check('이름만 있는 옛 항목은 그 이름의 어느 역이든 ⭐ (옛 동작)', w.isFavStation('시청', SEOUL) && w.isFavStation('시청', BUSAN));
  w.toggleFavStation('시청', BUSAN);
  check('옛 항목을 해제하면 그 항목이 지워짐 (새 항목을 덧붙이지 않음)', w.favorites.stations.length === 0, w.favorites.stations);
}
{
  const w = world([{ name: '시청', id: BUSAN }]);
  w.toggleFavStation('시청', SEOUL);
  check('부산만 있을 때 서울을 누르면 서울이 추가 (부산을 지우지 않음)', w.favorites.stations.length === 2, w.favorites.stations);
}

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
