-- Add bySubgroup JSON column to store per-subgroup breakdown data
--
-- GUARD: Table created later by 20260716000000. Forward convergence at 20260716000004.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'meeting_attendance_reports' AND relnamespace = 'public'::regnamespace)
  THEN
    EXECUTE 'alter table public.meeting_attendance_reports
      add column if not exists by_subgroup jsonb default null';

    EXECUTE 'create index if not exists meeting_attendance_reports_by_subgroup_idx
      on public.meeting_attendance_reports using gin (by_subgroup)';
  END IF;
END;
$$;
