-- Phase 9: single image_url column and avatar filenames.
-- Run in the Supabase SQL editor. Safe to re-run.

alter table public.posts add column if not exists image_url text;

drop policy if exists "avatars_owner_insert" on storage.objects;
create policy "avatars_owner_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or name like auth.uid()::text || '-%'
    )
  );
