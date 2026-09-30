-- Phase 7: multi-image posts and storage buckets.
-- Run in the Supabase SQL editor. Safe to re-run.

alter table public.posts add column if not exists image_urls text[] not null default '{}';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'posts',
    'posts',
    true,
    52428800,
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm']
  ),
  (
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
