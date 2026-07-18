-- Task-assignment notifications only. Does NOT replace the generic createNotification()
-- helper (src/features/notifications/lib/notifications.js) — that's used by 10+
-- unrelated flows (support tickets, invitations, sprint lifecycle, Flock CRM follow-ups,
-- calendar approvals, integration requests), most of which have no task_id at all.
-- This RPC is only used at the two 'task_assigned' call sites: TaskModal.jsx and
-- TaskDetailSidebar.jsx (sprint context), both of which currently call
-- createNotification(assigneeId, 'task_assigned', {...}) via the shared helper — which
-- is exactly what's blocked today for non-super_admin actors by notifications_insert
-- RLS (user_id = auth.uid() or super_admin).
--
-- Content is derived server-side from real DB state, not trusted from the client, so a
-- caller can't fabricate an arbitrary "you were assigned this" notification.
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

  select id, title, assignee_id, created_by, department_id, is_personal
  into v_task
  from public.tasks where id = p_task_id;

  if v_task.id is null or v_task.assignee_id <> p_user_id then
    raise exception 'Task not found or user is not the current assignee';
  end if;

  -- Caller-side check via the shared predicate (20260718000000) — without this, any
  -- authenticated org member could call this RPC for any task+assignee pair they can
  -- enumerate and repeatedly fire bogus "you've been assigned" notifications at a
  -- colleague for a task they had no part in assigning. The assignee already has
  -- legitimate visibility into their own task, so this isn't an access-control bypass,
  -- but it is an unauthenticated-relative-to-the-task spam primitive without this check.
  if not public.user_can_view_task(p_task_id) then
    raise exception 'Not authorized to send an assignment notification for this task';
  end if;

  -- Lightweight idempotency guard: a client double-click or retry shouldn't produce two
  -- identical notifications. Not a durable access grant like task_follows, so a simple
  -- recent-duplicate check is enough rather than a unique constraint (which would
  -- wrongly block a legitimate later reassignment back to the same person).
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
