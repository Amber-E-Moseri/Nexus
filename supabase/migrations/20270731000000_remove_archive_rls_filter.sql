-- Remove archived_at is null from RLS policies so archived tasks are visible
-- in normal queries and recoverable via Date closed filter (not a separate
-- Archive view). Archive feature is clutter reduction, not hard deletion.

alter policy "tasks_personal_owner" on public.tasks
  using (deleted_at is null and is_personal = true and assignee_id = auth.uid());

alter policy "tasks_select_admin" on public.tasks
  using (
    deleted_at is null
    and current_user_role() = 'super_admin'
    and (is_personal = false or created_by = auth.uid() or assignee_id = auth.uid())
  );

alter policy "tasks_select_follower" on public.tasks
  using (
    deleted_at is null
    and exists (select 1 from task_follows tf where tf.task_id = tasks.id and tf.user_id = auth.uid())
    and (
      meeting_id is null
      or exists (
        select 1 from meetings m
        where m.id = tasks.meeting_id
          and (
            m.visibility = 'published'
            or m.created_by = auth.uid()
            or auth.uid() = any (coalesce(m.allowed_viewers, '{}'::uuid[]))
            or auth.uid() = any (coalesce(m.allowed_editors, '{}'::uuid[]))
            or current_user_role() = any (array['super_admin','regional_secretary'])
          )
      )
    )
  );

alter policy "tasks_select_lead" on public.tasks
  using (
    deleted_at is null
    and (
      has_space_role(auth.uid(), department_id, 'dept_lead')
      or exists (
        select 1 from task_follows tf join users u on u.id = tf.user_id
        where tf.task_id = tasks.id and tf.added_via = 'mention'
          and u.department_id = current_user_department() and tasks.is_personal = false
      )
    )
    and (
      meeting_id is null
      or exists (
        select 1 from meetings m
        where m.id = tasks.meeting_id
          and (
            m.visibility = 'published'
            or m.created_by = auth.uid()
            or auth.uid() = any (coalesce(m.allowed_viewers, '{}'::uuid[]))
            or auth.uid() = any (coalesce(m.allowed_editors, '{}'::uuid[]))
            or current_user_role() = any (array['super_admin','regional_secretary'])
          )
      )
    )
  );

alter policy "tasks_select_member" on public.tasks
  using (
    deleted_at is null
    and (
      assignee_id = auth.uid()
      or created_by = auth.uid()
      or (
        is_personal = false and department_id = current_user_department()
        and (
          meeting_id is null
          or exists (
            select 1 from meetings m
            where m.id = tasks.meeting_id
              and (
                m.visibility = 'published'
                or m.created_by = auth.uid()
                or auth.uid() = any (coalesce(m.allowed_viewers, '{}'::uuid[]))
                or auth.uid() = any (coalesce(m.allowed_editors, '{}'::uuid[]))
                or current_user_role() = any (array['super_admin','regional_secretary'])
              )
          )
        )
      )
    )
  );

alter policy "tasks_select_pastor" on public.tasks
  using (
    deleted_at is null
    and is_personal = false
    and exists (select 1 from pastor_members pm where pm.pastor_id = auth.uid() and pm.member_id = tasks.assignee_id)
  );

alter policy "tasks_select_space_access" on public.tasks
  using (
    deleted_at is null
    and not is_personal
    and (
      (department_id is not null and can_view_space(department_id))
      or (
        sprint_id is not null
        and exists (select 1 from sprints s where s.id = tasks.sprint_id and s.department_id is not null and can_view_space(s.department_id))
      )
    )
  );

alter policy "tasks_select_sprint_member" on public.tasks
  using (
    deleted_at is null
    and task_type = 'sprint' and sprint_id is not null and is_sprint_member(sprint_id)
  );
