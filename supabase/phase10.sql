-- Phase 10: leaderboard amen counts.
-- Run in the Supabase SQL editor. Safe to re-run.

alter table public.posts add column if not exists likes_count integer not null default 0;
