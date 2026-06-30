-- =============================================================================
-- Allow assignees to update their own assigned tasks
-- -----------------------------------------------------------------------------
-- The active `tasks_update_delete` policy
-- (20260620000020_pastor_task_assignment.sql) grants UPDATE to the creator,
-- super_admin, dept_lead (same dept) and pastor (of the member) — but NOT to
-- the assignee. So a member assigned a meeting action item could see the task
-- but never update its status. This adds a permissive policy for that case.
--
-- Column locking: we want the assignee to update status/progress but NOT to
-- reassign the task to someone else or move it to another department. The
-- `WITH CHECK (assignee_id = auth.uid())` clause already prevents reassigning
-- away from themselves. To also pin created_by and department_id to their
-- existing values we must read the pre-update row — but a subquery on
-- `public.tasks` inside a tasks policy triggers Postgres "infinite recursion
-- detected in policy for relation tasks". We avoid that with a SECURITY DEFINER
-- helper, which bypasses RLS when reading the old row.
-- =============================================================================

create or replace function public.task_protected_fields_unchanged(
  p_task_id uuid,
  p_created_by uuid,
  p_department_id uuid
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.tasks
    where id = p_task_id
      and created_by is not distinct from p_created_by
      and department_id is not distinct from p_department_id
  );
$$;

grant execute on function public.task_protected_fields_unchanged(uuid, uuid, uuid) to authenticated;

drop policy if exists "tasks_update_assignee" on public.tasks;

create policy "tasks_update_assignee"
on public.tasks
for update
to authenticated
using (assignee_id = auth.uid())
with check (
  assignee_id = auth.uid()
  and public.task_protected_fields_unchanged(id, created_by, department_id)
);
