-- Backfill share_token for existing meeting_attendance_reports
-- Generate UUIDs for any reports that don't have a share_token yet

update public.meeting_attendance_reports
set share_token = gen_random_uuid()
where share_token is null;
