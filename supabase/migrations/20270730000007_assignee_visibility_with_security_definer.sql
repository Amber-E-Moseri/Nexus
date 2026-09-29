-- Fix: grant task visibility to assignees using is_task_assignee() SECURITY DEFINER
-- This prevents infinite recursion by using a security definer function instead of
-- a raw EXISTS subquery that would create a circular dependency with task_assignees RLS.

drop policy if exists "tasks_select_assignee" on public.tasks;
create policy "tasks_select_assignee" on public.tasks
  for select to authenticated
  using (
    deleted_at is null
    and public.is_task_assignee(id, auth.uid())
  );
