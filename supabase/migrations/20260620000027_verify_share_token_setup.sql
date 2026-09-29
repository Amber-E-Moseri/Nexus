-- Verify and fix share_token column setup
-- This migration ensures:
-- 1. share_token column exists and has proper defaults
-- 2. All existing reports have share_tokens
-- 3. Index is in place for efficient lookups
--
-- GUARD: Table created later by 20260716000000. Forward convergence at 20260716000004.
-- Policy superseded by 20260720000001_public_report_access.sql.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'meeting_attendance_reports' AND relnamespace = 'public'::regnamespace)
  THEN
    EXECUTE 'alter table public.meeting_attendance_reports
      add column if not exists share_token uuid unique default gen_random_uuid()';

    EXECUTE 'update public.meeting_attendance_reports
      set share_token = gen_random_uuid() where share_token is null';

    EXECUTE 'alter table public.meeting_attendance_reports
      alter column share_token set not null';

    EXECUTE 'drop index if exists meeting_attendance_reports_share_token_idx';
    EXECUTE 'create index meeting_attendance_reports_share_token_idx
      on public.meeting_attendance_reports (share_token)';

    EXECUTE 'drop policy if exists "Public access via share_token" on public.meeting_attendance_reports';
    EXECUTE $pol$
      create policy "Public access via share_token"
        on public.meeting_attendance_reports
        for select
        using (share_token is not null)
    $pol$;
  END IF;
END;
$$;
