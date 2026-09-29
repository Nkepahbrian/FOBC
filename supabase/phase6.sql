-- Phase 6: playable post audio.
-- Run in the Supabase SQL editor. Safe to re-run.

alter table public.posts add column if not exists audio_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'music_tracks',
  'music_tracks',
  true,
  20971520,
  array['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/aac', 'audio/webm', 'audio/x-m4a']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "music_tracks_public_read" on storage.objects;
drop policy if exists "music_tracks_owner_insert" on storage.objects;
drop policy if exists "music_tracks_owner_update" on storage.objects;
drop policy if exists "music_tracks_owner_delete" on storage.objects;

create policy "music_tracks_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'music_tracks');

create policy "music_tracks_owner_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'music_tracks'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "music_tracks_owner_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'music_tracks'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'music_tracks'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "music_tracks_owner_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'music_tracks'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
