-- Bug: notify_meeting_created() (added in 20270822000007) references
-- NEW.scheduled_at and NEW.space_id, but public.meetings has never had those
-- columns — the actual columns are `date` and `department_id` (see
-- 20260608000000_initial_blw_canada_os_schema.sql). Since the trigger fires
-- AFTER INSERT FOR EACH ROW with no guard, every single insert into meetings
-- since 2026-08-22 has failed with:
--   record "new" has no field "scheduled_at"
-- rolling back the whole insert transaction. This silently broke:
--   - "Log meeting" / "Plan a meeting" from the UI (any new meeting)
--   - generate-recurring-meetings (hourly cron) — every next-occurrence
--     insert for every recurring series has been failing since 2026-08-22,
--     which is why "Weekly Direction Meeting" stopped generating occurrences
--     after 2026-08-17 (the last one that predates this migration).
--
-- Fix: use the real column names.

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
  v_dept_id := NEW.department_id;

  v_payload := jsonb_build_object(
    'meeting_id',    NEW.id,
    'meeting_title', NEW.title,
    'date',          to_char(NEW.date AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI UTC'),
    'created_by',    NEW.created_by
  );

  IF v_dept_id IS NOT NULL THEN
    FOR v_member IN
      SELECT u.id AS user_id
      FROM public.users u
      WHERE u.department_id = v_dept_id
        AND u.id != NEW.created_by
        AND u.status = 'active'
    LOOP
      INSERT INTO public.notifications (user_id, type, payload)
      VALUES (v_member.user_id, 'meeting_created', v_payload)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;
