-- Deduplicated purchase requests while preserving the existing WhatsApp flow.
-- Remove orphaned requests left by previously deleted accounts, then make future
-- account deletion remove its purchase requests automatically.
delete from public.requests request
where request.user_id is null
   or not exists (
     select 1
     from auth.users account
     where account.id = request.user_id
   );

alter table public.requests
  drop constraint if exists requests_user_id_fkey;

alter table public.requests
  add constraint requests_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

-- Keep the current catalogue price in the course row and preserve the price
-- offered/paid at each stage of a purchase.
alter table public."Courses"
  add column if not exists regular_price numeric(10,2);

alter table public.requests
  add column if not exists requested_price numeric(10,2),
  add column if not exists currency text not null default 'AZN';

alter table public.enrollments
  add column if not exists price_paid numeric(10,2),
  add column if not exists currency text not null default 'AZN';

update public."Courses"
set price = 34.90,
    regular_price = 59.90
where id = 17;

update public.requests request
set requested_price = course.price,
    currency = 'AZN'
from public."Courses" course
where request.course_id = course.id
  and request.requested_price is null;

update public.enrollments enrollment
set price_paid = course.price,
    currency = 'AZN'
from public."Courses" course
where enrollment.course_id = course.id
  and enrollment.price_paid is null;

drop function if exists public.create_purchase_request(bigint, text, text, text);

create or replace function public.create_purchase_request(
  p_course_id bigint,
  p_course_name text,
  p_user_email text,
  p_user_name text,
  p_requested_price numeric
)
returns public.requests
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_request public.requests;
  created_request public.requests;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into existing_request
  from public.requests
  where user_id = auth.uid()
    and course_id = p_course_id
    and status = 'pending'
  order by created_at desc
  limit 1;

  if existing_request.id is not null then
    if existing_request.requested_price is null then
      update public.requests
      set requested_price = p_requested_price,
          currency = 'AZN'
      where id = existing_request.id
      returning * into existing_request;
    end if;
    return existing_request;
  end if;

  insert into public.requests (user_id, user_email, user_name, course_id, course_name, status, requested_price, currency)
  values (auth.uid(), lower(trim(p_user_email)), trim(p_user_name), p_course_id, p_course_name, 'pending', p_requested_price, 'AZN')
  returning * into created_request;
  return created_request;
end;
$$;

revoke all on function public.create_purchase_request(bigint, text, text, text, numeric) from public;
grant execute on function public.create_purchase_request(bigint, text, text, text, numeric) to authenticated;
