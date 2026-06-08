-- Dedicated public course trailers, separate from curriculum lessons.
-- Safe to run repeatedly.

create table if not exists public.course_trailers (
  course_id bigint primary key references public."Courses"(id) on delete cascade,
  bunny_video_id text not null,
  title text not null default 'Course preview',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.course_trailers to authenticated;
grant select on public.course_trailers to anon;

alter table public.course_trailers enable row level security;

drop policy if exists "course_trailers_read_visible" on public.course_trailers;
drop policy if exists "course_trailers_insert_owner" on public.course_trailers;
drop policy if exists "course_trailers_update_owner" on public.course_trailers;
drop policy if exists "course_trailers_delete_owner" on public.course_trailers;

create policy "course_trailers_read_visible"
  on public.course_trailers for select
  using (
    exists (
      select 1 from public."Courses" c
      where c.id = course_trailers.course_id
        and (
          (c.is_published = true and c.status = 'approved')
          or c.instructor_id = auth.uid()
          or public.is_admin()
        )
    )
  );

create policy "course_trailers_insert_owner"
  on public.course_trailers for insert
  with check (
    exists (
      select 1 from public."Courses" c
      where c.id = course_trailers.course_id
        and c.instructor_id = auth.uid()
        and c.is_published = false
        and c.status <> 'approved'
    )
  );

create policy "course_trailers_update_owner"
  on public.course_trailers for update
  using (
    exists (
      select 1 from public."Courses" c
      where c.id = course_trailers.course_id
        and c.instructor_id = auth.uid()
        and c.is_published = false
        and c.status <> 'approved'
    )
  )
  with check (
    exists (
      select 1 from public."Courses" c
      where c.id = course_trailers.course_id
        and c.instructor_id = auth.uid()
        and c.is_published = false
        and c.status <> 'approved'
    )
  );

create policy "course_trailers_delete_owner"
  on public.course_trailers for delete
  using (
    exists (
      select 1 from public."Courses" c
      where c.id = course_trailers.course_id
        and c.instructor_id = auth.uid()
        and c.is_published = false
        and c.status <> 'approved'
    )
  );

-- Include trailer Bunny ids in authorized course deletion cleanup.
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

  select coalesce(jsonb_agg(source.bunny_video_id), '[]'::jsonb)
  into video_ids
  from (
    select v.bunny_video_id
    from public.videos v
    where v.course_id = p_course_id and v.bunny_video_id is not null
    union all
    select t.bunny_video_id
    from public.course_trailers t
    where t.course_id = p_course_id and t.bunny_video_id is not null
  ) source;

  delete from public."Courses" where id = p_course_id;

  return jsonb_build_object('deleted', true, 'videoIds', video_ids);
end;
$$;

revoke all on function public.delete_course_authorized(bigint) from public;
grant execute on function public.delete_course_authorized(bigint) to authenticated;

notify pgrst, 'reload schema';
