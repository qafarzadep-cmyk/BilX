-- Bil-X final Advisor cleanup for SECURITY DEFINER RPC warnings.
-- IMPORTANT: deploy the updated frontend first, then run this SQL.
-- The admin page no longer calls these RPC functions after the code update.

-- Keep admin profile writes possible through normal RLS-protected table access.
drop policy if exists "profiles_admin_insert_all" on public.profiles;
create policy "profiles_admin_insert_all"
  on public.profiles for insert
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'qafarzadep@gmail.com');

-- Remove direct RPC access to SECURITY DEFINER functions from signed-in users.
revoke execute on function public.admin_list_users() from authenticated;

do $$
begin
  if to_regprocedure('public.review_teacher_application(text,bigint)') is not null then
    revoke execute on function public.review_teacher_application(text, bigint) from authenticated;
  end if;

  if to_regprocedure('public.review_teacher_application(bigint,text)') is not null then
    revoke execute on function public.review_teacher_application(bigint, text) from authenticated;
  end if;
end $$;

notify pgrst, 'reload schema';
