-- Extend soft_delete_task so any sprint member can soft-delete tasks in their sprint.
--
-- Previous authorization only allowed:
--   - task creator
--   - super_admin / dept_lead
--   - task assignee
--   - sprint owner/manager (via can_manage_sprint)
--
-- This meant sprint contributors in "This Is It 2.0" could NOT delete tasks they
-- didn't personally create or get assigned — the optimistic UI removed the task then
-- it reappeared on refresh because the RPC was silently failing.
--
-- Fix: add is_sprint_member(sprint_id) as a valid authorization path.
-- Soft-delete is reversible (deleted_at, not a hard delete), so the risk is low.

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
    or (t.sprint_id is not null and public.is_sprint_member(t.sprint_id))
  ) then
    raise exception 'Not authorized to delete this task' using errcode = '42501';
  end if;

  update public.tasks
  set deleted_at = now()
  where id = p_task_id
    and deleted_at is null;
end;
$$;
