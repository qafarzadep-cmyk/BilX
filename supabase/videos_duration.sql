-- Optional lesson metadata used by the teacher dashboard and course player.
-- Run this in the Supabase SQL Editor to persist lesson durations.

alter table public.videos
  add column if not exists duration text;
