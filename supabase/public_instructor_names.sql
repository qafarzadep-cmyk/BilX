-- Allow published course cards/pages to show the instructor's display name.
-- Run this in Supabase SQL Editor if your database already exists.

alter table public."Courses"
  add column if not exists instructor_name text;

do $$
begin
  if to_regclass('public.teacher_applications') is not null then
    execute $sql$
      update public.profiles p
      set full_name = trim(a.name || ' ' || a.surname)
      from public.teacher_applications a
      where p.user_id = a.user_id
        and a.status = 'approved'
        and nullif(trim(a.name || ' ' || a.surname), '') is not null
    $sql$;

    execute $sql$
      update public."Courses" c
      set instructor_name = trim(a.name || ' ' || a.surname)
      from public.teacher_applications a
      where c.instructor_id = a.user_id
        and a.status = 'approved'
        and nullif(trim(a.name || ' ' || a.surname), '') is not null
    $sql$;
  end if;
end $$;

update public."Courses" c
set instructor_name = p.full_name
from public.profiles p
where c.instructor_id = p.user_id
  and nullif(trim(coalesce(c.instructor_name, '')), '') is null
  and nullif(trim(coalesce(p.full_name, '')), '') is not null;

grant select on public.profiles to anon;
grant select on public.profiles to authenticated;

alter table public.profiles enable row level security;

drop policy if exists "profiles_read_public_course_instructors" on public.profiles;

create policy "profiles_read_public_course_instructors"
  on public.profiles for select
  using (
    role = 'instructor'
    and exists (
      select 1
      from public."Courses" c
      where c.instructor_id = profiles.user_id
        and c.is_published = true
    )
  );

notify pgrst, 'reload schema';
