-- Idea Bank: standalone table, independent of meeting_open_items.
-- Net-new only: no ALTER statements against any existing table.

CREATE TABLE IF NOT EXISTS public.idea_bank_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  parent_item_id uuid REFERENCES public.idea_bank_items(id) ON DELETE CASCADE,
  title text NOT NULL,
  item_text text NOT NULL,
  item_type text NOT NULL DEFAULT 'exploration'
    CHECK (item_type IN ('question', 'exploration', 'blocker', 'decision_point', 'future_consideration')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'resolved')),
  implementation_plan text,
  converted_to_task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_idea_bank_items_space_status ON public.idea_bank_items(space_id, status);
CREATE INDEX IF NOT EXISTS idx_idea_bank_items_parent ON public.idea_bank_items(parent_item_id);
CREATE INDEX IF NOT EXISTS idx_idea_bank_items_updated_at ON public.idea_bank_items(updated_at);

ALTER TABLE public.idea_bank_items ENABLE ROW LEVEL SECURITY;

-- RLS matches the live pattern on meeting_open_items (raw EXISTS subquery
-- style, not the newer current_user_role()/current_user_department()
-- helpers), per the task's explicit instruction to match what is live.

CREATE POLICY "idea_bank_items_select" ON public.idea_bank_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
      AND (
        u.role = 'super_admin'
        OR u.role = 'regional_secretary'
        OR u.department_id = idea_bank_items.space_id
        OR idea_bank_items.space_id IS NULL
      )
    )
  );

CREATE POLICY "idea_bank_items_insert" ON public.idea_bank_items
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "idea_bank_items_update" ON public.idea_bank_items
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
      AND (
        u.role = 'super_admin'
        OR u.role = 'regional_secretary'
        OR (u.role = 'dept_lead' AND u.department_id = idea_bank_items.space_id)
      )
    )
  );

CREATE POLICY "idea_bank_items_delete" ON public.idea_bank_items
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
      AND (
        u.role = 'super_admin'
        OR u.role = 'regional_secretary'
        OR (u.role = 'dept_lead' AND u.department_id = idea_bank_items.space_id)
      )
    )
  );
