-- Checklist groups: a task can have multiple named checklists
CREATE TABLE task_checklists (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title      text NOT NULL DEFAULT 'Checklist',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE task_checklists ENABLE ROW LEVEL SECURITY;

-- Checklist items: simple checkbox items within a checklist
CREATE TABLE task_checklist_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES task_checklists(id) ON DELETE CASCADE,
  title        text NOT NULL,
  is_checked   boolean NOT NULL DEFAULT false,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz DEFAULT now()
);
ALTER TABLE task_checklist_items ENABLE ROW LEVEL SECURITY;

-- RLS: task_checklists
-- SELECT: same audience as tasks (member, lead, admin/regional_secretary, follower)
CREATE POLICY "checklists_select" ON task_checklists
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_checklists.task_id
        AND t.deleted_at IS NULL
        AND (
          t.assignee_id = auth.uid()
          OR t.created_by = auth.uid()
          OR (t.is_personal = false AND t.department_id = public.current_user_department())
          OR public.has_space_role(auth.uid(), t.department_id, 'dept_lead')
          OR public.current_user_role() IN ('super_admin', 'regional_secretary')
          OR EXISTS (
            SELECT 1 FROM task_follows tf
            WHERE tf.task_id = t.id AND tf.user_id = auth.uid()
          )
        )
    )
  );

-- INSERT/UPDATE/DELETE: creator, assignee, super_admin, or dept_lead
-- NOTE: t.assignee_id is the single-assignee column. When the multi-assignee
-- task_assignees junction table ships, add a second EXISTS branch here for
-- secondary assignees or they will silently lose checklist write access.
CREATE POLICY "checklists_insert" ON task_checklists
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_checklists.task_id
        AND (
          t.created_by = auth.uid()
          OR t.assignee_id = auth.uid()
          OR public.current_user_role() = 'super_admin'
          OR public.has_space_role(auth.uid(), t.department_id, 'dept_lead')
        )
    )
  );

CREATE POLICY "checklists_update" ON task_checklists
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_checklists.task_id
        AND (
          t.created_by = auth.uid()
          OR t.assignee_id = auth.uid()
          OR public.current_user_role() = 'super_admin'
          OR public.has_space_role(auth.uid(), t.department_id, 'dept_lead')
        )
    )
  );

CREATE POLICY "checklists_delete" ON task_checklists
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_checklists.task_id
        AND (
          t.created_by = auth.uid()
          OR t.assignee_id = auth.uid()
          OR public.current_user_role() = 'super_admin'
          OR public.has_space_role(auth.uid(), t.department_id, 'dept_lead')
        )
    )
  );

-- RLS: task_checklist_items (chained through task_checklists → tasks)
-- Same NOTE: update when multi-assignee task_assignees ships.
CREATE POLICY "checklist_items_select" ON task_checklist_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM task_checklists tc
      JOIN tasks t ON t.id = tc.task_id
      WHERE tc.id = task_checklist_items.checklist_id
        AND t.deleted_at IS NULL
        AND (
          t.assignee_id = auth.uid()
          OR t.created_by = auth.uid()
          OR (t.is_personal = false AND t.department_id = public.current_user_department())
          OR public.has_space_role(auth.uid(), t.department_id, 'dept_lead')
          OR public.current_user_role() IN ('super_admin', 'regional_secretary')
          OR EXISTS (
            SELECT 1 FROM task_follows tf
            WHERE tf.task_id = t.id AND tf.user_id = auth.uid()
          )
        )
    )
  );

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
          OR public.current_user_role() = 'super_admin'
          OR public.has_space_role(auth.uid(), t.department_id, 'dept_lead')
        )
    )
  );

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
          OR public.current_user_role() = 'super_admin'
          OR public.has_space_role(auth.uid(), t.department_id, 'dept_lead')
        )
    )
  );

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
          OR public.current_user_role() = 'super_admin'
          OR public.has_space_role(auth.uid(), t.department_id, 'dept_lead')
        )
    )
  );
