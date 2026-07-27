-- Fix: checklists_select and task_dependencies_select both do:
--   EXISTS (SELECT 1 FROM tasks WHERE tasks.id = ...)
-- That subquery triggers tasks' RLS, which calls is_task_assignee() (SECURITY
-- DEFINER) → queries task_assignees → task_assignees_write policy calls
-- task_meta() → queries tasks again. Postgres detects the cycle and raises
-- "infinite recursion detected in policy for relation" → 500 from PostgREST.
--
-- Fix: use task_meta() + is_task_assignee() SECURITY DEFINER helpers directly
-- in these policies (same pattern as the tasks SELECT policies). This avoids
-- re-entering tasks' RLS mid-evaluation.
-- Also adds multi-assignee (task_assignees) visibility that was missing.

-- ── task_checklists ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "checklists_select" ON public.task_checklists;
CREATE POLICY "checklists_select" ON public.task_checklists
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.task_meta(task_checklists.task_id) tm
      WHERE tm.deleted_at IS NULL
        AND (
          tm.assignee_id       = auth.uid()
          OR tm.created_by     = auth.uid()
          OR public.current_user_role() IN ('super_admin', 'regional_secretary')
          OR public.has_space_role(auth.uid(), tm.department_id, 'dept_lead')
          OR (
            tm.is_personal = false
            AND tm.department_id IS NOT NULL
            AND tm.department_id = public.current_user_department()
          )
          OR public.is_task_assignee(task_checklists.task_id, auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.task_follows tf
            WHERE tf.task_id = task_checklists.task_id
              AND tf.user_id = auth.uid()
          )
        )
    )
  );

-- ── task_checklist_items ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS "checklist_items_select" ON public.task_checklist_items;
CREATE POLICY "checklist_items_select" ON public.task_checklist_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.task_checklists tc
      JOIN public.task_meta(tc.task_id) tm ON true
      WHERE tc.id = task_checklist_items.checklist_id
        AND tm.deleted_at IS NULL
        AND (
          tm.assignee_id       = auth.uid()
          OR tm.created_by     = auth.uid()
          OR public.current_user_role() IN ('super_admin', 'regional_secretary')
          OR public.has_space_role(auth.uid(), tm.department_id, 'dept_lead')
          OR (
            tm.is_personal = false
            AND tm.department_id IS NOT NULL
            AND tm.department_id = public.current_user_department()
          )
          OR public.is_task_assignee(tc.task_id, auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.task_follows tf
            WHERE tf.task_id = tc.task_id
              AND tf.user_id = auth.uid()
          )
        )
    )
  );

-- ── task_dependencies ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "task_dependencies_select" ON public.task_dependencies;
CREATE POLICY "task_dependencies_select" ON public.task_dependencies
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.task_meta(task_dependencies.task_id) tm
      WHERE tm.deleted_at IS NULL
        AND (
          tm.assignee_id       = auth.uid()
          OR tm.created_by     = auth.uid()
          OR public.current_user_role() IN ('super_admin', 'regional_secretary')
          OR public.has_space_role(auth.uid(), tm.department_id, 'dept_lead')
          OR (
            tm.is_personal = false
            AND tm.department_id IS NOT NULL
            AND tm.department_id = public.current_user_department()
          )
          OR public.is_task_assignee(task_dependencies.task_id, auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.task_follows tf
            WHERE tf.task_id = task_dependencies.task_id
              AND tf.user_id = auth.uid()
          )
        )
    )
  );

-- ── tasks_update: allow assignees to update their own tasks ──────────────────
-- Migration 20270802000000 added tasks_update but didn't include assignees,
-- so an assignee marking a task Completed got "permission denied on tasks".
-- 20270802000007 fixed set_task_assignees but not the tasks row update itself.

DROP POLICY IF EXISTS "tasks_update" ON public.tasks;
CREATE POLICY "tasks_update" ON public.tasks
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      created_by = auth.uid()
      OR public.current_user_role() IN ('super_admin', 'regional_secretary')
      OR public.has_space_role(auth.uid(), department_id, 'dept_lead')
      OR public.has_any_space_role(auth.uid(), 'ors')
      OR public.has_any_space_role(auth.uid(), 'programs')
      OR assignee_id = auth.uid()
      OR public.is_task_assignee(id, auth.uid())
    )
  )
  WITH CHECK (
    created_by = auth.uid()
    OR public.current_user_role() IN ('super_admin', 'regional_secretary')
    OR public.has_space_role(auth.uid(), department_id, 'dept_lead')
    OR public.has_any_space_role(auth.uid(), 'ors')
    OR public.has_any_space_role(auth.uid(), 'programs')
    OR assignee_id = auth.uid()
    OR public.is_task_assignee(id, auth.uid())
  );
