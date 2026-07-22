-- Allow the trusted BilX server API to resolve lessons and store comments.
-- This does not grant visitors or ordinary users any additional access.
begin;

grant select on table public.videos to service_role;
grant select, insert on table public.video_comments to service_role;
grant usage, select on sequence public.video_comments_id_seq to service_role;

commit;
