/* 화면 예시 중립 시험 (2026-11-14 회장님 지시) — 입력칸 예시(placeholder)에 특정 수혜 역(광운대 등)을 쓰지 않는다
 * 실행: node tests/neutral-examples.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}  ${detail === undefined ? '' : JSON.stringify(detail).slice(0, 300)}`); }
}
const files = ['index.html', 'rank.html', 'board.html'].concat(fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f));
const bad = [];
for (const f of files) {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  (s.match(/placeholder="[^"]*"/g) || []).forEach(p => { if (/광운대|노원구/.test(p)) bad.push(f + ': ' + p); });
}
check('입력칸 예시에 광운대·노원구 없음', bad.length === 0, bad);
check('순위표·떡상 패널·게시판 예시는 광화문', ['rank.html', 'js/rocket-panel.js', 'board.html'].every(f => /placeholder="[^"]*광화문/.test(fs.readFileSync(path.join(ROOT, f), 'utf8'))));
// 링크 미리보기·공유 그림을 그리는 코드에 특정 역을 박아 넣지 않는다 (og-rank 에 광운대가 크게 있던 것, 2026-11-14)
const drawers = ['data/build_og_rank.js', 'js/station-share.js'];
const pinned = drawers.filter(f => /['"`](광운대|노원)['"`]|fillText\([^)]*(광운대|노원)/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
check('미리보기·공유 그림 코드에 광운대·노원 고정 없음', pinned.length === 0, pinned);
console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
