-- Fix infinite recursion between the Courses and profiles RLS policies.
--
-- teacher_applications.sql made courses_instructor_read_own check the profiles
-- table (to require an instructor role), while bilx_schema.sql has a profiles
-- policy (profiles_read_public_course_instructors) that checks the Courses
-- table. Reading Courses -> reads profiles -> reads Courses -> ... = recursion,
-- which aborts every Courses query (including the admin's, so no courses load).
--
-- The role check is moved into a SECURITY DEFINER function. Such functions run
-- as their owner and bypass RLS on the tables they read, so checking the role no
-- longer re-enters the profiles/Courses policies. Run this after the base
-- schema and teacher_applications.sql.

create or replace function public.is_approved_instructor()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role = 'instructor'
  );
$$;

grant execute on function public.is_approved_instructor() to authenticated, anon;

-- Courses: instructor policies use the function instead of an inline profiles
-- subquery.
drop policy if exists "courses_instructor_read_own" on public."Courses";
create policy "courses_instructor_read_own"
  on public."Courses" for select
  using (instructor_id = auth.uid() and public.is_approved_instructor());

drop policy if exists "courses_instructor_insert_own" on public."Courses";
create policy "courses_instructor_insert_own"
  on public."Courses" for insert
  with check (instructor_id = auth.uid() and public.is_approved_instructor());

drop policy if exists "courses_instructor_update_own" on public."Courses";
create policy "courses_instructor_update_own"
  on public."Courses" for update
  using (instructor_id = auth.uid() and public.is_approved_instructor())
  with check (instructor_id = auth.uid() and public.is_approved_instructor());

-- videos: write policies use the function (no profiles join).
drop policy if exists "videos_insert_for_course_owner" on public.videos;
create policy "videos_insert_for_course_owner"
  on public.videos for insert
  with check (
    public.is_approved_instructor()
    and exists (select 1 from public."Courses" c where c.id = videos.course_id and c.instructor_id = auth.uid())
  );

drop policy if exists "videos_update_for_course_owner" on public.videos;
create policy "videos_update_for_course_owner"
  on public.videos for update
  using (
    public.is_approved_instructor()
    and exists (select 1 from public."Courses" c where c.id = videos.course_id and c.instructor_id = auth.uid())
  )
  with check (
    public.is_approved_instructor()
    and exists (select 1 from public."Courses" c where c.id = videos.course_id and c.instructor_id = auth.uid())
  );

drop policy if exists "videos_delete_for_course_owner" on public.videos;
create policy "videos_delete_for_course_owner"
  on public.videos for delete
  using (
    public.is_approved_instructor()
    and exists (select 1 from public."Courses" c where c.id = videos.course_id and c.instructor_id = auth.uid())
  );

notify pgrst, 'reload schema';
