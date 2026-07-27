-- Fix three gaps in the @mention → assignee → comment-visibility chain:
--
-- 1. assign_via_mention auth check uses user_can_view_task() which doesn't cover
--    sprint tasks (department_id = null) or task_assignees membership. Broaden it
--    to match all active tasks SELECT policies: same dept, sprint_members, task_follows,
--    task_assignees, assignee_id, created_by, super_admin/regional_secretary.
--
-- 2. assign_via_mention never inserted into task_follows. task_comments_select_related
--    already gates on task_follows, so cross-dept @mentioned users landed in
--    task_assignees but still couldn't read the comment thread that mentioned them.
--    Now adds task_follows alongside task_assignees (same as mention_user_on_task).
--
-- 3. task_comments_select_related also now checks is_task_assignee() directly so
--    users added to task_assignees by any path (not just @mention) can read comments.

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Rebuild assign_via_mention with broader auth + task_follows insert
-- ──────────────────────────────────────────────────────────────────────────────

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
  v_mentions_disabled boolean;
  v_comment_preview  text;
begin
  select id, title, is_personal, assignee_id, created_by, department_id, sprint_id
  into v_task
  from public.tasks
  where id = p_task_id and deleted_at is null;

  if v_task.id is null then
    raise exception 'Task not found';
  end if;

  -- Authorization: caller must be able to see the task (matches all tasks SELECT policies).
  -- We check this manually because we're SECURITY DEFINER (RLS bypassed).
  if not (
    v_task.created_by             = auth.uid()
    or v_task.assignee_id         = auth.uid()
    or public.current_user_role() in ('super_admin', 'regional_secretary')
    or (v_task.is_personal = false
        and v_task.department_id = public.current_user_department())
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
  -- (task_comments_select_related gates on task_follows; this is the cheapest fix.)
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
      'actor_name',     p_commenter_name,
      'task_title',     v_task.title,
      'task_id',        p_task_id,
      'comment_preview', v_comment_preview,
      'is_new_assignment', true
    )
  );

  return query select true, p_user_id, true;
end;
$$;

grant execute on function public.assign_via_mention(uuid, uuid, text, text) to authenticated;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Add is_task_assignee() check to task_comments_select_related
--    Belt-and-suspenders: covers assignees not yet in task_follows.
-- ──────────────────────────────────────────────────────────────────────────────

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
          or (t.is_personal = false and t.department_id = public.current_user_department())
          or public.current_user_role() = 'super_admin'
          or exists (
            select 1 from public.task_follows tf
            where tf.task_id = t.id and tf.user_id = auth.uid()
          )
          or public.is_task_assignee(t.id, auth.uid())
        )
    )
  );
