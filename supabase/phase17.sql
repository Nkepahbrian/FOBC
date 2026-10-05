-- Phase 17: persistent comment like totals.
-- Safe to re-run. Per-user rows stay in comment_likes.

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'comments'
  ) then
    alter table public.comments add column if not exists likes_count integer not null default 0;
    alter table public.comments add column if not exists like_count integer not null default 0;
  end if;

  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'post_comments'
  ) then
    alter table public.post_comments add column if not exists likes_count integer not null default 0;
    alter table public.post_comments add column if not exists like_count integer not null default 0;
  end if;
end $$;
