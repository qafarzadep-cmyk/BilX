-- Repair the admin teacher approval flow.
-- Run this in the Supabase SQL Editor if the admin "Tesdiqle" button cannot
-- update teacher_applications because the review RPC or RLS policy is missing.

alter table public.teacher_applications
  add column if not exists reviewed_at timestamptz;

create or replace function public.admin_review_teacher_application(
  application_id bigint,
  decision text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user uuid;
  target_full_name text;
begin
  if lower(coalesce(auth.jwt() ->> 'email', '')) <> 'qafarzadep@gmail.com' then
    raise exception 'Only admin can review teacher applications';
  end if;

  if decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected';
  end if;

  select user_id, trim(name || ' ' || surname)
    into target_user, target_full_name
  from public.teacher_applications
  where id = application_id;

  if target_user is null then
    raise exception 'Teacher application not found';
  end if;

  update public.teacher_applications
  set status = decision,
      reviewed_at = now()
  where id = application_id;

  if decision = 'approved' then
    insert into public.profiles (user_id, full_name, role)
    values (target_user, target_full_name, 'instructor')
    on conflict (user_id) do update
      set role = 'instructor',
          full_name = excluded.full_name;
  end if;
end;
$$;

revoke execute on function public.admin_review_teacher_application(bigint, text) from public;
revoke execute on function public.admin_review_teacher_application(bigint, text) from anon;
grant execute on function public.admin_review_teacher_application(bigint, text) to authenticated;

drop policy if exists "teacher_applications_admin_update" on public.teacher_applications;
create policy "teacher_applications_admin_update"
  on public.teacher_applications for update
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'qafarzadep@gmail.com')
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'qafarzadep@gmail.com');

drop policy if exists "profiles_admin_update_all" on public.profiles;
create policy "profiles_admin_update_all"
  on public.profiles for update
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'qafarzadep@gmail.com')
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'qafarzadep@gmail.com');

drop policy if exists "profiles_admin_insert_all" on public.profiles;
create policy "profiles_admin_insert_all"
  on public.profiles for insert
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'qafarzadep@gmail.com');

notify pgrst, 'reload schema';
