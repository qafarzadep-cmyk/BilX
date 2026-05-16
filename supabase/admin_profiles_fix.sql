-- Fix admin visibility for signed-up users.
-- Run this in Supabase SQL Editor.

grant usage on schema public to anon, authenticated;
grant select, insert, update on public.profiles to authenticated;

alter table public.profiles enable row level security;

drop policy if exists "profiles_read_own_or_admin" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own_or_admin" on public.profiles;

create policy "profiles_read_own_or_admin"
  on public.profiles for select
  using (
    user_id = auth.uid()
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'qafarzadep@gmail.com'
  );

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (user_id = auth.uid());

create policy "profiles_update_own_or_admin"
  on public.profiles for update
  using (
    user_id = auth.uid()
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'qafarzadep@gmail.com'
  )
  with check (
    user_id = auth.uid()
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'qafarzadep@gmail.com'
  );

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    coalesce(new.raw_user_meta_data ->> 'role', 'student')
  )
  on conflict (user_id) do update
    set full_name = coalesce(excluded.full_name, public.profiles.full_name),
        role = coalesce(excluded.role, public.profiles.role);

  return new;
end;
$$;

drop trigger if exists create_profile_after_signup on auth.users;

create trigger create_profile_after_signup
  after insert on auth.users
  for each row execute function public.create_profile_for_new_user();

insert into public.profiles (user_id, full_name, role)
select
  id,
  coalesce(raw_user_meta_data ->> 'full_name', email),
  coalesce(raw_user_meta_data ->> 'role', 'student')
from auth.users
on conflict (user_id) do update
  set full_name = coalesce(excluded.full_name, public.profiles.full_name),
      role = coalesce(excluded.role, public.profiles.role);

create or replace function public.admin_list_users()
returns table (
  user_id uuid,
  email text,
  full_name text,
  role text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    u.id as user_id,
    u.email,
    coalesce(p.full_name, u.raw_user_meta_data ->> 'full_name', u.email) as full_name,
    coalesce(p.role, u.raw_user_meta_data ->> 'role', 'student') as role,
    u.created_at
  from auth.users u
  left join public.profiles p on p.user_id = u.id
  where lower(coalesce(auth.jwt() ->> 'email', '')) = 'qafarzadep@gmail.com'
  order by coalesce(p.full_name, u.raw_user_meta_data ->> 'full_name', u.email);
$$;

grant execute on function public.admin_list_users() to authenticated;
