/* README 의 노선 페이지·sitemap 수가 실제 파일과 같은지 (Q6, 2026-11-15 — '72 + 74' 로 낡아 있었다)
 * 실행: node tests/readme-numbers.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const pages = fs.readdirSync(path.join(ROOT, 'line')).filter(f => f.endsWith('.html')).length;
const urls = (fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8').match(/<url>/g) || []).length;
const m = /정적 랜딩 페이지 (\d+)개 \+ sitemap\((\d+) URL\)/.exec(readme);
let fail = 0;
const check = (l, c, d) => { if (c) console.log('  ✓ ' + l); else { fail++; console.log('  ✗ ' + l + ' ' + JSON.stringify(d)); } };
check('README 에 노선 페이지·sitemap 수 줄이 있음', !!m, null);
check('노선 페이지 수 = line/*.html (' + pages + ')', m && +m[1] === pages, m && m[1]);
check('sitemap URL 수 = sitemap.xml <url> (' + urls + ')', m && +m[2] === urls, m && m[2]);
console.log(fail ? '\n실패 ' + fail : '\n결과: 통과');
process.exit(fail ? 1 : 0);
