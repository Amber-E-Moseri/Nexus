-- Fix task_checklists + task_checklist_items write policies.
-- Original INSERT/UPDATE/DELETE policies were missing:
--   1. regional_secretary (SELECT already included it)
--   2. secondary assignees via task_assignees junction table

-- ── task_checklists ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "checklists_insert" ON task_checklists;
CREATE POLICY "checklists_insert" ON task_checklists
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_checklists.task_id
        AND (
          t.created_by = auth.uid()
          OR t.assignee_id = auth.uid()
          OR public.current_user_role() IN ('super_admin', 'regional_secretary')
          OR public.has_space_role(auth.uid(), t.department_id, 'dept_lead')
          OR EXISTS (
            SELECT 1 FROM task_assignees ta
            WHERE ta.task_id = t.id AND ta.user_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS "checklists_update" ON task_checklists;
CREATE POLICY "checklists_update" ON task_checklists
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_checklists.task_id
        AND (
          t.created_by = auth.uid()
          OR t.assignee_id = auth.uid()
          OR public.current_user_role() IN ('super_admin', 'regional_secretary')
          OR public.has_space_role(auth.uid(), t.department_id, 'dept_lead')
          OR EXISTS (
            SELECT 1 FROM task_assignees ta
            WHERE ta.task_id = t.id AND ta.user_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS "checklists_delete" ON task_checklists;
CREATE POLICY "checklists_delete" ON task_checklists
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_checklists.task_id
        AND (
          t.created_by = auth.uid()
          OR t.assignee_id = auth.uid()
          OR public.current_user_role() IN ('super_admin', 'regional_secretary')
          OR public.has_space_role(auth.uid(), t.department_id, 'dept_lead')
          OR EXISTS (
            SELECT 1 FROM task_assignees ta
            WHERE ta.task_id = t.id AND ta.user_id = auth.uid()
          )
        )
    )
  );

-- ── task_checklist_items ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS "checklist_items_insert" ON task_checklist_items;
CREATE POLICY "checklist_items_insert" ON task_checklist_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM task_checklists tc
      JOIN tasks t ON t.id = tc.task_id
      WHERE tc.id = task_checklist_items.checklist_id
        AND (
          t.created_by = auth.uid()
          OR t.assignee_id = auth.uid()
          OR public.current_user_role() IN ('super_admin', 'regional_secretary')
          OR public.has_space_role(auth.uid(), t.department_id, 'dept_lead')
          OR EXISTS (
            SELECT 1 FROM task_assignees ta
            WHERE ta.task_id = t.id AND ta.user_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS "checklist_items_update" ON task_checklist_items;
CREATE POLICY "checklist_items_update" ON task_checklist_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM task_checklists tc
      JOIN tasks t ON t.id = tc.task_id
      WHERE tc.id = task_checklist_items.checklist_id
        AND (
          t.created_by = auth.uid()
          OR t.assignee_id = auth.uid()
          OR public.current_user_role() IN ('super_admin', 'regional_secretary')
          OR public.has_space_role(auth.uid(), t.department_id, 'dept_lead')
          OR EXISTS (
            SELECT 1 FROM task_assignees ta
            WHERE ta.task_id = t.id AND ta.user_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS "checklist_items_delete" ON task_checklist_items;
CREATE POLICY "checklist_items_delete" ON task_checklist_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM task_checklists tc
      JOIN tasks t ON t.id = tc.task_id
      WHERE tc.id = task_checklist_items.checklist_id
        AND (
          t.created_by = auth.uid()
          OR t.assignee_id = auth.uid()
          OR public.current_user_role() IN ('super_admin', 'regional_secretary')
          OR public.has_space_role(auth.uid(), t.department_id, 'dept_lead')
          OR EXISTS (
            SELECT 1 FROM task_assignees ta
            WHERE ta.task_id = t.id AND ta.user_id = auth.uid()
          )
        )
    )
  );
