-- Fix: task_assignees_write policy uses a raw tasks subquery which causes
-- a slow evaluation chain: task_comments → tasks → task_assignees → tasks again.
-- Replace with task_meta() SECURITY DEFINER function (same fix as 20270724000114).

drop policy if exists "task_assignees_write" on public.task_assignees;

create policy "task_assignees_write" on public.task_assignees
  for all
  using (
    (
      select
        tm.created_by = auth.uid()
        or public.current_user_role() in ('super_admin', 'regional_secretary')
        or public.has_space_role(auth.uid(), tm.department_id, 'dept_lead')
        or public.has_any_space_role(auth.uid(), 'ors')
        or public.has_any_space_role(auth.uid(), 'programs')
      from public.task_meta(task_assignees.task_id) tm
    )
  );
