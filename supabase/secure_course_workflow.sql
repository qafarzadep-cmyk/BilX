-- Enforce the course approval workflow at database level.
-- Safe to run repeatedly.

drop policy if exists "courses_public_read_approved" on public."Courses";
drop policy if exists "courses_instructor_update_own" on public."Courses";
drop policy if exists "videos_read_for_owner_or_enrolled" on public.videos;
drop policy if exists "videos_update_for_course_owner" on public.videos;
drop policy if exists "videos_delete_for_course_owner" on public.videos;
drop policy if exists "course_sections_read_visible" on public.course_sections;
drop policy if exists "course_sections_update_owner" on public.course_sections;
drop policy if exists "course_sections_delete_owner" on public.course_sections;

create policy "courses_public_read_approved"
  on public."Courses" for select
  using (is_published = true and status = 'approved');

create policy "courses_instructor_update_own"
  on public."Courses" for update
  using (
    instructor_id = auth.uid()
    and public.is_approved_instructor()
    and is_published = false
    and status <> 'approved'
  )
  with check (
    instructor_id = auth.uid()
    and public.is_approved_instructor()
    and is_published = false
    and status in ('draft', 'pending', 'rejected')
  );

create policy "videos_read_for_owner_or_enrolled"
  on public.videos for select
  using (
    (
      videos.is_free = true
      and exists (
        select 1 from public."Courses" c
        where c.id = videos.course_id
          and c.is_published = true
          and c.status = 'approved'
      )
    )
    or exists (
      select 1 from public."Courses" c
      where c.id = videos.course_id and c.instructor_id = auth.uid()
    )
    or public.has_course_access(videos.course_id)
    or public.is_admin()
  );

create policy "videos_update_for_course_owner"
  on public.videos for update
  using (
    public.is_approved_instructor()
    and exists (
      select 1 from public."Courses" c
      where c.id = videos.course_id
        and c.instructor_id = auth.uid()
        and c.is_published = false
        and c.status <> 'approved'
    )
  )
  with check (
    public.is_approved_instructor()
    and exists (
      select 1 from public."Courses" c
      where c.id = videos.course_id
        and c.instructor_id = auth.uid()
        and c.is_published = false
        and c.status <> 'approved'
    )
  );

create policy "videos_delete_for_course_owner"
  on public.videos for delete
  using (
    public.is_approved_instructor()
    and exists (
      select 1 from public."Courses" c
      where c.id = videos.course_id
        and c.instructor_id = auth.uid()
        and c.is_published = false
        and c.status <> 'approved'
    )
  );

create policy "course_sections_read_visible"
  on public.course_sections for select
  using (
    exists (
      select 1 from public."Courses" c
      where c.id = course_sections.course_id
        and (
          (c.is_published = true and c.status = 'approved')
          or c.instructor_id = auth.uid()
          or public.is_admin()
          or public.has_course_access(c.id)
        )
    )
  );

create policy "course_sections_update_owner"
  on public.course_sections for update
  using (
    exists (
      select 1 from public."Courses" c
      where c.id = course_sections.course_id
        and c.instructor_id = auth.uid()
        and c.is_published = false
        and c.status <> 'approved'
    )
  )
  with check (
    exists (
      select 1 from public."Courses" c
      where c.id = course_sections.course_id
        and c.instructor_id = auth.uid()
        and c.is_published = false
        and c.status <> 'approved'
    )
  );

create policy "course_sections_delete_owner"
  on public.course_sections for delete
  using (
    exists (
      select 1 from public."Courses" c
      where c.id = course_sections.course_id
        and c.instructor_id = auth.uid()
        and c.is_published = false
        and c.status <> 'approved'
    )
  );

drop view if exists public.lesson_previews;
create view public.lesson_previews
with (security_invoker = false)
as
  select v.id, v.course_id, v.section_id, v.title, v.duration, v.order_index, v.is_free
  from public.videos v
  join public."Courses" c on c.id = v.course_id
  where c.is_published = true and c.status = 'approved';

grant select on public.lesson_previews to anon, authenticated;

notify pgrst, 'reload schema';
