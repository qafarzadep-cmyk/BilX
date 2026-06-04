-- Phase 1 email visibility hardening.
-- Ensures only admin can read admin-only tables with emails.

alter table public.enrollments enable row level security;
alter table public.requests enable row level security;
alter table public.teacher_applications enable row level security;

revoke all on public.enrollments from anon;
revoke all on public.requests from anon;
revoke all on public.teacher_applications from anon;

revoke all on public.enrollments from authenticated;
revoke all on public.requests from authenticated;
revoke all on public.teacher_applications from authenticated;

grant select, insert, update, delete on public.enrollments to authenticated;
grant select, insert, update on public.requests to authenticated;
grant select, insert, update on public.teacher_applications to authenticated;

-- Admin-only policies (match existing admin email check).
-- These are safe to run even if policies already exist.

drop policy if exists "enrollments_admin_all" on public.enrollments;
create policy "enrollments_admin_all"
  on public.enrollments for all
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'qafarzadep@gmail.com')
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'qafarzadep@gmail.com');

drop policy if exists "requests_admin_read_all" on public.requests;
create policy "requests_admin_read_all"
  on public.requests for select
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'qafarzadep@gmail.com');

drop policy if exists "requests_admin_update_all" on public.requests;
create policy "requests_admin_update_all"
  on public.requests for update
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'qafarzadep@gmail.com')
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'qafarzadep@gmail.com');

drop policy if exists "teacher_applications_read_own_or_admin" on public.teacher_applications;
create policy "teacher_applications_read_own_or_admin"
  on public.teacher_applications for select
  using (
    user_id = auth.uid()
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'qafarzadep@gmail.com'
  );

notify pgrst, 'reload schema';
