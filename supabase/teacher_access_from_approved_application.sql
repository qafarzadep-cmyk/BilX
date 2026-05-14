-- Let approved teacher applications count as instructor access.
-- Run this in Supabase SQL Editor.

drop policy if exists "courses_instructor_read_own" on public."Courses";
drop policy if exists "courses_instructor_insert_own" on public."Courses";
drop policy if exists "courses_instructor_update_own" on public."Courses";

create policy "courses_instructor_read_own"
  on public."Courses" for select
  using (
    instructor_id = auth.uid()
    and (
      exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'instructor')
      or exists (select 1 from public.teacher_applications a where a.user_id = auth.uid() and a.status = 'approved')
    )
  );

create policy "courses_instructor_insert_own"
  on public."Courses" for insert
  with check (
    instructor_id = auth.uid()
    and (
      exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'instructor')
      or exists (select 1 from public.teacher_applications a where a.user_id = auth.uid() and a.status = 'approved')
    )
  );

create policy "courses_instructor_update_own"
  on public."Courses" for update
  using (
    instructor_id = auth.uid()
    and (
      exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'instructor')
      or exists (select 1 from public.teacher_applications a where a.user_id = auth.uid() and a.status = 'approved')
    )
  )
  with check (
    instructor_id = auth.uid()
    and (
      exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'instructor')
      or exists (select 1 from public.teacher_applications a where a.user_id = auth.uid() and a.status = 'approved')
    )
  );

drop policy if exists "videos_insert_for_course_owner" on public.videos;
drop policy if exists "videos_update_for_course_owner" on public.videos;
drop policy if exists "videos_delete_for_course_owner" on public.videos;

create policy "videos_insert_for_course_owner"
  on public.videos for insert
  with check (
    exists (
      select 1
      from public."Courses" c
      where c.id = videos.course_id
        and c.instructor_id = auth.uid()
        and (
          exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'instructor')
          or exists (select 1 from public.teacher_applications a where a.user_id = auth.uid() and a.status = 'approved')
        )
    )
  );

create policy "videos_update_for_course_owner"
  on public.videos for update
  using (
    exists (
      select 1
      from public."Courses" c
      where c.id = videos.course_id
        and c.instructor_id = auth.uid()
        and (
          exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'instructor')
          or exists (select 1 from public.teacher_applications a where a.user_id = auth.uid() and a.status = 'approved')
        )
    )
  )
  with check (
    exists (
      select 1
      from public."Courses" c
      where c.id = videos.course_id
        and c.instructor_id = auth.uid()
        and (
          exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'instructor')
          or exists (select 1 from public.teacher_applications a where a.user_id = auth.uid() and a.status = 'approved')
        )
    )
  );

create policy "videos_delete_for_course_owner"
  on public.videos for delete
  using (
    exists (
      select 1
      from public."Courses" c
      where c.id = videos.course_id
        and c.instructor_id = auth.uid()
        and (
          exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'instructor')
          or exists (select 1 from public.teacher_applications a where a.user_id = auth.uid() and a.status = 'approved')
        )
    )
  );

notify pgrst, 'reload schema';
