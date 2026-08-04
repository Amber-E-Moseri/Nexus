-- Bring assign_subtask_via_mention up to parity with assign_via_mention.
--
-- Three issues fixed:
--   1. Return type was `boolean`; frontend expects table(success, assigned_user_id, notify_sent).
--   2. Auth used the narrow user_can_view_task() helper — misses sprint members and
--      null-dept subtasks. Replaced with the same inline check used by assign_via_mention.
--   3. Mentioned user was never inserted into task_follows, so cross-department users
--      @mentioned on a subtask comment could not read the thread.

drop function if exists public.assign_subtask_via_mention(uuid, uuid, text, text);

create function public.assign_subtask_via_mention(
  p_subtask_id     uuid,
  p_user_id        uuid,
  p_comment_body   text,
  p_commenter_name text
)
returns table(success boolean, assigned_user_id uuid, notify_sent boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subtask           record;
  v_task              record;
  v_effective_dept    uuid;
  v_mentions_disabled boolean;
  v_comment_preview   text;
  v_is_new_assignee   boolean;
begin
  select id, title, task_id, assignee_id
  into v_subtask
  from public.task_subtasks
  where id = p_subtask_id;

  if v_subtask.id is null then
    raise exception 'Subtask not found';
  end if;

  select id, title, is_personal, assignee_id, created_by, department_id, sprint_id, parent_task_id
  into v_task
  from public.tasks
  where id = v_subtask.task_id and deleted_at is null;

  if v_task.id is null then
    raise exception 'Parent task not found';
  end if;

  -- Resolve effective department (subtasks can have null department_id).
  if v_task.department_id is not null then
    v_effective_dept := v_task.department_id;
  elsif v_task.parent_task_id is not null then
    select department_id into v_effective_dept
    from public.tasks where id = v_task.parent_task_id;
  end if;

  -- Authorization: same wide check as assign_via_mention.
  if not (
    v_task.created_by             = auth.uid()
    or v_task.assignee_id         = auth.uid()
    or public.current_user_role() in ('super_admin', 'regional_secretary')
    or (v_task.is_personal = false
        and v_effective_dept is not null
        and v_effective_dept = public.current_user_department())
    or exists (
        select 1 from public.task_follows tf
        where tf.task_id = v_task.id and tf.user_id = auth.uid()
    )
    or exists (
        select 1 from public.task_assignees ta
        where ta.task_id = v_task.id and ta.user_id = auth.uid()
    )
    or (v_task.sprint_id is not null and exists (
        select 1 from public.sprint_members sm
        where sm.sprint_id = v_task.sprint_id
          and sm.user_id   = auth.uid()
    ))
  ) then
    raise exception 'Not authorized to mention on this subtask';
  end if;

  if v_task.is_personal and not (
    v_task.assignee_id = auth.uid()
    or v_task.created_by = auth.uid()
    or public.current_user_role() = 'super_admin'
  ) then
    raise exception 'Only the task owner may assign subtasks';
  end if;

  v_is_new_assignee := v_subtask.assignee_id is distinct from p_user_id;

  update public.task_subtasks
  set assignee_id = p_user_id, assigned_at = now()
  where id = p_subtask_id;

  -- Add mentioned user to task_follows on the parent task so they can read
  -- the comment thread (same as assign_via_mention does for regular tasks).
  insert into public.task_follows (task_id, user_id, added_via, added_by)
  values (v_task.id, p_user_id, 'mention', auth.uid())
  on conflict (user_id, task_id) do update
    set added_via = 'mention', added_by = excluded.added_by
    where public.task_follows.added_via = 'manual';

  if p_user_id = auth.uid() then
    return query select true, p_user_id, false;
    return;
  end if;

  select exists (
    select 1 from public.user_notification_prefs
    where user_id = p_user_id
      and notification_type = 'mention'
      and in_app = false
  ) into v_mentions_disabled;

  if v_mentions_disabled then
    return query select true, p_user_id, false;
    return;
  end if;

  v_comment_preview := substring(p_comment_body, 1, 150);
  if length(p_comment_body) > 150 then
    v_comment_preview := v_comment_preview || '…';
  end if;

  insert into public.notifications (user_id, type, payload)
  values (
    p_user_id,
    'mention',
    jsonb_build_object(
      'actor_name',        p_commenter_name,
      'task_title',        v_task.title,
      'task_id',           v_task.id,
      'subtask_title',     v_subtask.title,
      'subtask_id',        p_subtask_id,
      'comment_preview',   v_comment_preview,
      'is_new_assignment', v_is_new_assignee,
      'assignment_type',   'subtask'
    )
  );

  return query select true, p_user_id, true;
end;
$$;

grant execute on function public.assign_subtask_via_mention(uuid, uuid, text, text) to authenticated;
