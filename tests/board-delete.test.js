/* 게시판 글 삭제 요청 안내 시험 (H6, 2026-11-14 · 68점 평가 17번)
 * 서버 규칙(RLS)은 읽기·쓰기·신고만 허용한다 → 쓴 사람도 직접 못 지운다. 그 대신 삭제 요청 경로가 화면 두 곳에 있어야 한다.
 * 실행: node tests/board-delete.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
let pass = 0, fail = 0;
function check(label, cond) { if (cond) { pass++; console.log(`  ✓ ${label}`); } else { fail++; console.log(`  ✗ ${label}`); } }
const board = read('board.html'), talk = read('js/station-talk.js');
check('게시판 규칙에 직접 삭제가 안 되는 이유(익명) + 삭제 요청 링크', /직접 고치거나 지울 수 없어요/.test(board) && /id="del-link"/.test(board) && /삭제 요청/.test(board));
check('삭제 요청 링크는 설정의 의견 양식(feedbackUrl)으로 채운다', /\$\('del-link'\)\.href = C\.feedbackUrl/.test(board));
check('요청할 때 적을 것(시각·닉네임·첫 문장) 안내', /시각·닉네임·첫 문장/.test(board));
check('역 상세 한마디에도 삭제 요청 길', /board\.html#del-link/.test(talk));
console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
