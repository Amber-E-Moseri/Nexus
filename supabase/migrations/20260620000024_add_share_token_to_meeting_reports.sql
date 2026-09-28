-- Add share_token and meeting_id fields to meeting_attendance_reports
--
-- GUARD: Table is created later by 20260716000000_expected_attendees.sql.
-- Schema deferred; forward convergence at 20260716000004 adds share_token + meeting_id.
-- subgroup_filter is already in the 20260716000000 CREATE TABLE definition.
-- Policy superseded by 20260720000001_public_report_access.sql.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'meeting_attendance_reports' AND relnamespace = 'public'::regnamespace)
  THEN
    EXECUTE 'alter table public.meeting_attendance_reports
      add column if not exists share_token uuid unique default gen_random_uuid(),
      add column if not exists meeting_id uuid references public.meetings(id) on delete set null,
      add column if not exists subgroup_filter text';

    EXECUTE 'create index if not exists meeting_attendance_reports_share_token_idx
      on public.meeting_attendance_reports (share_token)';

    EXECUTE 'create index if not exists meeting_attendance_reports_meeting_id_idx
      on public.meeting_attendance_reports (meeting_id)';

    EXECUTE $pol$
      create policy "Public access to reports via share_token"
        on public.meeting_attendance_reports
        for select
        using (share_token is not null)
    $pol$;
  END IF;
END;
$$;
