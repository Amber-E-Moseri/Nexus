-- Meeting Open Items: discussion points, questions, and considerations
-- extracted from meeting transcripts that are not concrete action items
-- but warrant tracking and follow-up.

CREATE TABLE IF NOT EXISTS public.meeting_open_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  space_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  item_text text NOT NULL,
  item_type text NOT NULL DEFAULT 'exploration'
    CHECK (item_type IN ('question', 'exploration', 'blocker', 'decision_point', 'future_consideration')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'resolved')),
  first_mentioned timestamptz DEFAULT now(),
  last_mentioned timestamptz DEFAULT now(),
  meeting_attendees jsonb,
  transcript_excerpt text,
  confidence_score numeric(3,2),
  converted_to_task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_open_items_space_status ON public.meeting_open_items(space_id, status);
CREATE INDEX IF NOT EXISTS idx_open_items_meeting ON public.meeting_open_items(meeting_id);
CREATE INDEX IF NOT EXISTS idx_open_items_last_mentioned ON public.meeting_open_items(last_mentioned);

ALTER TABLE public.meeting_open_items ENABLE ROW LEVEL SECURITY;

-- SELECT: visible to authenticated users in same department or super_admin
CREATE POLICY "open_items_select" ON public.meeting_open_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
      AND (
        u.role = 'super_admin'
        OR u.role = 'regional_secretary'
        OR u.department_id = meeting_open_items.space_id
        OR meeting_open_items.space_id IS NULL
      )
    )
  );

-- INSERT: authenticated users can create open items
CREATE POLICY "open_items_insert" ON public.meeting_open_items
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- UPDATE: creator, super_admin, regional_secretary, or dept_lead of the space
CREATE POLICY "open_items_update" ON public.meeting_open_items
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
      AND (
        u.role = 'super_admin'
        OR u.role = 'regional_secretary'
        OR (u.role = 'dept_lead' AND u.department_id = meeting_open_items.space_id)
      )
    )
  );

-- DELETE: creator, super_admin, or dept_lead of the space
CREATE POLICY "open_items_delete" ON public.meeting_open_items
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
      AND (
        u.role = 'super_admin'
        OR (u.role = 'dept_lead' AND u.department_id = meeting_open_items.space_id)
      )
    )
  );
