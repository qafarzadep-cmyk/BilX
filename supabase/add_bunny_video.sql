-- ---------------------------------------------------------------------------
-- Bunny Stream video hosting.
--
-- Lessons are uploaded to a Bunny Stream video library and referenced here by
-- their Bunny video GUID. Playback uses short-lived, token-authenticated embed
-- URLs minted server-side (see api/bunny-playback.js), so a lesson's bytes are
-- never reachable from a plain, shareable URL.
--
-- Idempotent — safe to re-run. Already folded into reconcile.sql; this file is
-- here so an existing database can be upgraded without a full reconcile.
-- ---------------------------------------------------------------------------

-- Bunny video GUID for the lesson (null for legacy YouTube/Storage lessons).
alter table public.videos
  add column if not exists bunny_video_id text;

-- Where the lesson is hosted: 'bunny' for new uploads, 'legacy' for the old
-- YouTube-link / Supabase-Storage rows. Informational; the app branches on the
-- presence of bunny_video_id.
alter table public.videos
  add column if not exists video_source text not null default 'bunny';

-- Bunny lessons have no public URL, so video_url is no longer required.
alter table public.videos
  alter column video_url drop not null;

-- Tag pre-existing rows (which all carry a video_url) as legacy so the player
-- keeps serving them through the old YouTube/file path.
update public.videos
  set video_source = 'legacy'
  where bunny_video_id is null
    and video_url is not null
    and video_source = 'bunny';
