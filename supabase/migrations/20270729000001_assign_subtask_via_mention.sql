-- ========================================================
-- Subtask Assignment via @mention
-- ========================================================
-- Allow @mentioning users in subtask comments to assign
-- the subtask directly (not the parent task).

create or replace function public.assign_subtask_via_mention(
  p_subtask_id uuid,
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
  v_subtask record;
  v_task record;
  v_mentions_disabled boolean;
  v_comment_preview text;
  v_is_new_assignee boolean;
begin
  -- Fetch subtask to verify it exists and get details
  select id, title, task_id, assignee_id
  into v_subtask
  from public.task_subtasks where id = p_subtask_id;

  if v_subtask.id is null then
    raise exception 'Subtask not found';
  end if;

  -- Fetch parent task for context
  select id, title, is_personal, created_by, department_id
  into v_task
  from public.tasks where id = v_subtask.task_id;

  if v_task.id is null then
    raise exception 'Parent task not found';
  end if;

  -- Authorization: if you can view the task, you can mention on its subtasks
  if not public.user_can_view_task(v_task.id, auth.uid()) then
    raise exception 'Not authorized to mention on this subtask';
  end if;

  -- Personal tasks: only owner or super_admin can assign
  if v_task.is_personal and not (
    v_task.created_by = auth.uid()
    or public.current_user_role() = 'super_admin'
  ) then
    raise exception 'Only the task owner may assign subtasks';
  end if;

  -- Assign subtask (update assignee_id)
  -- Check if already assigned
  v_is_new_assignee := v_subtask.assignee_id is distinct from p_user_id;

  update public.task_subtasks
  set assignee_id = p_user_id, assigned_at = now()
  where id = p_subtask_id;

  -- Self-mentions don't send notifications
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

  -- Generate comment preview
  v_comment_preview := substring(p_comment_body, 1, 150);
  if length(p_comment_body) > 150 then
    v_comment_preview := v_comment_preview || '…';
  end if;

  -- Insert rich notification with subtask context
  insert into public.notifications (user_id, type, payload)
  values (
    p_user_id,
    'mention',
    jsonb_build_object(
      'actor_name', p_commenter_name,
      'task_title', v_task.title,
      'task_id', v_task.id,
      'subtask_title', v_subtask.title,
      'subtask_id', p_subtask_id,
      'comment_preview', v_comment_preview,
      'is_new_assignment', v_is_new_assignee,
      'assignment_type', 'subtask'
    )
  );

  return true;
end;
$$;

grant execute on function public.assign_subtask_via_mention(uuid, uuid, text, text) to authenticated;
