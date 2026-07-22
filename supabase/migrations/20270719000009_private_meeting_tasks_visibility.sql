-- Gate tasks linked to a private meeting behind meeting-level access.
-- Currently tasks_select_member grants SELECT to any dept member if
-- department_id matches. That means action items from a private meeting
-- appear on the department board for everyone — defeating the privacy intent.
--
-- Fix: add an exclusion clause so that when a task has meeting_id set AND
-- that meeting is private (visibility = 'private'), the task is only visible
-- to super_admin/regional_secretary, the meeting creator, and allowed_viewers/editors.
-- Tasks with no meeting_id (or from published meetings) are unaffected.

drop policy if exists "tasks_select_member" on public.tasks;

create policy "tasks_select_member" on public.tasks
  for select to authenticated
  using (
    deleted_at is null
    and (
      assignee_id = auth.uid()
      or created_by = auth.uid()
      or (
        is_personal = false
        and department_id = public.current_user_department()
        -- Block if the task is linked to a private meeting the user can't access
        and (
          meeting_id is null
          or exists (
            select 1 from public.meetings m
            where m.id = tasks.meeting_id
              and (
                m.visibility = 'published'
                or m.created_by = auth.uid()
                or auth.uid() = any(coalesce(m.allowed_viewers, '{}'))
                or auth.uid() = any(coalesce(m.allowed_editors, '{}'))
                or public.current_user_role() in ('super_admin', 'regional_secretary')
              )
          )
        )
      )
    )
  );
