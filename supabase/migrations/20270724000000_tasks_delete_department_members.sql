-- =============================================================================
-- Broaden task deletion to same-department members
-- -----------------------------------------------------------------------------
-- soft_delete_task/restore_task/tasks_delete previously gated deletion to
-- creator, assignee, dept_lead-of-space, sprint-manager, or
-- super_admin/regional_secretary — a regular member of a space couldn't
-- trash a task in their own space unless they created or were assigned it.
-- Per product decision, any member of the task's own space should be able to
-- soft-delete (trash) it, not just those roles.
--
-- The membership check mirrors get_trash_tasks() (20270720000024) exactly:
-- current_user_department() for the user's primary space, or a bare
-- exists() against space_roles for any additional space grant. Confirmed
-- against the space_roles schema (20261215000000_phase3_space_roles_schema)
-- that the table carries no is_active/expires_at/revoked flag — a grant is
-- either a live row or it isn't — so there is no qualifier to drop by
-- copying this shape verbatim.
--
-- hard_delete_task is deliberately NOT broadened here. Soft-delete is
-- reversible (restore_task undoes it), so trusting any space member with it
-- is low-risk; permanent purge destroys data with no undo, so it keeps the
-- tighter creator/admin/regional_secretary/dept_lead-only gate.
--
-- Tasks with department_id IS NULL (personal tasks, some sprint tasks) can't
-- be space-scoped — they continue to rely solely on the existing
-- creator/assignee/sprint-manager clauses, untouched by this migration.
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
    or public.current_user_role() in ('super_admin', 'regional_secretary')
    or (t.department_id is not null and public.has_space_role(v_uid, t.department_id, 'dept_lead'))
    or t.assignee_id = v_uid
    or (t.sprint_id is not null and public.can_manage_sprint(t.sprint_id))
    or (t.department_id is not null and t.department_id = public.current_user_department())
    or (t.department_id is not null and exists (
          select 1 from public.space_roles sr
          where sr.user_id = v_uid and sr.space_id = t.department_id
        ))
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

create or replace function public.restore_task(p_task_id uuid)
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

  if t.deleted_at is null then
    raise exception 'Task is not in trash' using errcode = 'P0001';
  end if;

  if not (
    t.created_by = v_uid
    or public.current_user_role() in ('super_admin', 'regional_secretary')
    or (t.department_id is not null and public.has_space_role(v_uid, t.department_id, 'dept_lead'))
    or t.assignee_id = v_uid
    or (t.sprint_id is not null and public.can_manage_sprint(t.sprint_id))
    or (t.department_id is not null and t.department_id = public.current_user_department())
    or (t.department_id is not null and exists (
          select 1 from public.space_roles sr
          where sr.user_id = v_uid and sr.space_id = t.department_id
        ))
  ) then
    raise exception 'Not authorized to restore this task' using errcode = '42501';
  end if;

  update public.tasks set deleted_at = null where id = p_task_id;
end;
$$;

grant execute on function public.restore_task(uuid) to authenticated;

-- tasks_delete: defense-in-depth RLS policy. No client code calls
-- .from('tasks').delete() directly today (everything routes through the
-- RPCs above), but this is the last line of defense against any future
-- direct-delete call, so it's kept in sync with the same authorization.
drop policy if exists "tasks_delete" on public.tasks;
create policy "tasks_delete" on public.tasks
  for delete to authenticated
  using (
    created_by = auth.uid()
    or public.current_user_role() in ('super_admin', 'regional_secretary')
    or public.has_space_role(auth.uid(), department_id, 'dept_lead')
    or (department_id is not null and department_id = public.current_user_department())
    or (department_id is not null and exists (
          select 1 from public.space_roles sr
          where sr.user_id = auth.uid() and sr.space_id = department_id
        ))
  );
