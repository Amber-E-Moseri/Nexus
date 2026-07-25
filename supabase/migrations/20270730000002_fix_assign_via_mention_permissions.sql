-- Fix: relax assign_via_mention permissions to match comment access
-- If you can comment on a task (user_can_view_task check), you should be able
-- to @mention people to add them as assignees via that comment.

create or replace function public.assign_via_mention(
  p_task_id uuid,
  p_user_id uuid,
  p_comment_body text,
  p_commenter_name text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task record;
  v_mentions_disabled boolean;
  v_comment_preview text;
  v_is_new_assignee boolean;
begin
  -- Fetch task to verify it exists and get details
  select id, title, is_personal, assignee_id, created_by, department_id
  into v_task
  from public.tasks where id = p_task_id;

  if v_task.id is null then
    raise exception 'Task not found';
  end if;

  -- Authorization: same as comment insert policy — if you can view the task, you can mention
  if not public.user_can_view_task(p_task_id, auth.uid()) then
    raise exception 'Not authorized to mention on this task';
  end if;

  -- Personal tasks: only owner or super_admin can assign
  if v_task.is_personal and not (
    v_task.assignee_id = auth.uid()
    or v_task.created_by = auth.uid()
    or public.current_user_role() = 'super_admin'
  ) then
    raise exception 'Only the task owner may assign a personal task';
  end if;

  -- Add user to task_assignees (insert or skip if already assigned)
  insert into public.task_assignees (task_id, user_id)
  values (p_task_id, p_user_id)
  on conflict (task_id, user_id) do nothing;

  -- Check if this was a new assignment
  select not exists (
    select 1 from public.task_assignees
    where task_id = p_task_id and user_id = p_user_id
      and assigned_at < now() - interval '1 second'
  ) into v_is_new_assignee;

  -- Self-mentions don't send notifications (nothing to tell yourself)
  if p_user_id = auth.uid() then
    return false;
  end if;

  -- Check if user has disabled mention notifications
  select exists (
    select 1 from public.user_notification_prefs
    where user_id = p_user_id and notification_type = 'mention' and in_app = false
  ) into v_mentions_disabled;

  if v_mentions_disabled then
    return false;
  end if;

  -- Generate comment preview (first 150 chars)
  v_comment_preview := substring(p_comment_body, 1, 150);
  if length(p_comment_body) > 150 then
    v_comment_preview := v_comment_preview || '…';
  end if;

  -- Insert rich notification with context
  insert into public.notifications (user_id, type, payload)
  values (
    p_user_id,
    'mention',
    jsonb_build_object(
      'actor_name', p_commenter_name,
      'task_title', v_task.title,
      'task_id', p_task_id,
      'comment_preview', v_comment_preview,
      'is_new_assignment', v_is_new_assignee
    )
  );

  return true;
end;
$$;

grant execute on function public.assign_via_mention(uuid, uuid, text, text) to authenticated;
