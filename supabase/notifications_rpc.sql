-- In-app notifications for other users.
--
-- The `notifications_insert_own` RLS policy only lets a user insert rows where
-- user_id = auth.uid(). That blocks the legitimate cases where one user needs to
-- notify another: a student commenting/rating notifies the course instructor, and
-- an inbox message notifies its recipient. Those client-side inserts were silently
-- failing. Route them through this SECURITY DEFINER function instead.

create or replace function public.create_notification(
  p_user_id uuid,
  p_title text,
  p_body text default null,
  p_link text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only authenticated users may send notifications.
  if auth.uid() is null then
    raise exception 'Must be authenticated to send notifications';
  end if;

  -- Nothing to do if there is no recipient.
  if p_user_id is null then
    return;
  end if;

  insert into public.notifications (user_id, title, body, link)
  values (p_user_id, p_title, p_body, p_link);
end;
$$;

grant execute on function public.create_notification(uuid, text, text, text) to authenticated;

notify pgrst, 'reload schema';
