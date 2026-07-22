-- =============================================================================
-- Defense-in-depth: route soft-delete through a SECURITY DEFINER RPC
-- -----------------------------------------------------------------------------
-- Soft-delete is an UPDATE that SETS deleted_at (see deleteTask() in
-- src/features/tasks/lib/tasks.js). The direct `.update({ deleted_at })`
-- path relies on the tasks_update WITH CHECK being correct. That check has
-- been broken out-of-band before (20270720000007 documents one such
-- incident), and even though the live policies are currently clean (verified
-- against pg_policy on 2026-07-20), the pattern is fragile.
--
-- Fix: route soft-delete through a SECURITY DEFINER RPC that performs its own
-- authorization and writes deleted_at. The write bypasses WITH CHECK entirely,
-- so soft-delete correctness can never be broken by a future policy edit.
--
-- Authorization reconstructs the effective UPDATE authorization — the union
-- of the three permissive UPDATE policies a soft-delete (an UPDATE) can ride
-- on, all live and never dropped:
--   * tasks_update                     — creator / super_admin / dept_lead
--   * tasks_update_assignee            — assignee_id = auth.uid()
--   * tasks_update_delete_sprint_manager — sprint task + can_manage_sprint()
-- The task_assignees junction is deliberately NOT included: no UPDATE policy
-- grants junction-only members (tasks.assignee_id null) update rights, so
-- including it would be an access expansion.
--
-- Hard-delete stays narrower (tasks_delete = creator/super_admin/dept_lead
-- only). That soft > hard asymmetry pre-exists; it is preserved here.
-- =============================================================================

create or replace function public.soft_delete_task(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  t public.tasks%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into t from public.tasks where id = p_task_id;
  if not found then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;

  if not (
    t.created_by = v_uid
    or public.current_user_role() = 'super_admin'
    or (t.department_id is not null and public.has_space_role(v_uid, t.department_id, 'dept_lead'))
    or t.assignee_id = v_uid
    or (t.sprint_id is not null and public.can_manage_sprint(t.sprint_id))
  ) then
    raise exception 'Not authorized to delete this task' using errcode = '42501';
  end if;

  update public.tasks
  set deleted_at = now()
  where id = p_task_id
    and deleted_at is null;
end;
$$;

grant execute on function public.soft_delete_task(uuid) to authenticated;
