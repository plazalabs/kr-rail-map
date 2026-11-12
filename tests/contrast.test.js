/* 글자 대비 하한 — WCAG AA 4.5:1 (디자인 결함 전수 수정 작업 3, 2026-11-12)
 * css/style.css 의 밝은(light)·어두운(dark) 테마 토큰을 직접 읽어 주요 글자색 × 배경 조합을 전부 잰다.
 * 다른 테마 5종(eclipse·pink·neon·병원·win95)은 이번 범위 밖 — 표에 '참고'로만 찍고 실패로 치지 않는다.
 * 실행: node tests/contrast.test.js   (표만: --table)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');

// 블록 안 --이름: #hex 를 모은다
function tokens(selectorRe) {
  const out = {};
  const re = new RegExp(selectorRe + '\\s*\\{([^}]*)\\}', 'g');
  let m;
  while ((m = re.exec(css))) for (const t of m[1].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)) out[t[1]] = t[2].toLowerCase();
  return out;
}
const lum = h => { const c = [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

const light = Object.assign({}, tokens(':root, body\\[data-theme="light"\\]'), tokens(':root'));
const dark = Object.assign({}, light, tokens('body\\[data-theme="dark"\\]'),
  tokens('body\\[data-theme="dark"\\], body\\[data-theme="eclipse"\\], body\\[data-theme="neon"\\]'));

// [글자, 배경] — 화면에서 실제로 겹치는 조합
const PAIRS = [
  ['text', 'bg'], ['text', 'surface'], ['text-2', 'bg'], ['text-2', 'surface'], ['muted', 'bg'], ['muted', 'panel'], ['muted', 'surface'],
  ['accent', 'bg'], ['accent', 'surface'], ['accent', 'accent-weak'], ['accent-text', 'accent'],
  ['rk-up', 'bg'], ['rk-up', 'surface'], ['rk-down', 'bg'], ['rk-green', 'bg'], ['rk-new', 'bg'], ['warn-text', 'bg'],   // rk-blue 는 글자로 안 씀 (칠 전용, 글자는 --accent)
];
const WHITE_ON = ['rk-blue', 'rk-blue-2'];   // 떡상 카드·버튼: 흰 글자가 파랑 그라데이션 위

let pass = 0, fail = 0;
const rows = [];
function run(name, T, strict) {
  for (const [f, b] of PAIRS) {
    if (!T[f] || !T[b]) { rows.push([name, f, b, '토큰 없음', '']); if (strict) fail++; continue; }
    const r = ratio(T[f], T[b]);
    const ok = r >= 4.5;
    rows.push([name, `${f} ${T[f]}`, `${b} ${T[b]}`, r.toFixed(2), ok ? '통과' : (strict ? '미달' : '참고')]);
    if (strict) ok ? pass++ : fail++;
  }
  for (const k of WHITE_ON) {
    if (!T[k]) continue;
    const r = ratio('#ffffff', T[k]);
    rows.push([name, 'white #ffffff', `${k} ${T[k]}`, r.toFixed(2), r >= 4.5 ? '통과' : (strict ? '미달' : '참고')]);
    if (strict) r >= 4.5 ? pass++ : fail++;
  }
}
run('밝은', light, true);
run('어두운', dark, true);

console.log('\n테마 | 글자 | 배경 | 대비 | 판정');
rows.forEach(r => console.log(r.join(' | ')));
const bad = rows.filter(r => r[4] === '미달' || r[3] === '토큰 없음');
console.log(`\n${bad.length ? '  ✗ 4.5:1 미달 ' + bad.length + '곳' : '  ✓ 밝은·어두운 테마 주요 조합 ' + pass + '개 모두 4.5:1 이상'}`);
console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
