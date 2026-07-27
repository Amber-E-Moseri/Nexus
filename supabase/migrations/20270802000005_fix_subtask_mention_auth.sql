-- Fix: assign_via_mention and task_comments_select_related both check
-- department_id = current_user_department(). Subtasks created via the quick-add
-- (TaskCard) or createSubtask() without an explicit departmentId have
-- department_id = NULL, so that check is always false — users in the same
-- department can't @mention on those subtasks or read their comment threads.
--
-- Fix: when department_id IS NULL and parent_task_id IS NOT NULL, fall back to
-- the parent task's department for the membership check.

-- ── 1. assign_via_mention ───────────────────────────────────────────────────

drop function if exists public.assign_via_mention(uuid, uuid, text, text);

create function public.assign_via_mention(
  p_task_id        uuid,
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
  v_task             record;
  v_effective_dept   uuid;
  v_mentions_disabled boolean;
  v_comment_preview  text;
begin
  select id, title, is_personal, assignee_id, created_by, department_id,
         sprint_id, parent_task_id
  into v_task
  from public.tasks
  where id = p_task_id and deleted_at is null;

  if v_task.id is null then
    raise exception 'Task not found';
  end if;

  -- For subtasks with no department_id, use the parent task's department.
  if v_task.department_id is not null then
    v_effective_dept := v_task.department_id;
  elsif v_task.parent_task_id is not null then
    select department_id into v_effective_dept
    from public.tasks where id = v_task.parent_task_id;
  end if;

  -- Authorization: caller must be able to see the task.
  if not (
    v_task.created_by             = auth.uid()
    or v_task.assignee_id         = auth.uid()
    or public.current_user_role() in ('super_admin', 'regional_secretary')
    or (v_task.is_personal = false
        and v_effective_dept is not null
        and v_effective_dept = public.current_user_department())
    or exists (
        select 1 from public.task_follows tf
        where tf.task_id = p_task_id and tf.user_id = auth.uid()
    )
    or exists (
        select 1 from public.task_assignees ta
        where ta.task_id = p_task_id and ta.user_id = auth.uid()
    )
    or (v_task.sprint_id is not null and exists (
        select 1 from public.sprint_members sm
        where sm.sprint_id = v_task.sprint_id
          and sm.user_id   = auth.uid()
          and (sm.expires_at is null or sm.expires_at > now())
    ))
  ) then
    raise exception 'Not authorized to mention on this task';
  end if;

  -- Personal tasks: only owner, creator, or super_admin may add people.
  if v_task.is_personal and not (
    v_task.assignee_id = auth.uid()
    or v_task.created_by = auth.uid()
    or public.current_user_role() = 'super_admin'
  ) then
    raise exception 'Only the task owner may assign a personal task';
  end if;

  -- Add mentioned user to task_assignees.
  insert into public.task_assignees (task_id, user_id)
  values (p_task_id, p_user_id)
  on conflict (task_id, user_id) do nothing;

  -- Add mentioned user to task_follows so they can read the comment thread.
  insert into public.task_follows (task_id, user_id, added_via, added_by)
  values (p_task_id, p_user_id, 'mention', auth.uid())
  on conflict (user_id, task_id) do update
    set added_via = 'mention', added_by = excluded.added_by
    where public.task_follows.added_via = 'manual';

  -- Self-mentions: no notification.
  if p_user_id = auth.uid() then
    return query select true, p_user_id, false;
    return;
  end if;

  -- Check if the mentioned user has opted out of in-app mention notifications.
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
      'actor_name',      p_commenter_name,
      'task_title',      v_task.title,
      'task_id',         p_task_id,
      'comment_preview', v_comment_preview,
      'is_new_assignment', true
    )
  );

  return query select true, p_user_id, true;
end;
$$;

grant execute on function public.assign_via_mention(uuid, uuid, text, text) to authenticated;

-- ── 2. task_comments_select_related ────────────────────────────────────────
-- Same fix: when the task has no department_id (subtask quick-add), check the
-- parent task's department before deciding the viewer is unauthorised.

drop policy if exists "task_comments_select_related" on public.task_comments;

create policy "task_comments_select_related" on public.task_comments
  for select to authenticated
  using (
    exists (
      select 1 from public.tasks t
      where t.id = task_comments.task_id
        and (
          t.assignee_id = auth.uid()
          or t.created_by = auth.uid()
          or public.current_user_role() in ('super_admin', 'regional_secretary')
          or exists (
            select 1 from public.task_follows tf
            where tf.task_id = t.id and tf.user_id = auth.uid()
          )
          or public.is_task_assignee(t.id, auth.uid())
          -- same-dept check: use the task's own dept, or fall back to parent's dept
          -- for subtasks that were created without an explicit department_id.
          or (
            t.is_personal = false
            and (
              t.department_id = public.current_user_department()
              or (
                t.department_id is null
                and t.parent_task_id is not null
                and exists (
                  select 1 from public.tasks pt
                  where pt.id = t.parent_task_id
                    and pt.department_id = public.current_user_department()
                )
              )
            )
          )
        )
    )
  );
