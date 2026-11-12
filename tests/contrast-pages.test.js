/* 순위표·게시판·자료 페이지(rank/board/data.html)의 글자색 × 배경 조합이 4.5:1 이상인지 (작업 5, 2026-11-12)
 * 지도 화면(css/style.css)은 tests/contrast.test.js 가 본다. 이 세 페이지는 각자 :root 색을 가진다.
 * 밝은(첫 :root)·어두운(prefers-color-scheme:dark 안 :root) 둘 다. 실행: node tests/contrast-pages.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
function lum(h) {
  h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const c = [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const FG = ['text', 'text2', 'muted', 'accent', 'warn', 'ok', 'i-rocket', 'i-up', 'i-flat', 'i-down', 'i-new', 'gold'];
const BG = ['bg', 'surface', 'card', 'warnbg', 'accentbg', 'goldbg'];
let pass = 0; const bad = [];
for (const f of ['rank.html', 'board.html', 'data.html']) {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const blocks = [...s.matchAll(/:root\{([^}]*)\}/g)].map(m => m[1]);
  if (blocks.length < 2) bad.push(`${f}: 밝은·어두운 :root 둘 다 있어야 함 (${blocks.length}개)`);
  blocks.slice(0, 2).forEach((b, bi) => {
    const v = {}; for (const m of b.matchAll(/--([a-z0-9-]+):(#[0-9a-fA-F]{3,6})/g)) v[m[1]] = m[2];
    for (const a of FG) for (const c of BG) {
      if (!v[a] || !v[c]) continue;
      const r = ratio(v[a], v[c]);
      if (r >= 4.5) pass++; else bad.push(`${f} ${bi ? '어두운' : '밝은'} ${a} ${v[a]} / ${c} ${v[c]} = ${r.toFixed(2)}`);
    }
  });
}
if (bad.length) { console.error('4.5:1 미만 ' + bad.length + '개\n' + bad.join('\n')); process.exit(1); }
console.log(`세 페이지 글자 대비 ${pass}개 조합 모두 4.5:1 이상`);
