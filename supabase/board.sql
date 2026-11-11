-- 한국철도맵 게시판 — Supabase 'SQL Editor' 에 통째로 붙여 넣고 Run (2026-11-12)
--
-- 만드는 것
--   board_posts : 글 (누구나 읽기·쓰기, 고치기·지우기는 불가 — 관리자만 Supabase 화면에서)
--   board_reports : 신고 (같은 글에 같은 브라우저가 한 번만)
--   신고 3건 이상이면 자동으로 숨김 (목록에 안 나옴)
-- 보안
--   RLS(행 수준 보안)를 켜고, anon(공개 키) 에게는 '읽기 + 글 쓰기 + 신고' 만 허락한다.
--   service_role 키·DB 비밀번호는 사이트에 절대 넣지 않는다 (공개 키 anon 만 js/board-config.js 에).
--   글자 수·종류는 DB 제약으로 막는다 (브라우저 검사를 우회해도 DB 가 거절).
--   같은 내용 연달아 올리기(도배)는 트리거로 막는다: 같은 내용 10분 안 / 한 사람(client_id) 1분에 3개 넘게.

create table if not exists public.board_posts (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  kind        text not null default 'free' check (kind in ('free', 'station', 'dev')),
  nick        text not null default '익명' check (char_length(nick) between 1 and 20),
  station     text check (station is null or char_length(station) <= 30),
  body        text not null check (char_length(btrim(body)) between 2 and 1000),
  client_id   text not null check (char_length(client_id) between 8 and 64),
  reports     int  not null default 0,
  hidden      boolean not null default false
);
create index if not exists board_posts_created_idx on public.board_posts (created_at desc);
create index if not exists board_posts_station_idx on public.board_posts (station);

create table if not exists public.board_reports (
  post_id    bigint not null references public.board_posts(id) on delete cascade,
  client_id  text not null check (char_length(client_id) between 8 and 64),
  created_at timestamptz not null default now(),
  primary key (post_id, client_id)
);

-- 도배 막기
-- security definer: 검사에 client_id 를 읽어야 하는데 anon 에게는 그 열 읽기 권한이 없다
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
  new.reports := 0; new.hidden := false; new.created_at := now();   -- 브라우저가 보낸 값은 무시
  return new;
end $$;
drop trigger if exists board_posts_guard on public.board_posts;
create trigger board_posts_guard before insert on public.board_posts for each row execute function public.board_posts_guard();

-- 신고 → 3건 이상 숨김
create or replace function public.board_reports_after() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.board_posts set reports = reports + 1, hidden = (reports + 1 >= 3) where id = new.post_id;
  return new;
end $$;
drop trigger if exists board_reports_after on public.board_reports;
create trigger board_reports_after after insert on public.board_reports for each row execute function public.board_reports_after();

alter table public.board_posts enable row level security;
alter table public.board_reports enable row level security;

drop policy if exists "read visible posts" on public.board_posts;
create policy "read visible posts" on public.board_posts for select to anon, authenticated using (hidden = false);
drop policy if exists "write posts" on public.board_posts;
create policy "write posts" on public.board_posts for insert to anon, authenticated with check (hidden = false and reports = 0);
drop policy if exists "report posts" on public.board_reports;
create policy "report posts" on public.board_reports for insert to anon, authenticated with check (true);

-- anon 이 볼 수 있는 열만 (client_id 는 숨긴다)
revoke all on public.board_posts from anon, authenticated;
grant select (id, created_at, kind, nick, station, body, reports) on public.board_posts to anon, authenticated;
grant insert (kind, nick, station, body, client_id) on public.board_posts to anon, authenticated;
revoke all on public.board_reports from anon, authenticated;
grant insert (post_id, client_id) on public.board_reports to anon, authenticated;
