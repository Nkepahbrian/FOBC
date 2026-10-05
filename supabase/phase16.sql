-- Phase 16: comment like counts stored on the comment row.
-- Safe to re-run. comment_likes remains the per-user record.

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'comments'
  ) then
    alter table public.comments add column if not exists like_count integer not null default 0;
  end if;

  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'post_comments'
  ) then
    alter table public.post_comments add column if not exists like_count integer not null default 0;
  end if;
end $$;
