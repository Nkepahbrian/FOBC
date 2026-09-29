-- Phase 5: pinned feed, music, location, tags, and profile links.
-- Run in the Supabase SQL editor. Safe to re-run.

alter table public.posts add column if not exists location text;
alter table public.posts add column if not exists is_pinned boolean not null default false;
alter table public.posts add column if not exists amen_count integer not null default 0;
alter table public.posts add column if not exists song_title text;
alter table public.posts add column if not exists song_artist text;
alter table public.posts add column if not exists song_url text;
alter table public.posts add column if not exists tagged_user_ids uuid[] not null default '{}';

alter table public.profiles add column if not exists website text;
alter table public.profiles add column if not exists instagram text;

create index if not exists posts_pin_amen_idx
  on public.posts (is_pinned desc, amen_count desc, created_at desc);
