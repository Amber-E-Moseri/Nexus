create table if not exists public.meeting_attendance_reports (
  id                uuid        primary key default gen_random_uuid(),
  label             text        not null,
  report_date       date        not null default current_date,
  expected_count    integer     not null,
  attended_count    integer     not null,
  absent_count      integer     not null,
  unexpected_count  integer     not null,
  reach_pct         numeric(5,2) not null,
  present_names     text[]      not null default '{}',
  absent_names      text[]      not null default '{}',
  unexpected_names  text[]      not null default '{}',
  created_by        uuid        references public.users(id) on delete set null,
  created_at        timestamptz not null default now()
);

alter table public.meeting_attendance_reports enable row level security;

create policy "Users can view their own attendance reports"
  on public.meeting_attendance_reports
  for select
  using (created_by = auth.uid());

create policy "Users can insert their own attendance reports"
  on public.meeting_attendance_reports
  for insert
  with check (created_by = auth.uid());

create policy "Users can delete their own attendance reports"
  on public.meeting_attendance_reports
  for delete
  using (created_by = auth.uid());

create index if not exists meeting_attendance_reports_created_by_idx
  on public.meeting_attendance_reports (created_by, created_at desc);
