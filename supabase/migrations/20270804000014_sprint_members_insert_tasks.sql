-- Allow sprint members to INSERT sprint tasks even if they don't have a department_id.
-- The tasks_insert policy currently checks if user.department_id = task.department_id,
-- which fails for external sprint members (department_id=null). Adding a sprint-member
-- clause allows them to create sprint-type tasks when they're members of the sprint.

alter policy "tasks_insert" on public.tasks
  with check (
    created_by = auth.uid()
    and (
      is_personal = true
      or public.current_user_role() = 'super_admin'
      or public.has_space_role(auth.uid(), department_id, 'dept_lead')
      or exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.department_id = tasks.department_id
      )
      or exists (
        select 1 from public.space_members sm
        where sm.user_id = auth.uid() and sm.space_id = tasks.department_id
      )
      or (
        task_type = 'sprint'
        and sprint_id is not null
        and public.is_sprint_member(sprint_id)
      )
    )
  );
