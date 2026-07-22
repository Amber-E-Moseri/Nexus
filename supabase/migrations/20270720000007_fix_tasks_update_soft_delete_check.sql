-- Fix: soft-deleting a space task fails with
--   "new row violates row-level security policy for table tasks" (42501).
--
-- Root cause (confirmed by live reproduction against prod):
--   The live tasks_update policy's WITH CHECK required `deleted_at IS NULL`.
--   Soft delete is an UPDATE that SETS deleted_at to a timestamp, so the
--   post-update row fails the check — making soft delete impossible for any
--   task whose only granting permissive policy is tasks_update (i.e. every
--   non-sprint "space" task). Sprint tasks were unaffected because
--   tasks_update_delete_sprint_manager separately grants the write without a
--   deleted_at clause, which is why the bug looked intermittent.
--
--   This `deleted_at IS NULL` clause exists in NO repo migration — the repo's
--   20261221000001_fix_task_soft_delete_rls_leak.sql deliberately keeps the
--   write policies free of any deleted_at restriction precisely so soft delete
--   (and trash restore) keep working; soft-deleted rows are hidden by the
--   tasks_select_* policies instead. The clause was added out-of-band (likely a
--   dashboard edit during P0 hardening) and diverged from the repo.
--
-- Fix:
--   Recreate tasks_update with the intended authorization check and NO
--   deleted_at restriction. USING still governs which rows may be updated;
--   WITH CHECK validates only that the post-update row stays owned by an
--   authorized principal. Uses has_space_role() to match tasks_delete
--   (see 20270720000005 L3) and the phase-3 policy shape.

drop policy if exists "tasks_update" on public.tasks;
create policy "tasks_update" on public.tasks
  for update to authenticated
  using (
    created_by = auth.uid()
    or public.current_user_role() = 'super_admin'
    or public.has_space_role(auth.uid(), department_id, 'dept_lead')
  )
  with check (
    created_by = auth.uid()
    or public.current_user_role() = 'super_admin'
    or public.has_space_role(auth.uid(), department_id, 'dept_lead')
  );
