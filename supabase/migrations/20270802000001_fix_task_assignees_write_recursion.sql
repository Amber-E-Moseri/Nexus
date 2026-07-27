-- Fix: 20270802000000 recreated task_assignees_write with a raw `tasks`
-- subquery, which causes tasks → task_assignees → task_assignees_write →
-- tasks infinite recursion (the exact bug 20270730000010 had already fixed
-- with task_meta()). Also replace tasks_select_assignee with the
-- is_task_assignee() SECURITY DEFINER version so neither leg of the chain
-- touches a real table under RLS.

-- 1. Recreate task_assignees_write using task_meta() — no tasks subquery.
drop policy if exists "task_assignees_write" on public.task_assignees;
create policy "task_assignees_write" on public.task_assignees
  for all
  using (
    (
      select
        tm.created_by = auth.uid()
        or public.current_user_role() in ('super_admin', 'regional_secretary')
        or (tm.department_id is not null
            and public.has_space_role(auth.uid(), tm.department_id, 'dept_lead'))
        or public.has_any_space_role(auth.uid(), 'ors')
        or public.has_any_space_role(auth.uid(), 'programs')
      from public.task_meta(task_assignees.task_id) tm
    )
  );

-- 2. Recreate tasks_select_assignee using is_task_assignee() SECURITY DEFINER.
--    Migrations 20270730000005-007 left three conflicting CREATE attempts; only
--    the first (raw EXISTS) actually applied. Drop and recreate clean.
drop policy if exists "tasks_select_assignee" on public.tasks;
create policy "tasks_select_assignee" on public.tasks
  for select to authenticated
  using (
    deleted_at is null
    and public.is_task_assignee(id, auth.uid())
  );
