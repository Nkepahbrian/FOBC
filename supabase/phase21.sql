-- Phase 21: confirmed follows, readable chat badges, and phone alerts.
-- Safe to re-run.

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
  return (select count(*)::integer from public.follows where following_id = target_id);
end;
$$;

alter table public.messages add column if not exists is_read boolean not null default false;

alter table public.notifications add column if not exists recipient_id uuid;
alter table public.notifications add column if not exists kind text;
alter table public.notifications add column if not exists body text;
alter table public.notifications add column if not exists href text;
alter table public.notifications add column if not exists title text;
alter table public.notifications add column if not exists message text;
alter table public.notifications add column if not exists read boolean not null default false;

notify pgrst, 'reload schema';

create or replace function public.mark_chat_read(other_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or other_id is null then
    return;
  end if;
  update public.messages
  set is_read = true
  where receiver_id = me and sender_id = other_id;
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
  return (select count(*)::integer from public.follows where following_id = target_id);
end;
$$;

revoke all on function public.follow_adelphos(uuid) from public;
revoke all on function public.unfollow_adelphos(uuid) from public;
revoke all on function public.mark_chat_read(uuid) from public;
grant execute on function public.follow_adelphos(uuid) to authenticated;
grant execute on function public.unfollow_adelphos(uuid) to authenticated;
grant execute on function public.mark_chat_read(uuid) to authenticated;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_select_authenticated" on public.push_subscriptions;
drop policy if exists "push_insert_own" on public.push_subscriptions;
drop policy if exists "push_delete_own" on public.push_subscriptions;

create policy "push_select_authenticated"
  on public.push_subscriptions for select
  to authenticated
  using (true);

create policy "push_insert_own"
  on public.push_subscriptions for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "push_update_own"
  on public.push_subscriptions for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "push_delete_own"
  on public.push_subscriptions for delete
  to authenticated
  using (user_id = auth.uid());

alter table public.follows enable row level security;

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

notify pgrst, 'reload schema';
