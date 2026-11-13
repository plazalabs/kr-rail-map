/* 테마 7종 글자 대비 자동 시험 (뮤즈 6-③, 2026-11-13)
 * css/style.css 에서 테마마다 색 토큰을 모아(라이트 바탕 위에 그 테마가 덮어쓰는 값) 핵심 글자 조합을 WCAG AA 4.5:1 로 잰다.
 * 테마: js/app.js THEMES — light · dark · eclipse · pink · neon · hospital · win95
 * 실행: node tests/contrast-themes.test.js   (표: --table)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const app = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const THEMES = [...app.matchAll(/\{ id: '([a-z0-9]+)', label: '[^']+' \}/g)].map(m => m[1]);
const DARK = new Set((/DARK_THEMES = new Set\(\[([^\]]*)\]\)/.exec(app) || [, ''])[1].match(/[a-z0-9]+/g) || []);

// 맨 바깥 규칙만 (미디어 쿼리 안 규칙은 화면 크기별 조정이라 뺀다)
function topRules() {
  const out = []; let depth = 0, start = 0, sel = '';
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '{') { if (depth === 0) { sel = css.slice(start, i).trim(); start = i + 1; } depth++; }
    else if (c === '}') { depth--; if (depth === 0) { out.push([sel, css.slice(start, i)]); start = i + 1; } }
  }
  return out.filter(([s]) => !s.startsWith('@'));
}
const RULES = topRules();
function tokensFor(theme) {
  const t = {};
  const take = body => { for (const m of body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)) t[m[1]] = m[2].toLowerCase(); };
  RULES.forEach(([s, b]) => { const parts = s.split(',').map(x => x.trim()); if (parts.includes(':root') || parts.includes('body[data-theme="light"]')) take(b); });
  if (theme !== 'light') RULES.forEach(([s, b]) => { const parts = s.split(',').map(x => x.trim()); if (parts.includes('body[data-theme="' + theme + '"]')) take(b); });
  return t;
}
const lum = h => { const c = [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
// 화면에서 실제로 겹치는 핵심 조합 (contrast.test.js 의 PAIRS 중 모든 테마가 정의하는 것)
const PAIRS = [['text', 'bg'], ['text', 'surface'], ['text-2', 'bg'], ['muted', 'bg'], ['muted', 'surface'], ['accent', 'bg'], ['accent-text', 'accent'], ['warn-text', 'bg']];

let pass = 0, fail = 0; const rows = [], bad = [];
const check = (l, c, d) => { if (c) { pass++; } else { fail++; bad.push(l + '  ' + (d || '')); } };
check('테마 7종을 읽음', THEMES.length === 7, THEMES.join(','));
THEMES.forEach(th => {
  const T = tokensFor(th);
  PAIRS.forEach(([f, b]) => {
    if (!T[f] || !T[b]) { rows.push([th, f, b, '토큰 없음(라이트 값 씀)']); return; }
    const r = ratio(T[f], T[b]);
    rows.push([th, f + ' ' + T[f], b + ' ' + T[b], r.toFixed(2)]);
    check(`${th}: ${f} × ${b} ≥ 4.5`, r >= 4.5, r.toFixed(2) + ` (${T[f]} / ${T[b]})`);
  });
});
if (process.argv.includes('--table')) { console.log('테마 | 글자 | 배경 | 대비'); rows.forEach(r => console.log(r.join(' | '))); }
console.log(`테마 ${THEMES.length}종(${THEMES.join('·')}, 어두운 ${[...DARK].join('·')}) × 핵심 조합 ${PAIRS.length}개`);
bad.forEach(b => console.log('  ✗ ' + b));
console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
