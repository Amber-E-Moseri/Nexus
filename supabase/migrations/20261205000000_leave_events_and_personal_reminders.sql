-- ============================================================
-- Dashboard widgets: Team Availability + Personal Reminders
-- ============================================================

-- 1. Add 'leave' as a calendar event type so team members can self-report
--    time away; the Team Availability widget reads these.
ALTER TABLE public.calendar_events DROP CONSTRAINT IF EXISTS calendar_events_event_type_check;
ALTER TABLE public.calendar_events ADD CONSTRAINT calendar_events_event_type_check
  CHECK (event_type IN (
    'conference', 'program', 'training', 'prayer',
    'graduation', 'event', 'deadline', 'leave'
  ));

-- RPC: members of a department currently on leave (today falls within
-- a 'leave' event created by them).
CREATE OR REPLACE FUNCTION public.get_team_availability(p_dept_id uuid)
RETURNS TABLE(member_id uuid, name text, until date, reason text)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (u.id)
    u.id AS member_id,
    u.name,
    ce.end_date::date AS until,
    ce.title AS reason
  FROM public.calendar_events ce
  JOIN public.users u ON u.id = ce.created_by
  WHERE ce.event_type = 'leave'
    AND u.department_id = p_dept_id
    AND ce.start_date::date <= CURRENT_DATE
    AND COALESCE(ce.end_date::date, ce.start_date::date) >= CURRENT_DATE
  ORDER BY u.id, ce.end_date DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_team_availability(uuid) TO authenticated;

-- 2. Personal reminders: quick notes-to-self with a due time, separate
--    from tasks. Strictly user-owned.
CREATE TABLE IF NOT EXISTS public.personal_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  note text NOT NULL,
  remind_at timestamptz,
  done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS personal_reminders_user_id_idx ON public.personal_reminders(user_id);
CREATE INDEX IF NOT EXISTS personal_reminders_remind_at_idx ON public.personal_reminders(remind_at);

ALTER TABLE public.personal_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "personal_reminders_select_own"
  ON public.personal_reminders FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "personal_reminders_insert_own"
  ON public.personal_reminders FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "personal_reminders_update_own"
  ON public.personal_reminders FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "personal_reminders_delete_own"
  ON public.personal_reminders FOR DELETE
  USING (user_id = auth.uid());
