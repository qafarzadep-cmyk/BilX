-- Safely move one lesson up or down inside its current course section.
-- Only the owner of an unapproved course may reorder its lessons.

create or replace function public.reorder_my_lesson(
  p_video_id bigint,
  p_direction integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_video public.videos%rowtype;
  target_video public.videos%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_direction not in (-1, 1) then
    raise exception 'Direction must be -1 or 1';
  end if;

  select v.*
  into current_video
  from public.videos v
  join public."Courses" c on c.id = v.course_id
  where v.id = p_video_id
    and c.instructor_id = auth.uid()
    and c.is_published = false
    and coalesce(c.status, 'draft') <> 'approved'
  for update of v;

  if current_video.id is null then
    raise exception 'Lesson cannot be reordered';
  end if;

  -- Older lessons may contain gaps or duplicate positions. Normalize only this
  -- section before swapping so every move remains deterministic.
  with ranked as (
    select
      v.id,
      row_number() over (order by v.order_index, v.id)::integer as next_order
    from public.videos v
    where v.course_id = current_video.course_id
      and v.section_id is not distinct from current_video.section_id
  )
  update public.videos v
  set order_index = ranked.next_order
  from ranked
  where v.id = ranked.id;

  select *
  into current_video
  from public.videos
  where id = p_video_id
  for update;

  if p_direction = -1 then
    select v.*
    into target_video
    from public.videos v
    where v.course_id = current_video.course_id
      and v.section_id is not distinct from current_video.section_id
      and v.order_index < current_video.order_index
    order by v.order_index desc, v.id desc
    limit 1
    for update;
  else
    select v.*
    into target_video
    from public.videos v
    where v.course_id = current_video.course_id
      and v.section_id is not distinct from current_video.section_id
      and v.order_index > current_video.order_index
    order by v.order_index asc, v.id asc
    limit 1
    for update;
  end if;

  if target_video.id is null then
    return;
  end if;

  update public.videos
  set order_index = target_video.order_index
  where id = current_video.id;

  update public.videos
  set order_index = current_video.order_index
  where id = target_video.id;
end;
$$;

revoke all on function public.reorder_my_lesson(bigint, integer) from public;
grant execute on function public.reorder_my_lesson(bigint, integer) to authenticated;

notify pgrst, 'reload schema';
