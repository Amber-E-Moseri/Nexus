-- Forward convergence for meeting_attendance_reports columns deferred from
-- the premature 00024/00026/00027/00028 cluster (table created by 20260716000000).
--
-- Converges: share_token, meeting_id, by_subgroup (+ indexes).
-- subgroup_filter already in the 20260716000000 CREATE TABLE definition — not repeated.
-- Policies not needed: 20260720000001_public_report_access.sql establishes final SELECT.

-- 1. Add missing columns
ALTER TABLE public.meeting_attendance_reports
  ADD COLUMN IF NOT EXISTS share_token uuid UNIQUE DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS meeting_id uuid REFERENCES public.meetings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS by_subgroup jsonb DEFAULT NULL;

-- 2. Backfill share_token for any existing rows (fresh DB likely has none,
--    but robust for non-empty replays)
UPDATE public.meeting_attendance_reports
  SET share_token = gen_random_uuid()
  WHERE share_token IS NULL;

-- 3. Enforce NOT NULL after backfill (matching 00027 final intent)
ALTER TABLE public.meeting_attendance_reports
  ALTER COLUMN share_token SET NOT NULL;

-- 4. Indexes
CREATE INDEX IF NOT EXISTS meeting_attendance_reports_share_token_idx
  ON public.meeting_attendance_reports (share_token);

CREATE INDEX IF NOT EXISTS meeting_attendance_reports_meeting_id_idx
  ON public.meeting_attendance_reports (meeting_id);

CREATE INDEX IF NOT EXISTS meeting_attendance_reports_by_subgroup_idx
  ON public.meeting_attendance_reports USING gin (by_subgroup);
