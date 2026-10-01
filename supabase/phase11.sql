alter table public.posts add column if not exists thought_style text;

alter table public.profiles add column if not exists scripture_text text;
alter table public.profiles add column if not exists scripture_style text;

create table if not exists public.scripture_notes (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  content text not null,
  style text not null default 'red',
  updated_at timestamptz not null default now()
);

alter table public.scripture_notes enable row level security;

drop policy if exists "scripture_notes_select" on public.scripture_notes;
drop policy if exists "scripture_notes_write_own" on public.scripture_notes;

create policy "scripture_notes_select"
  on public.scripture_notes for select
  to authenticated
  using (true);

create policy "scripture_notes_write_own"
  on public.scripture_notes for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
