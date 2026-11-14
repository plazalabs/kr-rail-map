// js/ink.js — 노선 색 글자 대비 4.5:1 (axe 11-15)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js/ink.js'), 'utf8'), ctx);
const K = ctx.window.KRInk;
let pass = 0, fail = 0;
const check = (l, c, d) => { if (c) { pass++; console.log('  ✓ ' + l); } else { fail++; console.log('  ✗ ' + l + '  ' + (d || '')); } };
const colors = ['#00a84d', '#ef7c1c', '#77c4a3', '#6ea8fe', '#0052a4', '#ffd400', '#00a651', '#945e8c', '#6a5acd', '#007e89', '#d4003b', '#bdb092'];
for (const c of colors) {
  const w = K.onWhiteText(c), t = K.asText(c, '#f6f7f9'), d = K.asTextDark(c, '#1c2024');
  check(c + ' → 흰 글자 바탕 ' + w + ' (' + K.ratio(w, '#ffffff').toFixed(2) + ')', K.ratio(w, '#ffffff') >= 4.5);
  check(c + ' → 밝은 바탕 글자 ' + t + ' (' + K.ratio(t, '#f6f7f9').toFixed(2) + ')', K.ratio(t, '#f6f7f9') >= 4.5);
  check(c + ' → 어두운 바탕 글자 ' + d + ' (' + K.ratio(d, '#1c2024').toFixed(2) + ')', K.ratio(d, '#1c2024') >= 4.5);
}
check('이미 넉넉한 색은 그대로 (#0052a4 흰 글자)', K.onWhiteText('#0052A4') === '#0052a4');
check('잘못된 색은 그대로 돌려줌', K.onWhiteText('red') === 'red');
console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
