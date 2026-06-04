-- Phase 1 free preview lessons.
-- Adds a flag to mark lessons as free preview.

alter table public.videos
  add column if not exists is_free boolean not null default false;
