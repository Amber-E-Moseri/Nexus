-- Add share_token and meeting_id fields to meeting_attendance_reports
alter table public.meeting_attendance_reports
  add column if not exists share_token uuid unique default gen_random_uuid(),
  add column if not exists meeting_id uuid references public.meetings(id) on delete set null,
  add column if not exists subgroup_filter text;

-- Create index on share_token for efficient lookups
create index if not exists meeting_attendance_reports_share_token_idx
  on public.meeting_attendance_reports (share_token);

-- Create index on meeting_id
create index if not exists meeting_attendance_reports_meeting_id_idx
  on public.meeting_attendance_reports (meeting_id);

-- Add RLS policy to allow public access via share_token
create policy "Public access to reports via share_token"
  on public.meeting_attendance_reports
  for select
  using (share_token is not null);
