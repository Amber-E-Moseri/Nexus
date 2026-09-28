-- Backfill share_token for existing meeting_attendance_reports
-- Generate UUIDs for any reports that don't have a share_token yet
--
-- GUARD: Table created later by 20260716000000. Forward convergence at 20260716000004.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'meeting_attendance_reports' AND relnamespace = 'public'::regnamespace)
  THEN
    EXECUTE 'update public.meeting_attendance_reports set share_token = gen_random_uuid() where share_token is null';
  END IF;
END;
$$;
