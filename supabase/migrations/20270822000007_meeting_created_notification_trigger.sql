-- Bug 7b: No notification fires when a meeting is created.
-- This trigger fans out a meeting_created notification to all users in the
-- same department as the meeting's space when a new meeting is inserted.

CREATE OR REPLACE FUNCTION public.notify_meeting_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member RECORD;
  v_dept_id uuid;
  v_payload jsonb;
BEGIN
  -- Resolve department from space_id (spaces.id = department id in this schema)
  v_dept_id := NEW.space_id;

  v_payload := jsonb_build_object(
    'meeting_id',    NEW.id,
    'meeting_title', NEW.title,
    'date',          to_char(NEW.scheduled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI UTC'),
    'created_by',    NEW.created_by
  );

  FOR v_member IN
    SELECT u.id AS user_id
    FROM public.users u
    WHERE u.department_id = v_dept_id
      AND u.id != NEW.created_by
      AND u.is_active = true
  LOOP
    INSERT INTO public.notifications (user_id, type, payload)
    VALUES (v_member.user_id, 'meeting_created', v_payload)
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_meeting_created_trigger ON public.meetings;
CREATE TRIGGER notify_meeting_created_trigger
  AFTER INSERT ON public.meetings
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_meeting_created();
