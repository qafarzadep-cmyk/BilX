-- Run this in Supabase SQL Editor.
-- It lets instructors add lesson videos to their own courses, and lets
-- enrolled students watch lessons after admin grants access.

grant usage on schema public to anon, authenticated;
grant select on public.course_lessons to anon, authenticated;
grant insert, update, delete on public.course_lessons to authenticated;
grant usage, select on all sequences in schema public to authenticated;

alter table public.course_lessons enable row level security;

drop policy if exists "course_lessons_select_for_owner_or_enrolled"
  on public.course_lessons;
drop policy if exists "course_lessons_insert_for_course_owner"
  on public.course_lessons;
drop policy if exists "course_lessons_update_for_course_owner"
  on public.course_lessons;
drop policy if exists "course_lessons_delete_for_course_owner"
  on public.course_lessons;

create policy "course_lessons_select_for_owner_or_enrolled"
  on public.course_lessons
  for select
  using (
    exists (
      select 1
      from public."Courses" c
      where c.id::text = course_lessons.course_id::text
        and c.instructor_id::text = auth.uid()::text
    )
    or exists (
      select 1
      from public.enrollments e
      where e.course_id::text = course_lessons.course_id::text
        and coalesce(e.status, 'active') = 'active'
        and (
          e.user_id::text = auth.uid()::text
          or lower(e.user_id::text) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
    )
  );

create policy "course_lessons_insert_for_course_owner"
  on public.course_lessons
  for insert
  with check (
    exists (
      select 1
      from public."Courses" c
      where c.id::text = course_lessons.course_id::text
        and c.instructor_id::text = auth.uid()::text
    )
  );

create policy "course_lessons_update_for_course_owner"
  on public.course_lessons
  for update
  using (
    exists (
      select 1
      from public."Courses" c
      where c.id::text = course_lessons.course_id::text
        and c.instructor_id::text = auth.uid()::text
    )
  )
  with check (
    exists (
      select 1
      from public."Courses" c
      where c.id::text = course_lessons.course_id::text
        and c.instructor_id::text = auth.uid()::text
    )
  );

create policy "course_lessons_delete_for_course_owner"
  on public.course_lessons
  for delete
  using (
    exists (
      select 1
      from public."Courses" c
      where c.id::text = course_lessons.course_id::text
        and c.instructor_id::text = auth.uid()::text
    )
  );
