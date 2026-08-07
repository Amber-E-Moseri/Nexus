-- Nova Release 5: Controlled Actions
-- 1. nova_action_proposals — pending write actions awaiting confirmation
-- 2. nova_create_task, nova_assign_task, nova_add_agenda_item — domain write RPCs
-- All write RPCs: SECURITY DEFINER + pinned search_path + explicit permission check.

-- ─── 1. nova_action_proposals ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.nova_action_proposals (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id               uuid        REFERENCES public.nova_sessions(id),
  user_id                  uuid        NOT NULL REFERENCES public.users(id),
  tool_name                text        NOT NULL,
  arguments                jsonb       NOT NULL,
  arguments_hash           text        NOT NULL,
  resolved_entities        jsonb       DEFAULT '[]',
  warnings                 text[]      DEFAULT '{}',
  missing_fields           text[]      DEFAULT '{}',
  permission_snapshot      jsonb,
  confirmation_token_hash  text,
  token_expires_at         timestamptz,
  consumed_at              timestamptz,
  status                   text        NOT NULL DEFAULT 'pending'
                                         CHECK (status IN ('pending', 'confirmed', 'cancelled', 'expired')),
  created_at               timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.nova_action_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nova_proposals_own ON public.nova_action_proposals;
CREATE POLICY nova_proposals_own ON public.nova_action_proposals
  FOR ALL USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS nova_proposals_user_idx
  ON public.nova_action_proposals (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS nova_proposals_session_idx
  ON public.nova_action_proposals (session_id);

-- ─── 2. nova_assign_task ─────────────────────────────────────────────────────
-- Assigns (or reassigns) a task to a user.
-- Permission: super_admin / regional_secretary see all; others must be in the task's department.

DROP FUNCTION IF EXISTS public.nova_assign_task(uuid, uuid);

CREATE OR REPLACE FUNCTION public.nova_assign_task(
  p_task_id     uuid,
  p_assignee_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_task_dept uuid;
BEGIN
  -- Load the task's department for permission check
  SELECT department_id INTO v_task_dept FROM public.tasks WHERE id = p_task_id;

  IF v_task_dept IS NULL AND NOT (current_user_role() IN ('super_admin', 'regional_secretary')) THEN
    RAISE EXCEPTION 'task not found or permission denied';
  END IF;

  IF NOT (
    current_user_role() IN ('super_admin', 'regional_secretary')
    OR v_task_dept = current_user_department()
  ) THEN
    RAISE EXCEPTION 'permission denied: cannot modify task in this department';
  END IF;

  UPDATE public.tasks
  SET assignee_id = p_assignee_id, updated_at = now()
  WHERE id = p_task_id;

  RETURN p_task_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.nova_assign_task(uuid, uuid) TO authenticated;

-- ─── 3. nova_create_task ─────────────────────────────────────────────────────
-- Creates a task, fires the existing activity log infrastructure.
-- department_id scopes the task; the default "To Do" status is resolved automatically.

DROP FUNCTION IF EXISTS public.nova_create_task(text, uuid, uuid, date, text, uuid, uuid);

CREATE OR REPLACE FUNCTION public.nova_create_task(
  p_title         text,
  p_department_id uuid,
  p_assignee_id   uuid   DEFAULT NULL,
  p_due_date      date   DEFAULT NULL,
  p_priority      text   DEFAULT 'normal',
  p_meeting_id    uuid   DEFAULT NULL,
  p_sprint_id     uuid   DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_task_id   uuid;
  v_status_id uuid;
BEGIN
  -- Permission: must be in the target department or have org-wide role
  IF NOT (
    current_user_role() IN ('super_admin', 'regional_secretary')
    OR p_department_id = current_user_department()
  ) THEN
    RAISE EXCEPTION 'permission denied: cannot create task in this department';
  END IF;

  -- Resolve default "To Do" status for this department
  SELECT id INTO v_status_id
  FROM public.task_status_definitions
  WHERE (department_id = p_department_id OR department_id IS NULL)
    AND legacy_key = 'to_do'
    AND active = true
  ORDER BY (department_id IS NULL) ASC  -- prefer dept-specific over org-level
  LIMIT 1;

  INSERT INTO public.tasks (
    title, department_id, assignee_id, due_date, priority,
    meeting_id, sprint_id, created_by, status_id
  ) VALUES (
    p_title, p_department_id, p_assignee_id, p_due_date, p_priority,
    p_meeting_id, p_sprint_id, auth.uid(), v_status_id
  )
  RETURNING id INTO v_task_id;

  RETURN v_task_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.nova_create_task(text, uuid, uuid, date, text, uuid, uuid) TO authenticated;

-- ─── 4. nova_add_agenda_item ─────────────────────────────────────────────────
-- Appends an agenda item to meetings.agenda (jsonb array).
-- Permission: super_admin / regional_secretary / member of the meeting's department.

DROP FUNCTION IF EXISTS public.nova_add_agenda_item(uuid, text);

CREATE OR REPLACE FUNCTION public.nova_add_agenda_item(
  p_meeting_id uuid,
  p_item       text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dept_id uuid;
BEGIN
  SELECT department_id INTO v_dept_id FROM public.meetings WHERE id = p_meeting_id;

  IF v_dept_id IS NULL AND NOT (current_user_role() IN ('super_admin', 'regional_secretary')) THEN
    RAISE EXCEPTION 'meeting not found or permission denied';
  END IF;

  IF NOT (
    current_user_role() IN ('super_admin', 'regional_secretary')
    OR v_dept_id = current_user_department()
  ) THEN
    RAISE EXCEPTION 'permission denied: cannot modify this meeting';
  END IF;

  UPDATE public.meetings
  SET
    agenda = COALESCE(agenda, '[]'::jsonb)
             || jsonb_build_array(jsonb_build_object(
               'title', p_item,
               'source', 'nova',
               'added_by', auth.uid()::text,
               'added_at', now()::text
             )),
    updated_at = now()
  WHERE id = p_meeting_id;

  RETURN p_meeting_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.nova_add_agenda_item(uuid, text) TO authenticated;
