-- =============================================================================
-- Scope Trash to space membership
-- -----------------------------------------------------------------------------
-- get_trash_tasks() (20270720000017) previously scoped non-admin visibility to
-- dept_lead-of-department only, which meant a regular member of a space
-- couldn't see deleted tasks in their own space's trash unless they were the
-- creator/assignee. Widen it to "any space you're in" — your primary
-- department (current_user_department()) or any space you hold a space_roles
-- grant in (any role — a grant of any kind implies membership) — while
-- keeping super_admin/regional_secretary as org-wide and preserving the
-- existing creator/assignee/sprint-manager grants untouched.
--
-- soft_delete_task/restore_task are intentionally left alone: they gate who
-- can *act* on a task (a narrower, trust-based set), not who can *see* it in
-- the trash list. This migration only touches the read-scoping RPC.
-- =============================================================================

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
      or (t.department_id is not null and t.department_id = public.current_user_department())
      or (t.department_id is not null and exists (
            select 1 from public.space_roles sr
            where sr.user_id = auth.uid() and sr.space_id = t.department_id
          ))
      or t.assignee_id = auth.uid()
      or (t.sprint_id is not null and public.can_manage_sprint(t.sprint_id))
    )
  order by t.deleted_at desc;
$$;

grant execute on function public.get_trash_tasks() to authenticated;
