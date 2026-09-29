-- Phase 3 migration for an existing FOBC database.
-- Run in the Supabase SQL editor after schema.sql.

alter table public.posts add column if not exists category text not null default 'general';
alter table public.posts add column if not exists tags text[] not null default '{}';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'posts_category_check'
  ) then
    alter table public.posts
      add constraint posts_category_check
      check (category in ('testimony', 'prayer_request', 'sermon_note', 'general'));
  end if;
end $$;

create index if not exists posts_category_idx on public.posts (category, created_at desc);

create table if not exists public.prayers (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

create index if not exists prayers_post_id_idx on public.prayers (post_id);
create index if not exists prayers_user_id_idx on public.prayers (user_id);

create table if not exists public.live_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  details text,
  stream_url text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists live_events_starts_at_idx on public.live_events (starts_at);

alter table public.prayers enable row level security;
alter table public.live_events enable row level security;

drop policy if exists "prayers_select_authenticated" on public.prayers;
drop policy if exists "prayers_insert_own" on public.prayers;
drop policy if exists "prayers_delete_own" on public.prayers;
drop policy if exists "live_events_select_authenticated" on public.live_events;

create policy "prayers_select_authenticated"
  on public.prayers for select
  to authenticated
  using (true);

create policy "prayers_insert_own"
  on public.prayers for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "prayers_delete_own"
  on public.prayers for delete
  to authenticated
  using (user_id = auth.uid());

create policy "live_events_select_authenticated"
  on public.live_events for select
  to authenticated
  using (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'prayers'
  ) then
    alter publication supabase_realtime add table public.prayers;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'likes'
  ) then
    alter publication supabase_realtime add table public.likes;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'posts'
  ) then
    alter publication supabase_realtime add table public.posts;
  end if;
end $$;
