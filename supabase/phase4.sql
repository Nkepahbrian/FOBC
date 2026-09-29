-- Phase 4: live posts, amens, comments, and direct messages.
-- Run in the Supabase SQL editor. Safe to re-run.

alter table public.posts add column if not exists content text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'posts' and column_name = 'caption'
  ) then
    update public.posts set content = caption where content is null and caption is not null;
  end if;
end $$;

create table if not exists public.post_amens (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

create index if not exists post_amens_post_id_idx on public.post_amens (post_id);
create index if not exists post_amens_user_id_idx on public.post_amens (user_id);

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'likes'
  ) then
    insert into public.post_amens (post_id, user_id, created_at)
    select post_id, user_id, created_at
    from public.likes
    on conflict (post_id, user_id) do nothing;
  end if;
end $$;

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists post_comments_post_id_idx on public.post_comments (post_id);
create index if not exists post_comments_user_id_idx on public.post_comments (user_id);

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'comments'
  ) then
    insert into public.post_comments (post_id, user_id, content, created_at)
    select post_id, user_id, content, created_at
    from public.comments
    where not exists (
      select 1
      from public.post_comments existing
      where existing.post_id = public.comments.post_id
        and existing.user_id = public.comments.user_id
        and existing.content = public.comments.content
        and existing.created_at = public.comments.created_at
    );
  end if;
end $$;

alter table public.post_amens enable row level security;
alter table public.post_comments enable row level security;

drop policy if exists "post_amens_select_authenticated" on public.post_amens;
drop policy if exists "post_amens_insert_own" on public.post_amens;
drop policy if exists "post_amens_delete_own" on public.post_amens;
drop policy if exists "post_comments_select_authenticated" on public.post_comments;
drop policy if exists "post_comments_insert_own" on public.post_comments;

create policy "post_amens_select_authenticated"
  on public.post_amens for select
  to authenticated
  using (true);

create policy "post_amens_insert_own"
  on public.post_amens for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "post_amens_delete_own"
  on public.post_amens for delete
  to authenticated
  using (user_id = auth.uid());

create policy "post_comments_select_authenticated"
  on public.post_comments for select
  to authenticated
  using (true);

create policy "post_comments_insert_own"
  on public.post_comments for insert
  to authenticated
  with check (user_id = auth.uid());

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

alter table public.messages enable row level security;

drop policy if exists "messages_select_authenticated" on public.messages;
drop policy if exists "messages_insert_own" on public.messages;
drop policy if exists "messages_update_own" on public.messages;
drop policy if exists "messages_delete_own" on public.messages;

create policy "messages_select_authenticated"
  on public.messages for select
  to authenticated
  using (sender_id = auth.uid() or receiver_id = auth.uid());

create policy "messages_insert_own"
  on public.messages for insert
  to authenticated
  with check (sender_id = auth.uid());

create policy "messages_update_own"
  on public.messages for update
  to authenticated
  using (sender_id = auth.uid() or receiver_id = auth.uid())
  with check (sender_id = auth.uid() or receiver_id = auth.uid());

create policy "messages_delete_own"
  on public.messages for delete
  to authenticated
  using (sender_id = auth.uid());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'post_amens'
  ) then
    alter publication supabase_realtime add table public.post_amens;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'post_comments'
  ) then
    alter publication supabase_realtime add table public.post_comments;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
