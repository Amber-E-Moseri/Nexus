-- task_checklists: filter by task_id in queries and all RLS policy EXISTS subqueries
CREATE INDEX IF NOT EXISTS idx_task_checklists_task_id
  ON task_checklists (task_id);

-- task_checklist_items: filter by checklist_id in queries and all RLS policy EXISTS subqueries
CREATE INDEX IF NOT EXISTS idx_task_checklist_items_checklist_id
  ON task_checklist_items (checklist_id);
