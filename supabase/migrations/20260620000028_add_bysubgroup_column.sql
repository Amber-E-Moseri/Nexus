-- Add bySubgroup JSON column to store per-subgroup breakdown data
alter table public.meeting_attendance_reports
  add column if not exists by_subgroup jsonb default null;

-- Create index for efficient queries
create index if not exists meeting_attendance_reports_by_subgroup_idx
  on public.meeting_attendance_reports using gin (by_subgroup);
