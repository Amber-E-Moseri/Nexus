-- Grant task visibility to users who are task assignees (via task_assignees junction table)

create policy "tasks_select_assignee" on public.tasks
  for select to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from public.task_assignees ta
      where ta.task_id = tasks.id and ta.user_id = auth.uid()
    )
  );
