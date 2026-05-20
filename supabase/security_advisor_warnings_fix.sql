-- Bil-X Supabase Advisor warning fixes.
-- Run in Supabase SQL Editor after security_rls_emergency_check.sql.

-- 1) Remove old overly broad course insert policy.
-- Public course reading stays allowed by courses_public_read_approved.
drop policy if exists "Enable insert for authenticated users only" on public."Courses";

drop policy if exists "courses_instructor_insert_own" on public."Courses";
create policy "courses_instructor_insert_own"
  on public."Courses" for insert
  with check (
    instructor_id = auth.uid()
    and (
      lower(coalesce(auth.jwt() ->> 'email', '')) = 'qafarzadep@gmail.com'
      or exists (
        select 1
        from public.profiles p
        where p.user_id = auth.uid()
          and p.role = 'instructor'
      )
      or exists (
        select 1
        from public.teacher_applications a
        where a.user_id = auth.uid()
          and a.status = 'approved'
      )
    )
  );

-- 2) Public buckets do not need broad SELECT policies for public object URLs.
-- This stops anonymous clients from listing every object in thumbnails/videos.
drop policy if exists "Allow reads 1livt5k_0" on storage.objects;

-- 3) SECURITY DEFINER functions: remove anonymous/public execute access.
-- create_profile_for_new_user is a trigger function and should not be callable
-- directly through /rest/v1/rpc.
revoke execute on function public.create_profile_for_new_user() from public;
revoke execute on function public.create_profile_for_new_user() from anon;
revoke execute on function public.create_profile_for_new_user() from authenticated;

-- rls_auto_enable was only an admin/maintenance helper and should not be callable.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public;
    revoke execute on function public.rls_auto_enable() from anon;
    revoke execute on function public.rls_auto_enable() from authenticated;
  end if;
end $$;

-- admin_list_users and review_teacher_application are used by the admin page.
-- Anonymous users should never be able to call them.
revoke execute on function public.admin_list_users() from public;
revoke execute on function public.admin_list_users() from anon;
grant execute on function public.admin_list_users() to authenticated;

do $$
begin
  if to_regprocedure('public.review_teacher_application(text,bigint)') is not null then
    revoke execute on function public.review_teacher_application(text, bigint) from public;
    revoke execute on function public.review_teacher_application(text, bigint) from anon;
    grant execute on function public.review_teacher_application(text, bigint) to authenticated;
  end if;

  if to_regprocedure('public.review_teacher_application(bigint,text)') is not null then
    revoke execute on function public.review_teacher_application(bigint, text) from public;
    revoke execute on function public.review_teacher_application(bigint, text) from anon;
    grant execute on function public.review_teacher_application(bigint, text) to authenticated;
  end if;
end $$;

notify pgrst, 'reload schema';

-- Manual setting:
-- For "Leaked Password Protection Disabled", open:
-- Authentication -> Settings -> Password Security
-- and enable leaked password protection / HaveIBeenPwned protection.
