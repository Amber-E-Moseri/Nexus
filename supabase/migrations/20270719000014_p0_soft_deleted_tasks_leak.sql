-- P0: three tasks SELECT policies were missing deleted_at IS NULL, allowing
-- soft-deleted tasks to remain visible to sprint members, space viewers, and followers.
-- All other tasks_select_* policies already include this guard.

drop policy if exists "tasks_select_sprint_member" on public.tasks;
create policy "tasks_select_sprint_member" on public.tasks
  for select to authenticated
  using (
    deleted_at is null
    and task_type = 'sprint'
    and sprint_id is not null
    and public.is_sprint_member(sprint_id)
  );

drop policy if exists "tasks_select_space_access" on public.tasks;
create policy "tasks_select_space_access" on public.tasks
  for select to authenticated
  using (
    deleted_at is null
    and not is_personal
    and (
      (
        department_id is not null
        and public.can_view_space(department_id)
      )
      or (
        sprint_id is not null
        and exists (
          select 1 from public.sprints s
          where s.id = tasks.sprint_id
            and s.department_id is not null
            and public.can_view_space(s.department_id)
        )
      )
    )
  );

drop policy if exists "tasks_select_follower" on public.tasks;
create policy "tasks_select_follower" on public.tasks
  for select to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from public.task_follows tf
      where tf.task_id = tasks.id and tf.user_id = auth.uid()
    )
  );
