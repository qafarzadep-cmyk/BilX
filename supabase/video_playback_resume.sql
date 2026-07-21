-- Shared lesson/video resume state for desktop and mobile.
alter table public.video_progress
  add column if not exists position_seconds numeric not null default 0,
  add column if not exists last_opened_at timestamptz;

create index if not exists video_progress_user_last_opened_idx
  on public.video_progress (user_id, last_opened_at desc);
