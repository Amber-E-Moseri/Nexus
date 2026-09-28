-- Fix: grant task visibility to assignees without triggering RLS recursion
-- Use the existing is_task_assignee() SECURITY DEFINER helper instead of
-- a raw EXISTS subquery to break the circular policy dependency between
-- tasks and task_assignees.

drop policy if exists "tasks_select_assignee" on public.tasks;
create policy "tasks_select_assignee" on public.tasks
  for select to authenticated
  using (
    deleted_at is null
    and public.is_task_assignee(id, auth.uid())
  );
