-- ─────────────────────────────────────────────────────────────────────────────
-- Expected Attendees roster
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.expected_attendees (
  id                  uuid        primary key default gen_random_uuid(),
  full_name           text        not null,
  match_key           text        generated always as (lower(trim(full_name))) stored,
  subgroup            text        not null default '',
  leadership_category text        not null default '',
  active              boolean     not null default true,
  created_by          uuid        references public.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (match_key)
);

drop trigger if exists set_expected_attendees_updated_at on public.expected_attendees;
create trigger set_expected_attendees_updated_at
  before update on public.expected_attendees
  for each row execute function public.set_updated_at();

alter table public.expected_attendees enable row level security;

-- All authenticated users can read the roster (needed for report generation)
create policy "authenticated users can read expected attendees"
  on public.expected_attendees
  for select
  using (auth.role() = 'authenticated');

-- Only super_admin and dept_lead can write
create policy "admins can insert expected attendees"
  on public.expected_attendees
  for insert
  with check (auth.jwt() ->> 'user_role' in ('super_admin', 'dept_lead'));

create policy "admins can update expected attendees"
  on public.expected_attendees
  for update
  using  (auth.jwt() ->> 'user_role' in ('super_admin', 'dept_lead'))
  with check (auth.jwt() ->> 'user_role' in ('super_admin', 'dept_lead'));

create policy "admins can delete expected attendees"
  on public.expected_attendees
  for delete
  using (auth.jwt() ->> 'user_role' in ('super_admin', 'dept_lead'));

create index if not exists expected_attendees_subgroup_idx
  on public.expected_attendees (subgroup);

create index if not exists expected_attendees_active_idx
  on public.expected_attendees (active) where active = true;


-- ─────────────────────────────────────────────────────────────────────────────
-- Meeting Attendance Reports
-- ─────────────────────────────────────────────────────────────────────────────

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
  subgroup_filter   text,
  created_by        uuid        references public.users(id) on delete set null,
  created_at        timestamptz not null default now()
);

alter table public.meeting_attendance_reports enable row level security;

-- Users see their own reports; super_admin sees all
create policy "users can view own attendance reports"
  on public.meeting_attendance_reports
  for select
  using (
    created_by = auth.uid()
    or auth.jwt() ->> 'user_role' = 'super_admin'
  );

-- Authenticated users can insert reports they own
create policy "authenticated users can insert attendance reports"
  on public.meeting_attendance_reports
  for insert
  with check (
    auth.role() = 'authenticated'
    and created_by = auth.uid()
  );

-- Users can delete their own; super_admin can delete any
create policy "users can delete own attendance reports"
  on public.meeting_attendance_reports
  for delete
  using (
    created_by = auth.uid()
    or auth.jwt() ->> 'user_role' = 'super_admin'
  );

create index if not exists meeting_attendance_reports_created_by_idx
  on public.meeting_attendance_reports (created_by, created_at desc);
