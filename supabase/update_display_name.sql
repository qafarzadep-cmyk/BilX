-- Let every authenticated user update only their own display name.
-- The function preserves profile roles and refreshes denormalized instructor
-- names on courses without granting direct profile-update permissions.

create or replace function public.update_my_display_name(p_full_name text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_name text := trim(regexp_replace(coalesce(p_full_name, ''), '\s+', ' ', 'g'));
  result public.profiles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if char_length(clean_name) < 2 or char_length(clean_name) > 100 then
    raise exception 'Name must be between 2 and 100 characters';
  end if;

  insert into public.profiles (user_id, full_name, role)
  values (auth.uid(), clean_name, 'student')
  on conflict (user_id) do update
    set full_name = excluded.full_name,
        updated_at = now()
  returning * into result;

  update public."Courses"
  set instructor_name = clean_name
  where instructor_id = auth.uid();

  return result;
end;
$$;

revoke all on function public.update_my_display_name(text) from public;
grant execute on function public.update_my_display_name(text) to authenticated;

notify pgrst, 'reload schema';
