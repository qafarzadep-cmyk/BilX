-- Allows server-side API routes that use SUPABASE_SERVICE_ROLE_KEY to read and
-- repair course access rows. RLS is still enabled; service_role bypasses RLS,
-- but it also needs table privileges.

grant usage on schema public to service_role;
grant select, insert, update, delete on public.enrollments to service_role;
grant usage, select on all sequences in schema public to service_role;
