// 404.html (11-15): GitHub Pages 는 없는 주소에 이 파일을 보여 준다 — 어느 깊이(/kr-rail-map/line/없는것.html)에서 열려도
// 링크·아이콘이 살아 있도록 /kr-rail-map/ 절대 주소만 쓰는지, 검색엔진 색인 안 함·통계 태그가 있는지 본다.
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (name, ok, info) => { if (ok) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info ? '  ' + info : '')); } };
const s = fs.readFileSync(path.join(__dirname, '..', '404.html'), 'utf8');
const refs = [...s.matchAll(/(?:href|src)="([^"]+)"/g)].map(m => m[1]);
const local = refs.filter(u => !/^https:\/\//.test(u));
check('404.html 의 내부 링크·아이콘은 모두 /kr-rail-map/ 로 시작', local.length >= 4 && local.every(u => u.startsWith('/kr-rail-map/')), local.filter(u => !u.startsWith('/kr-rail-map/')).join(', '));
check('가리키는 파일이 실제로 있음', local.every(u => fs.existsSync(path.join(__dirname, '..', u.replace('/kr-rail-map/', '') || 'index.html'))));
check('검색엔진 색인 안 함 (noindex)', /name="robots" content="noindex"/.test(s));
check('통계 태그 exclude-search', /data-exclude-search="true"/.test(s));
check('한국어 페이지·지도로 가기 링크', /lang="ko"/.test(s) && /지도로 가기/.test(s));
console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
