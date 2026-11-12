/* 화면에 나가는 파일에 이모지·그림 문자가 없어야 한다 (디자인 결함 전수 수정, 2026-11-12)
 * 아이콘은 js/icons.js 의 SVG 선 아이콘 하나로. 주석 안의 글자는 화면에 안 나가므로 뺀다.
 * 실행: node tests/no-emoji.test.js        (목록 보기: node tests/no-emoji.test.js --list)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let stripJs, stripCss, stripHtml;
try { ({ stripJs, stripCss, stripHtml } = require(path.join(ROOT, 'tools', 'build_public.js'))); } catch (e) { /* 없으면 주석까지 검사 */ }

// 이모지·그림 문자: 이모지 블록, 기타 기호(☆✕◎ 등), 화살표 그림(⬆), 변형 선택자
// 허용: 한글·숫자·일반 문장부호, 그리고 글자로 쓰는 화살표 → ← ↓ (U+2190~2193), 가운뎃점 ·, ▲▼ (순위 등락 — 글자 기호)
const BAD = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{25A0}-\u{25B1}\u{25B4}-\u{25BB}\u{25BE}-\u{25FF}\u{FE0F}\u{2194}-\u{21FF}]/u;
const FILES = ['index.html', 'rank.html', 'board.html', 'data.html']
  .concat(fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f))
  .concat(['css/style.css']);

const hits = [];
for (const rel of FILES) {
  let src = fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
  if (stripJs) src = rel.endsWith('.js') ? stripJs(src) : rel.endsWith('.css') ? stripCss(src) : stripHtml(src);
  src.split('\n').forEach((line, i) => {
    const m = line.match(new RegExp(BAD.source, 'gu'));
    if (m) hits.push({ rel, line: i + 1, chars: [...new Set(m)].join(''), text: line.trim().slice(0, 90) });
  });
}
if (process.argv.includes('--list')) hits.forEach(h => console.log(`${h.rel}:${h.line}  ${h.chars}  ${h.text}`));
const byChar = {};
hits.forEach(h => [...h.chars].forEach(c => { byChar[c] = (byChar[c] || 0) + 1; }));
console.log(`\n이모지·그림 문자 남은 줄: ${hits.length}  ${Object.entries(byChar).map(([c, n]) => c + '×' + n).join(' ')}`);
if (hits.length) {
  console.log('  ✗ 화면 파일에 이모지가 남아 있음 — 위 목록(--list)을 js/icons.js 아이콘으로 바꿀 것');
  console.log(`\n결과: 0 통과 / 1 실패`);
  process.exit(1);
}
console.log('  ✓ 이모지 0건');
console.log(`\n결과: 1 통과 / 0 실패`);
