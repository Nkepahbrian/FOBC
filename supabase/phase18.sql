-- Phase 18: follow notifications and live Adelphoi counts.
-- Safe to re-run in the Supabase SQL editor.

alter table public.notifications add column if not exists user_id uuid;
alter table public.notifications add column if not exists type text;
alter table public.notifications add column if not exists title text;
alter table public.notifications add column if not exists message text;

do $$
declare
  constraint_name text;
begin
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
end $$;

alter table public.notifications
  add constraint notifications_kind_check
  check (kind in ('amen', 'comment', 'share', 'adelphoi', 'follow', 'system'));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'follows'
  ) then
    alter publication supabase_realtime add table public.follows;
  end if;
end $$;
