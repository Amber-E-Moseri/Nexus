-- Junction table for multi-assignee tasks.
-- tasks.assignee_id is kept in sync by trigger (primary/earliest assignee).
-- Backfill from existing tasks.assignee_id at the end.

CREATE TABLE IF NOT EXISTS public.task_assignees (
  task_id     uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, user_id)
);

ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_assignees_select" ON public.task_assignees
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_id
        AND t.deleted_at IS NULL
        AND (
          t.assignee_id = auth.uid()
          OR t.created_by = auth.uid()
          OR (t.is_personal = FALSE AND t.department_id = public.current_user_department())
          OR public.current_user_role() IN ('super_admin', 'regional_secretary')
        )
    )
  );

CREATE POLICY "task_assignees_write" ON public.task_assignees
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_id
        AND (
          t.created_by = auth.uid()
          OR public.current_user_role() IN ('super_admin', 'regional_secretary')
          OR public.has_space_role(auth.uid(), t.department_id, 'dept_lead')
        )
    )
  );

-- Trigger: keeps tasks.assignee_id = earliest assignee (NULL when table is empty)
CREATE OR REPLACE FUNCTION public.sync_primary_assignee()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_task_id uuid;
BEGIN
  v_task_id := COALESCE(NEW.task_id, OLD.task_id);
  UPDATE public.tasks
  SET assignee_id = (
    SELECT user_id FROM public.task_assignees
    WHERE task_id = v_task_id
    ORDER BY assigned_at ASC
    LIMIT 1
  )
  WHERE id = v_task_id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_primary_assignee ON public.task_assignees;
CREATE TRIGGER trg_sync_primary_assignee
  AFTER INSERT OR DELETE ON public.task_assignees
  FOR EACH ROW EXECUTE FUNCTION public.sync_primary_assignee();

-- RPC for fetching task IDs assigned to a user (primary or secondary)
CREATE OR REPLACE FUNCTION public.get_my_task_ids(p_user_id uuid)
RETURNS TABLE(task_id uuid) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT DISTINCT t.id
  FROM public.tasks t
  LEFT JOIN public.task_assignees ta ON ta.task_id = t.id
  WHERE t.deleted_at IS NULL
    AND (
      t.created_by = p_user_id
      OR t.assignee_id = p_user_id
      OR ta.user_id = p_user_id
    );
$$;

-- Backfill existing single-assignee tasks into the junction table
INSERT INTO public.task_assignees (task_id, user_id, assigned_at)
SELECT id, assignee_id, created_at
FROM public.tasks
WHERE assignee_id IS NOT NULL
ON CONFLICT DO NOTHING;
