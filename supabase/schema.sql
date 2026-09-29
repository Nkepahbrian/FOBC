-- Festival of Blessings Community (FOBC)
-- PostgreSQL schema for Supabase.
-- Run in the Supabase SQL editor (postgres role).

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone_number text,
  avatar_url text,
  bio text,
  role text not null default 'attendee',
  created_at timestamptz not null default now()
);

create unique index if not exists profiles_phone_number_key
  on public.profiles (phone_number)
  where phone_number is not null;

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  media_url text,
  media_type text,
  caption text,
  song_title text,
  song_artist text,
  song_url text,
  created_at timestamptz not null default now()
);

create index if not exists posts_user_id_idx on public.posts (user_id);
create index if not exists posts_created_at_idx on public.posts (created_at desc);

create table if not exists public.likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

create index if not exists likes_post_id_idx on public.likes (post_id);
create index if not exists likes_user_id_idx on public.likes (user_id);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists comments_post_id_idx on public.comments (post_id);
create index if not exists comments_user_id_idx on public.comments (user_id);

create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (follower_id, following_id),
  constraint follows_not_self check (follower_id <> following_id)
);

create index if not exists follows_follower_id_idx on public.follows (follower_id);
create index if not exists follows_following_id_idx on public.follows (following_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  receiver_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  constraint messages_not_self check (sender_id <> receiver_id)
);

create index if not exists messages_sender_id_idx on public.messages (sender_id);
create index if not exists messages_receiver_id_idx on public.messages (receiver_id, is_read);
create index if not exists messages_created_at_idx on public.messages (created_at desc);

create table if not exists public.daily_winners (
  id uuid primary key default gen_random_uuid(),
  day_number integer not null check (day_number > 0),
  post_id uuid not null references public.posts (id) on delete cascade,
  winning_date date not null unique,
  total_likes integer not null default 0 check (total_likes >= 0)
);

create index if not exists daily_winners_post_id_idx on public.daily_winners (post_id);

-- ---------------------------------------------------------------------------
-- Profile bootstrap
-- Creates a profile row when a Supabase auth user is created (phone OTP).
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone_number, avatar_url)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    new.phone,
    nullif(new.raw_user_meta_data ->> 'avatar_url', '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Top Blessing: highest engagement among posts created on the active day.
-- Score = (like count * 2) + comment count.
-- The active day is the current calendar day in the database timezone,
-- which lines up with the midnight Hall of Blessings snapshot.
-- ---------------------------------------------------------------------------

create or replace function public.get_top_pinned_post()
returns table (
  post_id uuid,
  user_id uuid,
  media_url text,
  media_type text,
  caption text,
  song_title text,
  song_artist text,
  song_url text,
  created_at timestamptz,
  like_count bigint,
  comment_count bigint,
  engagement_score bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    p.id as post_id,
    p.user_id,
    p.media_url,
    p.media_type,
    p.caption,
    p.song_title,
    p.song_artist,
    p.song_url,
    p.created_at,
    count(distinct l.id) as like_count,
    count(distinct c.id) as comment_count,
    (count(distinct l.id) * 2 + count(distinct c.id)) as engagement_score
  from public.posts p
  left join public.likes l on l.post_id = p.id
  left join public.comments c on c.post_id = p.id
  where p.created_at >= date_trunc('day', now())
    and p.created_at < date_trunc('day', now()) + interval '1 day'
  group by p.id
  order by engagement_score desc, like_count desc, p.created_at desc
  limit 1;
$$;

revoke all on function public.get_top_pinned_post() from public;
grant execute on function public.get_top_pinned_post() to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Authenticated users can read. Writes are limited to the caller's own rows.
-- daily_winners is read-only for clients; snapshots are written with the
-- service role, which bypasses RLS.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;
alter table public.follows enable row level security;
alter table public.messages enable row level security;
alter table public.daily_winners enable row level security;

drop policy if exists "profiles_select_authenticated" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_delete_own" on public.profiles;

create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "profiles_delete_own"
  on public.profiles for delete
  to authenticated
  using (id = auth.uid());

drop policy if exists "posts_select_authenticated" on public.posts;
drop policy if exists "posts_insert_own" on public.posts;
drop policy if exists "posts_update_own" on public.posts;
drop policy if exists "posts_delete_own" on public.posts;

create policy "posts_select_authenticated"
  on public.posts for select
  to authenticated
  using (true);

create policy "posts_insert_own"
  on public.posts for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "posts_update_own"
  on public.posts for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "posts_delete_own"
  on public.posts for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "likes_select_authenticated" on public.likes;
drop policy if exists "likes_insert_own" on public.likes;
drop policy if exists "likes_update_own" on public.likes;
drop policy if exists "likes_delete_own" on public.likes;

create policy "likes_select_authenticated"
  on public.likes for select
  to authenticated
  using (true);

create policy "likes_insert_own"
  on public.likes for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "likes_update_own"
  on public.likes for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "likes_delete_own"
  on public.likes for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "comments_select_authenticated" on public.comments;
drop policy if exists "comments_insert_own" on public.comments;
drop policy if exists "comments_update_own" on public.comments;
drop policy if exists "comments_delete_own" on public.comments;

create policy "comments_select_authenticated"
  on public.comments for select
  to authenticated
  using (true);

create policy "comments_insert_own"
  on public.comments for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "comments_update_own"
  on public.comments for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "comments_delete_own"
  on public.comments for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "follows_select_authenticated" on public.follows;
drop policy if exists "follows_insert_own" on public.follows;
drop policy if exists "follows_update_own" on public.follows;
drop policy if exists "follows_delete_own" on public.follows;

create policy "follows_select_authenticated"
  on public.follows for select
  to authenticated
  using (true);

create policy "follows_insert_own"
  on public.follows for insert
  to authenticated
  with check (follower_id = auth.uid());

create policy "follows_update_own"
  on public.follows for update
  to authenticated
  using (follower_id = auth.uid())
  with check (follower_id = auth.uid());

create policy "follows_delete_own"
  on public.follows for delete
  to authenticated
  using (follower_id = auth.uid());

drop policy if exists "messages_select_authenticated" on public.messages;
drop policy if exists "messages_insert_own" on public.messages;
drop policy if exists "messages_update_own" on public.messages;
drop policy if exists "messages_delete_own" on public.messages;

create policy "messages_select_authenticated"
  on public.messages for select
  to authenticated
  using (true);

create policy "messages_insert_own"
  on public.messages for insert
  to authenticated
  with check (sender_id = auth.uid());

-- Sender edits their own message. Receiver may mark is_read.
create policy "messages_update_own"
  on public.messages for update
  to authenticated
  using (sender_id = auth.uid() or receiver_id = auth.uid())
  with check (sender_id = auth.uid() or receiver_id = auth.uid());

create policy "messages_delete_own"
  on public.messages for delete
  to authenticated
  using (sender_id = auth.uid());

drop policy if exists "daily_winners_select_authenticated" on public.daily_winners;

create policy "daily_winners_select_authenticated"
  on public.daily_winners for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Storage buckets: avatars and posts
-- Objects are stored under {user_id}/... so writes stay self-only.
-- Buckets are public so feed and profile media can render from their URLs.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'avatars',
    'avatars',
    true,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  ),
  (
    'posts',
    'posts',
    true,
    52428800,
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime']
  )
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars_public_read" on storage.objects;
drop policy if exists "avatars_owner_insert" on storage.objects;
drop policy if exists "avatars_owner_update" on storage.objects;
drop policy if exists "avatars_owner_delete" on storage.objects;
drop policy if exists "posts_public_read" on storage.objects;
drop policy if exists "posts_owner_insert" on storage.objects;
drop policy if exists "posts_owner_update" on storage.objects;
drop policy if exists "posts_owner_delete" on storage.objects;

create policy "avatars_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

create policy "avatars_owner_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_owner_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_owner_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "posts_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'posts');

create policy "posts_owner_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'posts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "posts_owner_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'posts'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'posts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "posts_owner_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'posts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
