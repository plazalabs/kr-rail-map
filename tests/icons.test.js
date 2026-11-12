/* 선 아이콘 (js/icons.js) — 코드가 쓰는 아이콘 이름이 모두 있어야 한다 (없으면 빈칸이 된다)
 * 실행: node tests/icons.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const Icons = require(path.join(ROOT, 'js/icons.js'));
let pass = 0, fail = 0;
const check = (n, ok, info) => { if (ok) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (info ? ' — ' + JSON.stringify(info) : '')); } };
const files = ['index.html', 'rank.html', 'board.html'].concat(fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f));
const used = new Set();
for (const f of files) {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const m of s.matchAll(/data-ic="([a-z_]+)"/g)) used.add(m[1]);
  for (const m of s.matchAll(/Icons\.svg\('([a-z_]+)'/g)) used.add(m[1]);
}
const RT = require(path.join(ROOT, 'js/rank.js'));
Object.values(RT.TIERS).forEach(t => used.add(t.ic));
['route', 'clock', 'home', 'map'].forEach(n => used.add(n));   // guide.js 빠른 시작
const missing = [...used].filter(n => !Icons.has(n));
check(`쓰는 아이콘 ${used.size}종이 모두 있다`, missing.length === 0, missing);
const svg = Icons.svg('close');
check('SVG: 선 굵기 1.8 · 글자색 · 화면 읽기 프로그램에서 숨김', /stroke-width="1.8"/.test(svg) && /stroke="currentColor"/.test(svg) && /aria-hidden="true"/.test(svg));
check('이름표를 주면 role=img + aria-label', /role="img" aria-label="닫기"/.test(Icons.svg('close', { label: '닫기' })));
check('모르는 이름은 빈 문자열', Icons.svg('nope') === '');
check('채운 별(star_on) 은 속이 칠해짐', /fill="currentColor"/.test(Icons.svg('star_on')) && /fill="none"/.test(Icons.svg('star')));
console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
