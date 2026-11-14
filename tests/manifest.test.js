// 앱 설치 정보(site.webmanifest) — 11-15: 첫 버전(10-11)의 빨강 #f6465d 가 남아 설치한 앱 윗줄 색이 사이트 파랑과 달랐다
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (name, ok, info) => { if (ok) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info ? '  ' + info : '')); } };
const R = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const m = JSON.parse(R('site.webmanifest'));
const meta = (R('index.html').match(/name="theme-color" content="([^"]+)"/) || [])[1];
check('manifest theme_color = index.html theme-color', m.theme_color === meta, m.theme_color + ' vs ' + meta);
check('이름·짧은 이름·시작 주소·standalone', m.name === '한국철도맵' && m.short_name && m.start_url && m.display === 'standalone');
check('아이콘 192·512 파일이 있음', ['192x192', '512x512'].every(s => { const i = m.icons.find(x => x.sizes === s); return i && fs.existsSync(path.join(__dirname, '..', i.src)); }));
check('index.html 이 manifest 를 연결', /rel="manifest" href="site\.webmanifest"/.test(R('index.html')));
check('서비스 워커 미리 받기 목록에 manifest', /site\.webmanifest/.test(R('sw.js')));
console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
