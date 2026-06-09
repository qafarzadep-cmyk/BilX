-- Restore the minimum table privileges required by the server-side Bunny
-- upload authorization check. RLS policies and public/client access are
-- intentionally unchanged.

grant usage on schema public to service_role;
grant select on public.profiles to service_role;
grant select on public.teacher_applications to service_role;

notify pgrst, 'reload schema';
