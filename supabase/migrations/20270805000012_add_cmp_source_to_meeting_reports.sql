-- Persist the CMP service used to generate a report so it can be safely re-synced later.
alter table public.meeting_attendance_reports
  add column if not exists attendance_source jsonb;
