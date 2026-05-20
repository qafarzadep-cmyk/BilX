-- Bil-X Supabase RLS emergency check/fix.
-- Run the first SELECT in Supabase SQL Editor to see exactly which public tables
-- still have Row-Level Security disabled.

select
  schemaname,
  tablename,
  rowsecurity as rls_enabled
from pg_tables
where schemaname = 'public'
order by tablename;

-- If any table above shows rls_enabled = false, enable RLS before continuing.
-- These tables are referenced by the current app and should not be open without RLS.
-- The dynamic block avoids errors when an older table does not exist.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'public.profiles',
    'public."Courses"',
    'public.videos',
    'public.course_lessons',
    'public.enrollments',
    'public.video_progress',
    'public.requests',
    'public.teacher_applications'
  ]
  loop
    if to_regclass(table_name) is not null then
      execute format('alter table %s enable row level security', table_name);
    end if;
  end loop;
end $$;

-- Reduce anonymous access to only the tables that need public reading.
-- RLS policies still decide which rows can be seen.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'public.profiles',
    'public.videos',
    'public.course_lessons',
    'public.enrollments',
    'public.video_progress',
    'public.requests',
    'public.teacher_applications'
  ]
  loop
    if to_regclass(table_name) is not null then
      execute format('revoke all on %s from anon', table_name);
    end if;
  end loop;
end $$;

grant select on public."Courses" to anon, authenticated;
grant select on public.profiles to anon, authenticated;

-- Public catalog behavior:
-- - Visitors can see approved/published course rows.
-- - Visitors can see only the first lesson video for a published course as a preview.
-- - Enrolled students, course owners, and the admin keep their broader access
--   through the existing videos_read_for_owner_or_enrolled policy.

grant select on public.videos to anon, authenticated;

drop policy if exists "courses_public_read_approved" on public."Courses";
create policy "courses_public_read_approved"
  on public."Courses" for select
  using (is_published = true);

drop policy if exists "videos_public_preview_first_lesson" on public.videos;
create policy "videos_public_preview_first_lesson"
  on public.videos for select
  using (
    exists (
      select 1
      from public."Courses" c
      where c.id = videos.course_id
        and c.is_published = true
    )
    and not exists (
      select 1
      from public.videos earlier
      where earlier.course_id = videos.course_id
        and earlier.order_index < videos.order_index
    )
  );

notify pgrst, 'reload schema';

-- Run the Advisor again after this. If it still reports rls_disabled_in_public,
-- copy the tablename from the first SELECT and enable RLS for that table too.
