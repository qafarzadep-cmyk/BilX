-- Fix teacher application approval if reviewed_at column is missing.
-- Run this in Supabase SQL Editor.

create or replace function public.review_teacher_application(
  app_decision text,
  app_id bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user uuid;
begin
  if lower(coalesce(auth.jwt() ->> 'email', '')) <> 'qafarzadep@gmail.com' then
    raise exception 'Yalnız admin müəllim müraciətlərini təsdiqləyə bilər';
  end if;

  if app_decision not in ('approved', 'rejected') then
    raise exception 'Qərar approved və ya rejected olmalıdır';
  end if;

  select user_id into target_user
  from public.teacher_applications
  where id = app_id
    and status = 'pending';

  if target_user is null then
    raise exception 'Təsdiq gözləyən müraciət tapılmadı';
  end if;

  update public.teacher_applications
  set status = app_decision
  where id = app_id;

  if app_decision = 'approved' then
    insert into public.profiles (user_id, role)
    values (target_user, 'instructor')
    on conflict (user_id) do update
      set role = 'instructor';
  end if;
end;
$$;

grant execute on function public.review_teacher_application(text, bigint) to authenticated;

notify pgrst, 'reload schema';
