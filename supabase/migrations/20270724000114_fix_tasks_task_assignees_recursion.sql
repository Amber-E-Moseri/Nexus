-- =============================================================================
-- Fix: "infinite recursion detected in policy for relation tasks" (42P17) on
-- every task UPDATE (board/list drag-and-drop, status changes, etc.)
-- -----------------------------------------------------------------------------
-- Root cause: tasks_pastors_privacy_update (UPDATE policy on tasks) does a raw
-- EXISTS subquery against task_assignees:
--   EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = tasks.id AND ta.user_id = auth.uid())
-- task_assignees_write and task_assignees_pastors_privacy_write (ALL policies
-- on task_assignees, so their USING clause also gates plain SELECTs) do the
-- mirror-image raw subquery back against tasks:
--   EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_assignees.task_id AND ...)
--
-- Neither subquery goes through a SECURITY DEFINER function, so Postgres's
-- rewriter has to substitute tasks' RLS quals while it is already in the
-- middle of substituting tasks' RLS quals for the outer UPDATE — a genuine
-- cycle on the `tasks` relation, raised regardless of which specific task
-- row is touched (so it fires for ordinary Programs-space drag/drop, not
-- just Pastors-space tasks).
--
-- Fix: route both directions through existing/new STABLE SECURITY DEFINER
-- helpers, matching the pattern already used by is_task_assignee() and
-- task_department_id() (see 20270720000001_fix_task_follows_select_recursion.sql).
-- SECURITY DEFINER functions are never inlined by the planner, so they act as
-- an opaque boundary that stops the rewriter from re-expanding tasks'/
-- task_assignees' policies a second time.
-- =============================================================================

-- New helper: task_assignees policies need created_by/assignee_id/department_id/
-- deleted_at/is_personal off the parent task without re-triggering tasks' RLS.
create or replace function public.task_meta(p_task_id uuid)
returns table (
  department_id uuid,
  created_by uuid,
  assignee_id uuid,
  deleted_at timestamptz,
  is_personal boolean
)
language sql
stable
security definer
set search_path = 'public'
as $$
  select department_id, created_by, assignee_id, deleted_at, is_personal
  from public.tasks
  where id = p_task_id
  limit 1;
$$;

-- tasks_pastors_privacy_update: replace raw task_assignees subquery with the
-- existing is_task_assignee() SECURITY DEFINER helper.
drop policy if exists tasks_pastors_privacy_update on public.tasks;
create policy tasks_pastors_privacy_update on public.tasks
  for update
  to authenticated
  using (
    not is_pastors_space(department_id)
    or assignee_id = auth.uid()
    or created_by = auth.uid()
    or current_user_role() = 'regional_secretary'
    or is_task_assignee(id, auth.uid())
  );

-- task_assignees_pastors_privacy (SELECT): replace raw tasks subquery with task_meta().
drop policy if exists task_assignees_pastors_privacy on public.task_assignees;
create policy task_assignees_pastors_privacy on public.task_assignees
  for select
  to authenticated
  using (
    (
      select
        not is_pastors_space(tm.department_id)
        or tm.assignee_id = auth.uid()
        or tm.created_by = auth.uid()
        or current_user_role() = 'regional_secretary'
        or task_assignees.user_id = auth.uid()
      from public.task_meta(task_assignees.task_id) tm
    )
  );

-- task_assignees_pastors_privacy_write (ALL): same fix, no user_id escape hatch
-- (matches the original — that one only exists on the SELECT-only policy above).
drop policy if exists task_assignees_pastors_privacy_write on public.task_assignees;
create policy task_assignees_pastors_privacy_write on public.task_assignees
  for all
  to authenticated
  using (
    (
      select
        not is_pastors_space(tm.department_id)
        or tm.assignee_id = auth.uid()
        or tm.created_by = auth.uid()
        or current_user_role() = 'regional_secretary'
      from public.task_meta(task_assignees.task_id) tm
    )
  );

-- task_assignees_select: replace raw tasks subquery with task_meta().
drop policy if exists task_assignees_select on public.task_assignees;
create policy task_assignees_select on public.task_assignees
  for select
  to public
  using (
    (
      select
        tm.deleted_at is null
        and (
          tm.assignee_id = auth.uid()
          or tm.created_by = auth.uid()
          or (tm.is_personal = false and tm.department_id = current_user_department())
          or current_user_role() = any (array['super_admin', 'regional_secretary'])
        )
      from public.task_meta(task_assignees.task_id) tm
    )
  );

-- task_assignees_write (ALL): replace raw tasks subquery with task_meta() +
-- has_space_role() (has_space_role itself only touches space_roles, not tasks,
-- so it doesn't reintroduce the cycle).
drop policy if exists task_assignees_write on public.task_assignees;
create policy task_assignees_write on public.task_assignees
  for all
  to public
  using (
    (
      select
        tm.created_by = auth.uid()
        or current_user_role() = any (array['super_admin', 'regional_secretary'])
        or has_space_role(auth.uid(), tm.department_id, 'dept_lead')
      from public.task_meta(task_assignees.task_id) tm
    )
  );
