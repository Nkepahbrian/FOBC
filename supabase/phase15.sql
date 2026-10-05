-- Phase 15: unread notification flag.
-- Safe to re-run. Keeps the existing read column in sync.

alter table public.notifications add column if not exists is_read boolean not null default false;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notifications'
      and column_name = 'read'
  ) then
    update public.notifications
      set is_read = read
      where is_read is distinct from read;
  end if;
end $$;

create index if not exists notifications_recipient_is_read_idx
  on public.notifications (recipient_id, is_read, created_at desc);
