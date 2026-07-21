-- Deduplicated purchase requests while preserving the existing WhatsApp flow.
create or replace function public.create_purchase_request(
  p_course_id bigint,
  p_course_name text,
  p_user_email text,
  p_user_name text
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
    return existing_request;
  end if;

  insert into public.requests (user_id, user_email, user_name, course_id, course_name, status)
  values (auth.uid(), lower(trim(p_user_email)), trim(p_user_name), p_course_id, p_course_name, 'pending')
  returning * into created_request;
  return created_request;
end;
$$;

revoke all on function public.create_purchase_request(bigint, text, text, text) from public;
grant execute on function public.create_purchase_request(bigint, text, text, text) to authenticated;
