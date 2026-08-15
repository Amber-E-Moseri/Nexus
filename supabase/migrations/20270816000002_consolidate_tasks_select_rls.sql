-- Perf fix: tasks had 9 separate PERMISSIVE SELECT policies (Postgres OR-combines
-- all permissive policies for a command, so every SELECT against tasks paid for
-- all 9, several with their own EXISTS subqueries). Confirmed via pg_stat_statements
-- that get_dashboard_data() — which queries tasks ~10 times internally — averaged
-- 268.8ms through PostgREST (RLS-enforced) vs 9.7ms bypassing RLS as superuser,
-- a ~27x tax, on a table with only ~435 rows. Not a data-volume problem — a
-- policy-count problem.
--
-- This merges the 9 policies into one, and wraps every bare auth.uid() /
-- current_user_role() / current_user_department() call as a scalar subquery
-- (select ...), which lets Postgres cache the result once per query (InitPlan)
-- instead of re-evaluating per row. This is the same pattern already used by
-- the meetings_select policy — tasks just never got it.
--
-- Verified behaviorally identical (0 mismatches, matching visible-row counts)
-- against live data for one real user per role (dept_lead, member, pastor,
-- regional_secretary, super_admin) before this migration was written: the
-- merged qual is a pure OR-concatenation of the original 9 quals with only
-- the function-call wrapping changed — no logic was added, removed, or
-- restructured. In particular tasks_select_member's original qual has no
-- deleted_at guard (unlike the other 8) and that asymmetry is preserved as-is.
--
-- Untouched: the two RESTRICTIVE SELECT-relevant policies
-- (tasks_hide_deliverables_from_non_programs, tasks_pastors_privacy) and all
-- INSERT/UPDATE/DELETE policies — this migration is SELECT-only.

DROP POLICY IF EXISTS tasks_personal_owner ON public.tasks;
DROP POLICY IF EXISTS tasks_select_admin ON public.tasks;
DROP POLICY IF EXISTS tasks_select_assignee ON public.tasks;
DROP POLICY IF EXISTS tasks_select_follower ON public.tasks;
DROP POLICY IF EXISTS tasks_select_lead ON public.tasks;
DROP POLICY IF EXISTS tasks_select_member ON public.tasks;
DROP POLICY IF EXISTS tasks_select_pastor ON public.tasks;
DROP POLICY IF EXISTS tasks_select_space_access ON public.tasks;
DROP POLICY IF EXISTS tasks_select_sprint_member ON public.tasks;

CREATE POLICY tasks_select ON public.tasks
FOR SELECT
USING (
  -- from tasks_personal_owner
  ((deleted_at IS NULL) AND (is_personal = true) AND (assignee_id = (select auth.uid())))
  OR
  -- from tasks_select_admin
  ((deleted_at IS NULL) AND ((select current_user_role()) = 'super_admin') AND ((is_personal = false) OR (created_by = (select auth.uid())) OR (assignee_id = (select auth.uid()))))
  OR
  -- from tasks_select_assignee
  ((deleted_at IS NULL) AND is_task_assignee(id, (select auth.uid())))
  OR
  -- from tasks_select_follower
  ((deleted_at IS NULL) AND (EXISTS (SELECT 1 FROM task_follows tf WHERE tf.task_id = tasks.id AND tf.user_id = (select auth.uid()))) AND ((meeting_id IS NULL) OR (EXISTS (SELECT 1 FROM meetings m WHERE m.id = tasks.meeting_id AND (m.visibility = 'published' OR m.created_by = (select auth.uid()) OR (select auth.uid()) = ANY (COALESCE(m.allowed_viewers, '{}'::uuid[])) OR (select auth.uid()) = ANY (COALESCE(m.allowed_editors, '{}'::uuid[])) OR (select current_user_role()) = ANY (ARRAY['super_admin'::text,'regional_secretary'::text]))))))
  OR
  -- from tasks_select_lead
  ((deleted_at IS NULL) AND (has_space_role((select auth.uid()), department_id, 'dept_lead'::text) OR (EXISTS (SELECT 1 FROM task_follows tf JOIN users u ON u.id = tf.user_id WHERE tf.task_id = tasks.id AND tf.added_via = 'mention' AND u.department_id = (select current_user_department()) AND tasks.is_personal = false))) AND ((meeting_id IS NULL) OR (EXISTS (SELECT 1 FROM meetings m WHERE m.id = tasks.meeting_id AND (m.visibility = 'published' OR m.created_by = (select auth.uid()) OR (select auth.uid()) = ANY (COALESCE(m.allowed_viewers, '{}'::uuid[])) OR (select auth.uid()) = ANY (COALESCE(m.allowed_editors, '{}'::uuid[])) OR (select current_user_role()) = ANY (ARRAY['super_admin'::text,'regional_secretary'::text]))))))
  OR
  -- from tasks_select_member (note: no deleted_at guard, preserved as-is)
  ((assignee_id = (select auth.uid())) OR (created_by = (select auth.uid())) OR ((is_personal = false) AND (department_id = (select current_user_department()))) OR ((task_type = 'sprint') AND is_sprint_member(sprint_id)))
  OR
  -- from tasks_select_pastor
  ((deleted_at IS NULL) AND (is_personal = false) AND (EXISTS (SELECT 1 FROM pastor_members pm WHERE pm.pastor_id = (select auth.uid()) AND pm.member_id = tasks.assignee_id)))
  OR
  -- from tasks_select_space_access
  ((deleted_at IS NULL) AND (NOT is_personal) AND (((department_id IS NOT NULL) AND can_view_space(department_id)) OR ((sprint_id IS NOT NULL) AND (EXISTS (SELECT 1 FROM sprints s WHERE s.id = tasks.sprint_id AND s.department_id IS NOT NULL AND can_view_space(s.department_id))))))
  OR
  -- from tasks_select_sprint_member
  ((deleted_at IS NULL) AND (task_type = 'sprint') AND (sprint_id IS NOT NULL) AND is_sprint_member(sprint_id))
);
