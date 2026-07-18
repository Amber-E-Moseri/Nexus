-- Add self-notify guard to create_task_notification.
-- Previously, callers were expected to skip the RPC when assigning to themselves.
-- This moves that check into the RPC so no call site can omit it.
-- Also fires from SubtaskList.jsx (the gap this migration ships alongside).
create or replace function public.create_task_notification(
  p_user_id uuid,
  p_type text,
  p_task_id uuid
)
returns public.notifications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task record;
  v_actor_name text;
  v_row public.notifications;
begin
  if p_type <> 'task_assigned' then
    raise exception 'Unsupported notification type for this RPC: %', p_type;
  end if;

  -- Don't notify users about their own actions
  if p_user_id = auth.uid() then
    return null;
  end if;

  select id, title, assignee_id, created_by, department_id, is_personal
  into v_task
  from public.tasks where id = p_task_id;

  if v_task.id is null or v_task.assignee_id <> p_user_id then
    raise exception 'Task not found or user is not the current assignee';
  end if;

  if not public.user_can_view_task(p_task_id) then
    raise exception 'Not authorized to send an assignment notification for this task';
  end if;

  -- Lightweight idempotency guard: dedup within 10 seconds for double-clicks/retries
  if exists (
    select 1 from public.notifications
    where user_id = p_user_id
      and type = p_type
      and payload->>'task_id' = p_task_id::text
      and created_at > now() - interval '10 seconds'
  ) then
    select * into v_row from public.notifications
    where user_id = p_user_id and type = p_type and payload->>'task_id' = p_task_id::text
    order by created_at desc limit 1;
    return v_row;
  end if;

  select name into v_actor_name from public.users where id = auth.uid();

  insert into public.notifications (user_id, type, payload)
  values (
    p_user_id,
    p_type,
    jsonb_build_object('actor_name', v_actor_name, 'task_title', v_task.title, 'task_id', p_task_id)
  )
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.create_task_notification(uuid, text, uuid) to authenticated;
