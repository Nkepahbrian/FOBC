-- Phase 14: comment replies and comment amens.
-- Safe to re-run.

alter table public.comments add column if not exists parent_id uuid;
alter table public.post_comments add column if not exists parent_id uuid;

create table if not exists public.comment_likes (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (comment_id, user_id)
);

create index if not exists comment_likes_comment_id_idx on public.comment_likes (comment_id);

alter table public.comment_likes enable row level security;

drop policy if exists "comment_likes_select" on public.comment_likes;
drop policy if exists "comment_likes_insert_own" on public.comment_likes;
drop policy if exists "comment_likes_delete_own" on public.comment_likes;

create policy "comment_likes_select"
  on public.comment_likes for select
  to authenticated
  using (true);

create policy "comment_likes_insert_own"
  on public.comment_likes for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "comment_likes_delete_own"
  on public.comment_likes for delete
  to authenticated
  using (user_id = auth.uid());
