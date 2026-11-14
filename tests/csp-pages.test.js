// 모든 공개 페이지에 CSP(Content-Security-Policy) — 11-15: 노선 페이지 76개에만 없었다 (build_pages.py 템플릿에 추가)
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const check = (name, ok, info) => { if (ok) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info ? '  ' + info : '')); } };
const pages = ['index.html', 'rank.html', 'data.html', 'board.html', '404.html', ...fs.readdirSync(path.join(ROOT, 'line')).filter(f => f.endsWith('.html')).map(f => 'line/' + f)];
const csp = p => (fs.readFileSync(path.join(ROOT, p), 'utf8').match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1] || '';
const none = pages.filter(p => !csp(p));
check(`공개 페이지 ${pages.length}개 모두 CSP 있음`, none.length === 0, none.slice(0, 5).join(', '));
const weak = pages.filter(p => { const c = csp(p); return c && (!/default-src 'self'/.test(c) || /script-src[^;]*'unsafe-inline'/.test(c) || /script-src[^;]*'unsafe-eval'/.test(c)); });
check("모두 default-src 'self' · 스크립트 인라인·eval 허용 없음", weak.length === 0, weak.slice(0, 5).join(', '));
check('노선 페이지 생성기(build_pages.py)에도 CSP', /Content-Security-Policy/.test(fs.readFileSync(path.join(ROOT, 'build_pages.py'), 'utf8')));
console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
