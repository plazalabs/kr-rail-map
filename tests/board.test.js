/* 게시판 (board.html · js/board.js · js/board-config.js · supabase/board.sql) 시험
 * 실행: node tests/board.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
global.window = {};
const B = require(path.join(ROOT, 'js/board.js'));

let pass = 0, fail = 0;
function check(name, ok, info) {
  if (ok) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info != null ? ' — ' + info : '')); }
}

console.log('\n[설정]');
check('비어 있으면 준비 중 (ready=false)', B.ready({ supabaseUrl: '', anonKey: '' }) === false);
check('Supabase 주소 + anon 키면 켜짐', B.ready({ supabaseUrl: 'https://abcdefgh.supabase.co', anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abcdefghijklmnop' }) === true);
check('다른 주소(http·다른 도메인)는 안 켜짐', !B.ready({ supabaseUrl: 'http://abcdefgh.supabase.co', anonKey: 'x'.repeat(40) }) && !B.ready({ supabaseUrl: 'https://evil.example.com', anonKey: 'x'.repeat(40) }));
const conf = read('js/board-config.js');
check('설정 파일에 service_role 키가 없다 (anon 만)', !/service_role["']?\s*[:=]\s*['"][^'"]+/.test(conf) && !/"role"\s*:\s*"service_role"/.test(conf));
check('배포 설정은 지금 비어 있음 (회장님 키 대기)', /supabaseUrl: ''/.test(conf) && /anonKey: ''/.test(conf));

console.log('\n[글 검사]');
check('2글자 미만 거절', !B.validate({ body: 'a' }).ok);
check('1,000자 넘으면 거절', !B.validate({ body: 'a'.repeat(1001) }).ok);
check('링크 3개 이상 거절 (광고)', !B.validate({ body: 'http://a http://b http://c 좋아요' }).ok);
check('숨은 칸(honeypot)에 값이 있으면 거절', !B.validate({ body: '안녕하세요', honeypot: 'x' }).ok);
const v = B.validate({ kind: 'weird', nick: '  ', station: ' 광운대 ', body: '  GTX-C 기대돼요  ' });
check('종류 모르면 자유·닉네임 비면 익명·앞뒤 공백 정리', v.ok && v.post.kind === 'free' && v.post.nick === '익명' && v.post.station === '광운대' && v.post.body === 'GTX-C 기대돼요', JSON.stringify(v));
check('닉네임 20자로 자름', B.validate({ nick: '가'.repeat(30), body: '안녕하세요' }).post.nick.length === 20);

console.log('\n[익명 아이디·시간]');
const mem = { v: {}, getItem(k) { return this.v[k] || null; }, setItem(k, x) { this.v[k] = x; } };
const a = B.clientId(mem), b = B.clientId(mem);
check('브라우저마다 고정 (두 번 불러도 같음)', a === b && /^[a-z0-9]{24}$/.test(a), a);
const now = Date.parse('2026-11-12T12:00:00Z');
check('방금 / 3분 전 / 2시간 전 / 어제', B.ago('2026-11-12T11:59:30Z', now) === '방금' && B.ago('2026-11-12T11:57:00Z', now) === '3분 전' &&
  B.ago('2026-11-12T10:00:00Z', now) === '2시간 전' && B.ago('2026-11-11T09:00:00Z', now) === '어제');

console.log('\n[화면] board.html — 글은 textContent 로만');
const html = read('board.html');
check('설정·모듈을 불러옴', /<script src="js\/board-config\.js"><\/script>/.test(html) && /<script src="js\/board\.js"><\/script>/.test(html));
check('글 내용을 innerHTML 로 넣지 않음 (XSS)', !/innerHTML\s*=\s*[^'"`]*\bp\./.test(html) && /b\.textContent = p\.body/.test(html) && /n\.textContent = p\.nick/.test(html));
check('준비 중 안내와 오류 제보 링크', /id="not-ready"/.test(html) && /id="fb-link"/.test(html));
check('밖에서 불러오는 스크립트 없음', !/<script[^>]+src="https?:/.test(html));

console.log('\n[DB] supabase/board.sql — 보안');
const sql = read('supabase/board.sql');
check('두 표 모두 RLS 켬', /alter table public\.board_posts enable row level security/.test(sql) && /alter table public\.board_reports enable row level security/.test(sql));
check('anon 은 숨김 아닌 글만 읽기', /for select to anon, authenticated using \(hidden = false\)/.test(sql));
check('anon 은 고치기·지우기 권한 없음', !/grant[^;]*\b(update|delete)\b[^;]*to anon/i.test(sql) && /revoke all on public\.board_posts from anon/.test(sql));
check('client_id 는 anon 이 읽을 수 없음', /grant select \(id, created_at, kind, nick, station, body, reports\)/.test(sql));
check('글자 수 제약 (내용 2~1000, 닉네임 1~20)', /char_length\(btrim\(body\)\) between 2 and 1000/.test(sql) && /char_length\(nick\) between 1 and 20/.test(sql));
check('도배 막기 트리거 + 신고 3건 숨김', /board_posts_guard/.test(sql) && /hidden = \(reports \+ 1 >= 3\)/.test(sql));

console.log('\n[연결]');
check('지도 메뉴에 게시판 링크', /href="board\.html"/.test(read('index.html')));
check('서비스워커 앱 셸에 board.html·board.js·board-config.js', ['board.html', 'js/board.js', 'js/board-config.js'].every(f => read('sw.js').includes("'./" + f + "'")));
check('사이트맵에 board.html', /kr-rail-map\/board\.html/.test(read('sitemap.xml')));

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
