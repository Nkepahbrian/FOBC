-- Phase 19: let every new account sign in immediately.
-- confirmed_at is generated from email_confirmed_at, so only email_confirmed_at is written.
-- Safe to re-run in the Supabase SQL editor.

create or replace function public.auto_confirm_auth_user()
returns trigger
language plpgsql
security definer
set search_path = auth, public
as $$
begin
  if new.email_confirmed_at is null then
    new.email_confirmed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists auto_confirm_auth_user on auth.users;
create trigger auto_confirm_auth_user
  before insert on auth.users
  for each row
  execute function public.auto_confirm_auth_user();

update auth.users
set email_confirmed_at = now()
where email_confirmed_at is null;

create or replace function public.confirm_email_signup(target_email text)
returns void
language plpgsql
security definer
set search_path = auth, public
as $$
begin
  update auth.users
  set email_confirmed_at = now()
  where lower(email) = lower(target_email)
    and email_confirmed_at is null;
end;
$$;

revoke all on function public.confirm_email_signup(text) from public;
grant execute on function public.confirm_email_signup(text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
