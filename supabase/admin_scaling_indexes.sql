-- BilX admin/query scaling indexes.
-- Safe to run repeatedly: no data is changed or deleted.

create index if not exists enrollments_status_enrolled_at_idx on public.enrollments (status, enrolled_at desc);
create index if not exists enrollments_course_status_idx on public.enrollments (course_id, status);
create index if not exists enrollments_user_status_idx on public.enrollments (lower(user_id), status);
create index if not exists requests_status_created_at_idx on public.requests (status, created_at desc);
create index if not exists requests_course_status_idx on public.requests (course_id, status);
create index if not exists requests_user_id_created_at_idx on public.requests (user_id, created_at desc);
create index if not exists requests_user_email_created_at_idx on public.requests (lower(user_email), created_at desc);
create index if not exists teacher_applications_status_created_at_idx on public.teacher_applications (status, created_at desc);
create index if not exists courses_status_created_at_idx on public."Courses" (status, created_at desc);
create index if not exists courses_instructor_created_at_idx on public."Courses" (instructor_id, created_at desc);
create index if not exists videos_course_order_idx on public.videos (course_id, order_index);
create index if not exists video_progress_user_updated_idx on public.video_progress (user_id, updated_at desc);
create index if not exists inbox_messages_sender_created_idx on public.inbox_messages (sender_id, created_at desc);
create index if not exists inbox_messages_recipient_created_idx on public.inbox_messages (recipient_id, created_at desc);
