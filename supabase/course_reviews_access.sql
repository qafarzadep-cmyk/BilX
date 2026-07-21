-- Run once in the Supabase SQL editor so BilX can read and save course reviews.
grant select, insert, update on table public.course_ratings to service_role;
grant usage, select on all sequences in schema public to service_role;

notify pgrst, 'reload schema';
