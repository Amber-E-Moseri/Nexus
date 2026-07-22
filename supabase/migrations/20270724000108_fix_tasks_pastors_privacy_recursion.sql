-- =============================================================================
-- Fix: infinite recursion in tasks/task_assignees RLS (SQLSTATE 42P17)
-- -----------------------------------------------------------------------------
-- 20270724000103_pastors_space_privacy.sql (Pastors-space privacy, WS8)
-- introduced a circular RLS dependency between two tables:
--
--   tasks.tasks_pastors_privacy (RESTRICTIVE, SELECT) checks whether the
--   caller is a co-assignee via a correlated subquery against
--   task_assignees ...
--
--   ... but task_assignees.task_assignees_pastors_privacy (RESTRICTIVE,
--   SELECT) itself checks a correlated subquery against tasks to find the
--   parent task's department/assignee/creator.
--
-- Evaluating either policy requires evaluating the other, forever. Postgres
-- detects this and raises "infinite recursion detected in policy for
-- relation tasks" — which PostgREST surfaces as a bare 500 on every tasks
-- query (and anything that embeds tasks, like meeting_open_items'
-- converted_task join, or a plain tasks select for meeting action items).
-- This was live in production, not something introduced today, but it is
-- the reason multiple totally unrelated queries (My Tasks widget, meeting
-- action items, open items) all started 500ing at once.
--
-- Fix: break the cycle. tasks_pastors_privacy's task_assignees lookup moves
-- into a SECURITY DEFINER helper — postgres (the function owner) has
-- BYPASSRLS (confirmed live), so the helper's internal query against
-- task_assignees never re-triggers task_assignees' own RLS, and the cycle
-- can't form. task_assignees' policies keep querying tasks directly (that
-- leg was never the problem — tasks' OTHER select policies don't reference
-- task_assignees at all, only tasks_pastors_privacy did).
-- =============================================================================

create or replace function public.is_task_assignee(p_task_id uuid, p_user_id uuid)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.task_assignees
    where task_id = p_task_id and user_id = p_user_id
  );
$$;

drop policy if exists "tasks_pastors_privacy" on public.tasks;

create policy "tasks_pastors_privacy" on public.tasks
  as restrictive
  for select to authenticated
  using (
    not public.is_pastors_space(department_id)
    or assignee_id = auth.uid()
    or created_by = auth.uid()
    or current_user_role() = 'regional_secretary'
    or public.is_task_assignee(id, auth.uid())
  );
