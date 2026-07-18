-- Single source of truth for "can this user view this task" — used directly by the
-- create_task_notification and mention_user_on_task RPCs (20260718000001 /
-- 20260718000002) so those RPCs can't silently drift from what tasks_select_* RLS
-- actually grants.
--
-- NOT security invoker/definer-sensitive by design: it reads the task row's own
-- columns directly and combines them with session-scoped predicates (auth.uid(), role,
-- department, task_follows, pastor_members) that resolve correctly regardless of which
-- Postgres role is executing, since none of them depend on RLS being enforced. Nesting
-- a `security invoker` check inside a `security definer` RPC does NOT restore the
-- original caller's privileges — SECURITY DEFINER switches current_user for the whole
-- call including nested calls, and SECURITY INVOKER on the nested function just means
-- "don't switch again," inheriting the already-switched (typically RLS-bypassing) role.
-- This function avoids that trap entirely by not relying on RLS enforcement.
--
-- Verified against live policies, not assumed: tasks_select_admin
-- (20270716000002_regional_secretary_tasks_select.sql) grants super_admin AND
-- regional_secretary. tasks_select_pastor (pastor_members) and the new
-- tasks_select_follower (20260718000003) are folded in too.
--
-- Deliberately NOT covering ors/programs space roles — grepping every tasks_select_*
-- and tasks_update policy body turns up no clause for those space roles at all, only
-- dept_lead (own department) and super_admin/regional_secretary (role column). This is
-- a separate, pre-existing gap between the frontend's canAssignOrgWide (TaskModal.jsx)
-- and the actual DB-level grants — flagged, not fixed here.
--
-- Deliberately NOT used to consolidate the existing tasks_select_member/lead/admin/
-- pastor policies — those remain as-is; this function is only called directly by the
-- two RPCs above, not referenced from RLS policy bodies.
create or replace function public.user_can_view_task(
  p_task_id uuid,
  p_check_user uuid default auth.uid()
)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from public.tasks t
    where t.id = p_task_id
      and (
        t.assignee_id = p_check_user
        or t.created_by = p_check_user
        or (
          t.is_personal = false
          and t.department_id = (select department_id from public.users where id = p_check_user)
        )
        or (select role from public.users where id = p_check_user) in ('super_admin', 'regional_secretary')
        or exists (
          select 1 from public.task_follows tf
          where tf.task_id = t.id and tf.user_id = p_check_user
        )
        or exists (
          select 1 from public.pastor_members pm
          where pm.pastor_id = p_check_user and pm.member_id = t.assignee_id
        )
      )
  );
$$;

grant execute on function public.user_can_view_task(uuid, uuid) to authenticated;
