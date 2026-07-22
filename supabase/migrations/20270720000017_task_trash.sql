-- =============================================================================
-- Task Trash feature
-- -----------------------------------------------------------------------------
-- Model: soft-delete stays broad (anyone who could already soft-delete a task
-- can also restore it — restore is just the undo of an action that actor was
-- already trusted to perform). Permanent delete stays narrow (super_admin,
-- regional_secretary, dept_lead-of-space only), mirroring the hard-delete
-- tasks_delete RLS policy (20270720000016) and the user's "empty trash is
-- Owner/Admin-only" model.
--
-- Four functions:
--   1. soft_delete_task  — existing RPC (20270720000009), reissued here only
--      to add regional_secretary to the authorization union (it was missing,
--      inconsistent with tasks_insert/tasks_update/tasks_delete which already
--      treat regional_secretary as an org-wide role).
--   2. restore_task      — new. Same broad authorization union as soft-delete.
--   3. hard_delete_task  — new. Narrow authorization, requires the task be
--      already in trash (deleted_at is not null) to enforce the two-step
--      "delete -> trash -> empty" model server-side, not just in the UI.
--      Nulls out parent_task_id on subtasks first (that FK has no ON DELETE
--      clause, so a naive delete would raise a restrict violation) — this
--      promotes subtasks to top-level rather than silently cascading their
--      deletion, since the caller only asked to purge one task.
--   4. get_trash_tasks   — new. Returns deleted_at IS NOT NULL tasks scoped by
--      the exact same authorization union used to soft-delete/restore, so
--      "who can see a task in Trash" and "who could act on it" stay in
--      lockstep by construction. Deliberately an RPC rather than an 8th
--      tasks_select_* RLS policy — that surface has a documented leak history
--      (20270719000014) and is already a union of ~7 overlapping policies.
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
  ) then
    raise exception 'Not authorized to restore this task' using errcode = '42501';
  end if;

  update public.tasks set deleted_at = null where id = p_task_id;
end;
$$;

grant execute on function public.restore_task(uuid) to authenticated;

create or replace function public.hard_delete_task(p_task_id uuid)
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
    raise exception 'Task must be in trash before it can be permanently deleted' using errcode = 'P0001';
  end if;

  if not (
    t.created_by = v_uid
    or public.current_user_role() in ('super_admin', 'regional_secretary')
    or (t.department_id is not null and public.has_space_role(v_uid, t.department_id, 'dept_lead'))
  ) then
    raise exception 'Not authorized to permanently delete this task' using errcode = '42501';
  end if;

  update public.tasks set parent_task_id = null where parent_task_id = p_task_id;
  delete from public.tasks where id = p_task_id;
end;
$$;

grant execute on function public.hard_delete_task(uuid) to authenticated;

create or replace function public.get_trash_tasks()
returns setof public.tasks
language sql
security definer
set search_path = public
stable
as $$
  select t.*
  from public.tasks t
  where t.deleted_at is not null
    and (
      t.created_by = auth.uid()
      or public.current_user_role() in ('super_admin', 'regional_secretary')
      or (t.department_id is not null and public.has_space_role(auth.uid(), t.department_id, 'dept_lead'))
      or t.assignee_id = auth.uid()
      or (t.sprint_id is not null and public.can_manage_sprint(t.sprint_id))
    )
  order by t.deleted_at desc;
$$;

grant execute on function public.get_trash_tasks() to authenticated;
