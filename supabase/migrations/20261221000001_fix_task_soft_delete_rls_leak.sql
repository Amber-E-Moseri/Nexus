-- ============================================================
-- FIX: soft-deleted tasks leaking through tasks_update_delete
-- ============================================================
-- 20261002000000_add_soft_delete_to_tasks.sql added `deleted_at is null` to
-- every dedicated `for select` policy on tasks (member/lead/admin/pastor/
-- personal_owner), but tasks_update_delete is a `for all` policy — its
-- USING clause also governs plain SELECT (permissive RLS policies OR
-- together), and it never checked deleted_at. Net effect: a task's creator,
-- any dept_lead of its department, or any super_admin could still see the
-- row after soft delete via this policy, even though every other read path
-- correctly hid it.
--
-- Fix: split tasks_update_delete into tasks_update / tasks_delete (no
-- `for select`), so SELECT visibility comes only from the tasks_select_*
-- policies that already filter deleted_at correctly. The write policies
-- themselves keep no deleted_at restriction — soft-deleting writes
-- deleted_at on a currently-live row (must stay allowed), and hard-deleting
-- an already-soft-deleted row (trash purge) must also stay allowed.
--
-- Uses the currently-live authorization logic (current_user_role() /
-- current_user_department()), independent of the Phase 3 has_space_role()
-- swap (20261216000000_phase3_rls_swap.sql), which is staged but not yet
-- pushed. That migration has been updated to produce the same
-- tasks_update / tasks_delete split once it ships, so this fix won't be
-- undone when Phase 3 lands.

drop policy if exists "tasks_update_delete" on public.tasks;

drop policy if exists "tasks_update" on public.tasks;
create policy "tasks_update"
on public.tasks
for update
to authenticated
using (
  created_by = auth.uid()
  or public.current_user_role() = 'super_admin'
  or (public.current_user_role() = 'dept_lead' and public.current_user_department() = department_id)
)
with check (
  created_by = auth.uid()
  or public.current_user_role() = 'super_admin'
  or (public.current_user_role() = 'dept_lead' and public.current_user_department() = department_id)
);

drop policy if exists "tasks_delete" on public.tasks;
create policy "tasks_delete"
on public.tasks
for delete
to authenticated
using (
  created_by = auth.uid()
  or public.current_user_role() = 'super_admin'
  or (public.current_user_role() = 'dept_lead' and public.current_user_department() = department_id)
);
