/* 게시판·후원 설정 — 회장님이 값을 채우면 켜진다 (비어 있으면 '준비 중')
 *
 * 1) Supabase 가입 → 새 프로젝트 → 'SQL Editor' 에 supabase/board.sql 을 붙여 넣고 Run
 * 2) Project Settings → API 에서 'Project URL' 과 'anon public' 키를 아래에 넣는다
 *    ⚠️ service_role 키·DB 비밀번호는 절대 여기 넣지 말 것 (사이트에 공개된다). anon 키는 공개돼도 되는 키다
 *       — 할 수 있는 일은 board.sql 의 RLS 가 '읽기·글 쓰기·신고' 로만 묶어 둔다.
 * 3) 커피 후원: 토스·카카오페이 송금 링크 (https://… 로 시작)
 */
window.KR_BOARD_CONFIG = {
  supabaseUrl: '',      // 예: 'https://abcdefgh.supabase.co'
  anonKey: '',          // 예: 'eyJhbGciOi…' (anon public)
  coffeeUrl: '',        // 예: 'https://toss.me/아이디'
  feedbackUrl: 'https://docs.google.com/forms/d/e/1FAIpQLScv2JPh45AjKo9Lif7SM4hCQtCqrN5BofI_xeJ04Wh9unPaXw/viewform',   // 지금 쓰는 '오류 제보' 구글 폼
};
