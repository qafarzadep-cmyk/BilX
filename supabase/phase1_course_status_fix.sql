-- Phase 1 course status alignment.
-- Run in Supabase SQL Editor after the base schema is installed.

alter table public."Courses"
  add column if not exists status text not null default 'draft';

-- Backfill missing or empty statuses using is_published.
update public."Courses"
set status = case
  when is_published = true then 'approved'
  else 'pending'
end
where status is null
  or trim(status) = '';
