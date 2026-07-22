-- Expand task_follows RLS so that:
--   1. Any team member who can see a task can also see its watcher list (SELECT)
--   2. Task creators and admins can add other users as watchers (INSERT)
--   3. Task creators and admins can remove other users as watchers (DELETE)
--
-- The original isolation policy (user_id = auth.uid()) was written for the
-- self-follow toggle only. Now that WatchersPopover lets you add named watchers,
-- the constraints need to match task-level visibility instead of user isolation.
--
-- Rollback:
--   DROP POLICY "task_follows_select"     ON public.task_follows;
--   DROP POLICY "task_follows_insert"     ON public.task_follows;
--   DROP POLICY "task_follows_delete"     ON public.task_follows;
--   CREATE POLICY "task_follows_user_isolation" ON public.task_follows FOR SELECT
--     TO authenticated USING (user_id = auth.uid());
--   CREATE POLICY "task_follows_user_create" ON public.task_follows FOR INSERT
--     TO authenticated WITH CHECK (user_id = auth.uid());
--   CREATE POLICY "task_follows_user_delete" ON public.task_follows FOR DELETE
--     TO authenticated USING (user_id = auth.uid());

-- ── SELECT ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "task_follows_user_isolation" ON public.task_follows;

CREATE POLICY "task_follows_select" ON public.task_follows
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.current_user_role() IN ('super_admin', 'regional_secretary')
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_id
        AND t.department_id = public.current_user_department()
    )
  );

-- ── INSERT ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "task_follows_user_create" ON public.task_follows;

CREATE POLICY "task_follows_insert" ON public.task_follows
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR public.current_user_role() IN ('super_admin', 'regional_secretary')
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_id
        AND (
          t.created_by = auth.uid()
          OR public.has_space_role(auth.uid(), t.department_id, 'dept_lead')
        )
    )
  );

-- ── DELETE ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "task_follows_user_delete" ON public.task_follows;

CREATE POLICY "task_follows_delete" ON public.task_follows
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.current_user_role() IN ('super_admin', 'regional_secretary')
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_id
        AND (
          t.created_by = auth.uid()
          OR public.has_space_role(auth.uid(), t.department_id, 'dept_lead')
        )
    )
  );
