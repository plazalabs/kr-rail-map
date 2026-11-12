-- 한국철도맵 게시판 — 도배·신고 남발 막기 2판 (감사 N11, 2026-11-13)
-- 이미 board.sql 을 실행한 프로젝트에 '추가로' 한 번 붙여 넣고 Run. 여러 번 실행해도 같은 결과(멱등).
--
-- 무엇이 바뀌나
--   글쓰기 : (기존) 같은 내용 10분 안 금지 · 한 사람 1분에 3개까지
--            + 한 사람 1시간에 20개까지 · 사이트 전체 10분에 120개까지(한꺼번에 몰려드는 도배를 멈춤)
--   신고   : (기존) 같은 글에 같은 사람 한 번 · 3건이면 숨김
--            + 자기 글은 신고 못 함 · 한 사람 1시간에 10건까지 · 사이트 전체 10분에 60건까지
-- 한계 (솔직히)
--   '사람'은 브라우저가 만든 무작위 번호(client_id)라서, 작정하고 번호를 바꿔 가며 보내면 사람별 제한은 피할 수 있다.
--   그래서 사이트 전체 상한을 같이 둔다. IP 주소는 개인정보라 모으지 않는다.
--   잘못 숨겨진 글은 관리자가 Supabase 'Table Editor' 에서 hidden 을 false 로 바꾸면 다시 보인다.

create index if not exists board_posts_client_idx on public.board_posts (client_id, created_at desc);
create index if not exists board_reports_client_idx on public.board_reports (client_id, created_at desc);
create index if not exists board_reports_created_idx on public.board_reports (created_at desc);

-- 글쓰기 검사 (기존 것을 바꿔 씀)
create or replace function public.board_posts_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.board_posts
             where body = new.body and created_at > now() - interval '10 minutes') then
    raise exception '같은 내용을 방금 올렸어요';
  end if;
  if (select count(*) from public.board_posts
      where client_id = new.client_id and created_at > now() - interval '1 minute') >= 3 then
    raise exception '잠시 뒤에 다시 올려 주세요';
  end if;
  if (select count(*) from public.board_posts
      where client_id = new.client_id and created_at > now() - interval '1 hour') >= 20 then
    raise exception '한 시간에 올릴 수 있는 글을 다 썼어요. 조금 뒤에 다시 올려 주세요';
  end if;
  if (select count(*) from public.board_posts
      where created_at > now() - interval '10 minutes') >= 120 then
    raise exception '지금 글이 너무 많이 올라오고 있어요. 잠시 뒤에 다시 올려 주세요';
  end if;
  new.reports := 0; new.hidden := false; new.created_at := now();   -- 브라우저가 보낸 값은 무시
  return new;
end $$;
drop trigger if exists board_posts_guard on public.board_posts;
create trigger board_posts_guard before insert on public.board_posts for each row execute function public.board_posts_guard();

-- 신고 검사 (새로)
create or replace function public.board_reports_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.board_posts where id = new.post_id and client_id = new.client_id) then
    raise exception '자기 글은 신고할 수 없어요';
  end if;
  if (select count(*) from public.board_reports
      where client_id = new.client_id and created_at > now() - interval '1 hour') >= 10 then
    raise exception '한 시간에 할 수 있는 신고를 다 했어요';
  end if;
  if (select count(*) from public.board_reports
      where created_at > now() - interval '10 minutes') >= 60 then
    raise exception '지금 신고가 너무 많아요. 잠시 뒤에 다시 해 주세요';
  end if;
  new.created_at := now();
  return new;
end $$;
drop trigger if exists board_reports_guard on public.board_reports;
create trigger board_reports_guard before insert on public.board_reports for each row execute function public.board_reports_guard();
