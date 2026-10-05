-- Phase 13: cascade post deletes into likes and comments, and allow authors to delete comments.
-- Safe to re-run. Skips any table that is not present yet.

do $$
declare
  rec record;
  target_table text;
begin
  foreach target_table in array array['likes', 'comments', 'post_amens', 'post_comments']
  loop
    if to_regclass('public.' || target_table) is null then
      continue;
    end if;

    for rec in
      select c.conname
      from pg_constraint c
      join pg_class r on r.oid = c.conrelid
      join pg_namespace n on n.oid = r.relnamespace
      join pg_class f on f.oid = c.confrelid
      where n.nspname = 'public'
        and r.relname = target_table
        and f.relname = 'posts'
        and c.contype = 'f'
        and c.confdeltype <> 'c'
    loop
      execute format('alter table public.%I drop constraint %I', target_table, rec.conname);
    end loop;

    if not exists (
      select 1
      from pg_constraint c
      join pg_class r on r.oid = c.conrelid
      join pg_namespace n on n.oid = r.relnamespace
      join pg_class f on f.oid = c.confrelid
      where n.nspname = 'public'
        and r.relname = target_table
        and f.relname = 'posts'
        and c.contype = 'f'
        and c.confdeltype = 'c'
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (post_id) references public.posts (id) on delete cascade',
        target_table,
        target_table || '_post_id_fkey'
      );
    end if;
  end loop;
end $$;

do $$
begin
  if to_regclass('public.comments') is not null then
    execute 'drop policy if exists "comments_delete_own" on public.comments';
    execute 'create policy "comments_delete_own" on public.comments for delete to authenticated using (user_id = auth.uid())';
  end if;

  if to_regclass('public.post_comments') is not null then
    execute 'drop policy if exists "post_comments_delete_own" on public.post_comments';
    execute 'create policy "post_comments_delete_own" on public.post_comments for delete to authenticated using (user_id = auth.uid())';
  end if;
end $$;
