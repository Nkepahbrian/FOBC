-- Phase 20: shared comment amens, shared Adelphoi counts, follow alerts, and live chat badges.
-- Safe to re-run in the Supabase SQL editor.

create table if not exists public.comment_likes (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (comment_id, user_id)
);

do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'comment_likes'
      and indexdef ilike '%(comment_id, user_id)%'
  ) then
    create unique index comment_likes_comment_user_key on public.comment_likes (comment_id, user_id);
  end if;
end $$;

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

do $$
begin
  if to_regclass('public.comments') is not null then
    alter table public.comments add column if not exists likes_count integer not null default 0;
    alter table public.comments add column if not exists like_count integer not null default 0;
  end if;
  if to_regclass('public.post_comments') is not null then
    alter table public.post_comments add column if not exists likes_count integer not null default 0;
    alter table public.post_comments add column if not exists like_count integer not null default 0;
  end if;
end $$;

do $$
declare
  constraint_name text;
begin
  if to_regclass('public.notifications') is null then
    return;
  end if;
  select con.conname into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'notifications'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%kind%';
  if constraint_name is not null then
    execute format('alter table public.notifications drop constraint %I', constraint_name);
  end if;
  alter table public.notifications
    add constraint notifications_kind_check
    check (kind in ('amen', 'comment', 'share', 'adelphoi', 'follow', 'system'));
exception
  when others then
    null;
end $$;

create or replace function public.sync_comment_amen_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.comment_id, old.comment_id);
  total integer;
begin
  select count(*)::integer into total from public.comment_likes where comment_id = target;
  if to_regclass('public.comments') is not null then
    update public.comments set likes_count = total, like_count = total where id = target;
  end if;
  if to_regclass('public.post_comments') is not null then
    update public.post_comments set likes_count = total, like_count = total where id = target;
  end if;
  return coalesce(new, old);
exception
  when others then
    return coalesce(new, old);
end;
$$;

drop trigger if exists sync_comment_amen_count on public.comment_likes;
create trigger sync_comment_amen_count
  after insert or delete on public.comment_likes
  for each row
  execute function public.sync_comment_amen_count();

create or replace function public.toggle_comment_amen(target_comment uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  total integer;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  insert into public.profiles (id, full_name)
  values (me, 'FOBC member')
  on conflict (id) do nothing;
  if exists (select 1 from public.comment_likes where comment_id = target_comment and user_id = me) then
    delete from public.comment_likes where comment_id = target_comment and user_id = me;
  else
    insert into public.comment_likes (comment_id, user_id)
    values (target_comment, me)
    on conflict (comment_id, user_id) do nothing;
  end if;
  select count(*)::integer into total from public.comment_likes where comment_id = target_comment;
  return total;
end;
$$;

create or replace function public.comment_amen_counts(comment_ids uuid[])
returns table (comment_id uuid, amen_count integer, liked_by_me boolean)
language sql
security definer
stable
set search_path = public
as $$
  select
    ids.id,
    coalesce(count(likes.user_id), 0)::integer,
    coalesce(bool_or(likes.user_id = auth.uid()), false)
  from unnest(comment_ids) as ids(id)
  left join public.comment_likes likes on likes.comment_id = ids.id
  group by ids.id;
$$;

revoke all on function public.toggle_comment_amen(uuid) from public;
revoke all on function public.comment_amen_counts(uuid[]) from public;
grant execute on function public.toggle_comment_amen(uuid) to authenticated;
grant execute on function public.comment_amen_counts(uuid[]) to authenticated;

create or replace function public.adelphos_count(target_id uuid)
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select count(*)::integer from public.follows where following_id = target_id;
$$;

create or replace function public.follow_adelphos(target_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or me = target_id then
    raise exception 'invalid follow';
  end if;
  insert into public.profiles (id, full_name)
  values (me, 'FOBC member')
  on conflict (id) do nothing;
  if not exists (
    select 1 from public.follows where follower_id = me and following_id = target_id
  ) then
    insert into public.follows (follower_id, following_id)
    values (me, target_id);
  end if;
  return public.adelphos_count(target_id);
end;
$$;

create or replace function public.unfollow_adelphos(target_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  delete from public.follows where follower_id = me and following_id = target_id;
  return public.adelphos_count(target_id);
end;
$$;

revoke all on function public.adelphos_count(uuid) from public;
revoke all on function public.follow_adelphos(uuid) from public;
revoke all on function public.unfollow_adelphos(uuid) from public;
grant execute on function public.adelphos_count(uuid) to authenticated;
grant execute on function public.follow_adelphos(uuid) to authenticated;
grant execute on function public.unfollow_adelphos(uuid) to authenticated;

create or replace function public.notify_new_adelphos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  follower_name text;
  notice text;
begin
  select coalesce(nullif(trim(full_name), ''), 'Someone') into follower_name
  from public.profiles
  where id = new.follower_id;
  notice := 'Adelphos ' || follower_name || ' is following you';

  if exists (
    select 1 from public.notifications
    where recipient_id = new.following_id
      and actor_id = new.follower_id
      and created_at between now() - interval '2 minutes' and now()
      and body = notice
  ) then
    return new;
  end if;

  begin
    insert into public.notifications (recipient_id, actor_id, kind, body, href, read, is_read)
    values (
      new.following_id,
      new.follower_id,
      'follow',
      notice,
      '/profile/' || new.follower_id::text || '?from=notifications',
      false,
      false
    );
  exception
    when others then
      begin
        insert into public.notifications (recipient_id, actor_id, kind, body, href, read)
        values (
          new.following_id,
          new.follower_id,
          'adelphoi',
          notice,
          '/profile/' || new.follower_id::text || '?from=notifications',
          false
        );
      exception
        when others then
          null;
      end;
  end;
  return new;
end;
$$;

drop trigger if exists notify_new_adelphos on public.follows;
create trigger notify_new_adelphos
  after insert on public.follows
  for each row
  execute function public.notify_new_adelphos();

do $$
declare
  target text;
begin
  foreach target in array array['follows', 'comment_likes', 'messages', 'notifications']
  loop
    if to_regclass('public.' || target) is not null
      and not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = target
      )
    then
      execute format('alter publication supabase_realtime add table public.%I', target);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
