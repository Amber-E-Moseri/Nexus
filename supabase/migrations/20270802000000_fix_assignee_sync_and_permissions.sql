-- Fix: task assignee intermittently fails to persist.
--
-- Root causes found:
--
-- 1. src/features/tasks/lib/tasks.js updateTask()/createTask() synced the
--    task_assignees junction table with a delete() then insert() and never
--    checked either call's `error`. Any RLS rejection (see #2) or transient
--    failure was silently swallowed — the UI showed success, the modal
--    closed, and the assignee was simply never written. Only a later reload
--    (which re-reads task_assignees) revealed the loss.
--
-- 2. task_assignees_write's RLS (20270718000007_task_assignees.sql) only
--    allows the task creator, super_admin/regional_secretary, or the task's
--    own dept_lead to write task_assignees. But TaskModal.jsx and
--    TaskCard.jsx both compute canAssignOrgWide to *also* include ORS/
--    Programs space-role holders assigning org-wide (matching how those
--    roles are already treated as org-wide managers elsewhere in this app).
--    RLS never got the matching grant, so an ORS/Programs user assigning a
--    task outside their own department had the write rejected — silently,
--    per #1. tasks_update had the same gap (assignee_id lives there too,
--    for callers below that never touch the junction table directly).
--
-- 3. TaskDetailSidebar.jsx and SubtaskList.jsx write `assignee_id` directly
--    on `tasks`, bypassing task_assignees entirely. Since
--    sync_primary_assignee() (same migration as #2) resets
--    tasks.assignee_id to the earliest row in task_assignees on *any*
--    insert/delete on that table, a task assigned via one of those two
--    screens could have its assignee silently reverted the next time
--    *anything* touched task_assignees for that task elsewhere (e.g. a
--    Kanban card's quick-assign) — a real drift bug, not just a missing
--    error check.
--
-- Fix: route every assignee write (single or multi) through one atomic,
-- SECURITY DEFINER RPC that both tasks.js callers now use and check the
-- result of. Being one function call, the delete+insert can't be observed
-- half-done by a concurrent read/trigger. Authorization is reconstructed
-- inside the function (this codebase's established defense-in-depth
-- pattern — see soft_delete_task in 20270720000009) so it can't silently
-- drift from intent the way the raw RLS policy did. The underlying RLS
-- policies are also brought in line with the same rule, for any other
-- direct writer.

create or replace function public.has_any_space_role(p_user_id uuid, p_role text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.space_roles
    where user_id = p_user_id
      and role = p_role
  );
$$;

comment on function public.has_any_space_role(uuid, text) is
  'Org-wide space-role check (any department) — e.g. "is this user an ORS or Programs lead somewhere", regardless of which task/department is being acted on.';

-- task_assignees_write: use task_meta() SECURITY DEFINER to avoid the
-- tasks → task_assignees → tasks recursion that a raw EXISTS subquery causes.
-- (20270730000010 introduced the same policy but also references has_any_space_role
-- before it was defined — this migration both creates the function and fixes the
-- policy in one atomic step.)
drop policy if exists "task_assignees_write" on public.task_assignees;
create policy "task_assignees_write" on public.task_assignees
  for all
  using (
    (
      select
        tm.created_by = auth.uid()
        or public.current_user_role() in ('super_admin', 'regional_secretary')
        or (tm.department_id is not null and public.has_space_role(auth.uid(), tm.department_id, 'dept_lead'))
        or public.has_any_space_role(auth.uid(), 'ors')
        or public.has_any_space_role(auth.uid(), 'programs')
      from public.task_meta(task_assignees.task_id) tm
    )
  );

drop policy if exists "tasks_update" on public.tasks;
create policy "tasks_update" on public.tasks
  for update to authenticated
  using (
    created_by = auth.uid()
    or public.current_user_role() in ('super_admin', 'regional_secretary')
    or public.has_space_role(auth.uid(), department_id, 'dept_lead')
    or public.has_any_space_role(auth.uid(), 'ors')
    or public.has_any_space_role(auth.uid(), 'programs')
  )
  with check (
    created_by = auth.uid()
    or public.current_user_role() in ('super_admin', 'regional_secretary')
    or public.has_space_role(auth.uid(), department_id, 'dept_lead')
    or public.has_any_space_role(auth.uid(), 'ors')
    or public.has_any_space_role(auth.uid(), 'programs')
  );

create or replace function public.set_task_assignees(p_task_id uuid, p_user_ids uuid[])
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
    or public.has_any_space_role(v_uid, 'ors')
    or public.has_any_space_role(v_uid, 'programs')
  ) then
    raise exception 'Not authorized to assign this task' using errcode = '42501';
  end if;

  delete from public.task_assignees where task_id = p_task_id;

  if p_user_ids is not null and array_length(p_user_ids, 1) > 0 then
    insert into public.task_assignees (task_id, user_id)
    select distinct p_task_id, uid from unnest(p_user_ids) as uid
    on conflict (task_id, user_id) do nothing;
  end if;
end;
$$;

comment on function public.set_task_assignees(uuid, uuid[]) is
  'Atomic replace-all sync of task_assignees for one task. Both createTask() and updateTask() in src/features/tasks/lib/tasks.js route every assignee write through this RPC and check its error, instead of doing an unchecked delete()+insert() from the client.';

grant execute on function public.set_task_assignees(uuid, uuid[]) to authenticated;

-- tasks_select_assignee: recreate using is_task_assignee() SECURITY DEFINER so
-- there is no tasks → task_assignees → task_assignees_write → tasks chain.
-- Migrations 20270730000005-007 created three conflicting versions of this policy
-- (only the first one, with a raw EXISTS, actually applied). Drop and recreate clean.
drop policy if exists "tasks_select_assignee" on public.tasks;
create policy "tasks_select_assignee" on public.tasks
  for select to authenticated
  using (
    deleted_at is null
    and public.is_task_assignee(id, auth.uid())
  );
