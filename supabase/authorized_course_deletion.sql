-- Delete a course through one protected database operation.
-- Admins may delete any course. Instructors may delete only their own
-- unapproved, unpublished courses.

create or replace function public.delete_course_authorized(p_course_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_course public."Courses"%rowtype;
  video_ids jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into target_course
  from public."Courses"
  where id = p_course_id;

  if target_course.id is null then
    raise exception 'Course not found';
  end if;

  if not public.is_admin() and not (
    target_course.instructor_id = auth.uid()
    and target_course.is_published = false
    and target_course.status <> 'approved'
  ) then
    raise exception 'You cannot delete this course';
  end if;

  select coalesce(jsonb_agg(v.bunny_video_id) filter (where v.bunny_video_id is not null), '[]'::jsonb)
  into video_ids
  from public.videos v
  where v.course_id = p_course_id;

  delete from public."Courses" where id = p_course_id;

  return jsonb_build_object(
    'deleted', true,
    'videoIds', video_ids
  );
end;
$$;

revoke all on function public.delete_course_authorized(bigint) from public;
grant execute on function public.delete_course_authorized(bigint) to authenticated;

notify pgrst, 'reload schema';
