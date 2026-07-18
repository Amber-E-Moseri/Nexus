-- Extend create_task_notification to support 'task_status_changed'.
-- Only two transitions are wired at the call sites: → completed and → blocked
-- (blocked shares category 'in_progress' with review, so call sites use legacy_key).
-- All other transitions fan-out only to task_follows watchers via activity-feed-generator.
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
  v_status record;
  v_actor_name text;
  v_payload jsonb;
  v_row public.notifications;
begin
  if p_type not in ('task_assigned', 'task_status_changed') then
    raise exception 'Unsupported notification type for this RPC: %', p_type;
  end if;

  -- Don't notify users about their own actions
  if p_user_id = auth.uid() then
    return null;
  end if;

  select id, title, assignee_id, status_id, created_by, department_id, is_personal
  into v_task
  from public.tasks where id = p_task_id;

  if v_task.id is null then
    raise exception 'Task not found: %', p_task_id;
  end if;

  if p_type = 'task_assigned' and v_task.assignee_id <> p_user_id then
    raise exception 'User is not the current assignee of task %', p_task_id;
  end if;

  if not public.user_can_view_task(p_task_id) then
    raise exception 'Not authorized to send a notification for this task';
  end if;

  -- Idempotency guard: dedup within 10 seconds for double-clicks/retries
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

  if p_type = 'task_assigned' then
    v_payload := jsonb_build_object(
      'actor_name', v_actor_name,
      'task_title', v_task.title,
      'task_id', p_task_id
    );
  else
    -- task_status_changed: derive status name from current DB state
    select name into v_status
    from public.task_status_definitions
    where id = v_task.status_id;

    v_payload := jsonb_build_object(
      'actor_name', v_actor_name,
      'task_title', v_task.title,
      'task_id', p_task_id,
      'new_status_name', coalesce(v_status.name, 'Unknown')
    );
  end if;

  insert into public.notifications (user_id, type, payload)
  values (p_user_id, p_type, v_payload)
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.create_task_notification(uuid, text, uuid) to authenticated;
