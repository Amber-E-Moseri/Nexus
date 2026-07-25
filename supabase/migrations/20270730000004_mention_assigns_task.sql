-- Fix: make mention_user_on_task also assign the task (not just add as follower)

create or replace function public.mention_user_on_task(p_task_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task record;
  v_actor_name text;
  v_mentions_disabled boolean;
begin
  select id, title, is_personal, assignee_id, created_by, department_id
  into v_task
  from public.tasks where id = p_task_id;

  if v_task.id is null then
    raise exception 'Task not found';
  end if;

  if not public.user_can_view_task(p_task_id) then
    raise exception 'Not authorized to mention on this task';
  end if;

  if v_task.is_personal and not (
    v_task.assignee_id = auth.uid()
    or v_task.created_by = auth.uid()
    or public.current_user_role() = 'super_admin'
  ) then
    raise exception 'Only the task owner may loop in additional people on a personal task';
  end if;

  -- ADD TO ASSIGNEES (new)
  insert into public.task_assignees (task_id, user_id)
  values (p_task_id, p_user_id)
  on conflict (task_id, user_id) do nothing;

  -- ADD AS FOLLOWER (existing)
  insert into public.task_follows (task_id, user_id, added_via, added_by)
  values (p_task_id, p_user_id, 'mention', auth.uid())
  on conflict (user_id, task_id) do update
    set added_via = 'mention', added_by = excluded.added_by
    where public.task_follows.added_via = 'manual';

  if p_user_id = auth.uid() then
    return false;
  end if;

  select exists (
    select 1 from public.user_notification_prefs
    where user_id = p_user_id and notification_type = 'mention' and in_app = false
  ) into v_mentions_disabled;

  if v_mentions_disabled then
    return false;
  end if;

  select name into v_actor_name from public.users where id = auth.uid();

  insert into public.notifications (user_id, type, payload)
  values (
    p_user_id,
    'mention',
    jsonb_build_object('actor_name', v_actor_name, 'task_title', v_task.title, 'task_id', p_task_id)
  );

  return true;
end;
$$;

grant execute on function public.mention_user_on_task(uuid, uuid) to authenticated;
