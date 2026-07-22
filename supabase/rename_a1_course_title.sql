-- Rename the A1 course at its canonical source and update saved title snapshots.
-- Idempotent: it is safe to run this file more than once.
begin;

update public."Courses"
set title = 'Addım-addım ingiliscə (A1 səviyyəsi)',
    updated_at = now()
where id = 17;

update public.requests
set course_name = 'Addım-addım ingiliscə (A1 səviyyəsi)'
where course_id::text = '17';

update public.notifications
set body = replace(
  body,
  'Sıfırdan İngiliscə Danışıq kursu (A1 Level)',
  'Addım-addım ingiliscə (A1 səviyyəsi)'
)
where body like '%Sıfırdan İngiliscə Danışıq kursu (A1 Level)%';

update public.inbox_messages
set body = replace(
  body,
  'Sıfırdan İngiliscə Danışıq kursu (A1 Level)',
  'Addım-addım ingiliscə (A1 səviyyəsi)'
)
where body like '%Sıfırdan İngiliscə Danışıq kursu (A1 Level)%';

commit;
