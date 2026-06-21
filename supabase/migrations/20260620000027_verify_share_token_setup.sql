-- Verify and fix share_token column setup
-- This migration ensures:
-- 1. share_token column exists and has proper defaults
-- 2. All existing reports have share_tokens
-- 3. Index is in place for efficient lookups

-- 1. Ensure share_token column exists with auto-generation
alter table public.meeting_attendance_reports
  add column if not exists share_token uuid unique default gen_random_uuid();

-- 2. Backfill any null share_tokens
update public.meeting_attendance_reports
set share_token = gen_random_uuid()
where share_token is null;

-- 3. Make share_token NOT NULL after backfill
alter table public.meeting_attendance_reports
  alter column share_token set not null;

-- 4. Ensure index exists for efficient lookups
drop index if exists meeting_attendance_reports_share_token_idx;
create index meeting_attendance_reports_share_token_idx
  on public.meeting_attendance_reports (share_token);

-- 5. Verify RLS policy allows public access via share_token
drop policy if exists "Public access via share_token" on public.meeting_attendance_reports;
create policy "Public access via share_token"
  on public.meeting_attendance_reports
  for select
  using (share_token is not null);
