-- Phase 8: store the chosen audio snippet start.
-- Run in the Supabase SQL editor. Safe to re-run.

alter table public.posts add column if not exists song_snippet_start double precision;
