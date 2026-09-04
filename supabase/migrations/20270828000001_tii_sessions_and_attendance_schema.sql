-- Create TII (This Is It) sessions and attendance tracking tables.
-- Tracks per-day attendance for multi-day event with registration integration.

-- TII Sessions: Define days/sessions for a This Is It event
CREATE TABLE IF NOT EXISTS public.tii_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.event_configs(id) ON DELETE CASCADE,
  session_date date NOT NULL,
  session_name text NOT NULL,        -- e.g., "Friday Evening", "Saturday Morning"
  cmp_service_id text,               -- Reference to CMP service ID for sync
  sort_order int NOT NULL DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, session_date)
);

CREATE INDEX IF NOT EXISTS idx_tii_sessions_event_id ON public.tii_sessions(event_id);
CREATE INDEX IF NOT EXISTS idx_tii_sessions_active ON public.tii_sessions(active);

-- TII Attendance: Individual attendance records per session
CREATE TABLE IF NOT EXISTS public.tii_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.tii_sessions(id) ON DELETE CASCADE,
  registration_id uuid REFERENCES public.registrations(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  email text,
  status text NOT NULL DEFAULT 'present'
    CHECK (status IN ('present', 'absent', 'excused', 'late')),
  notes text,
  checked_in_at timestamptz,
  cmp_attendance_id text,         -- For idempotent syncs (unique per session + cmp_attendance_id)
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tii_attendance_session_id ON public.tii_attendance(session_id);
CREATE INDEX IF NOT EXISTS idx_tii_attendance_registration_id ON public.tii_attendance(registration_id);
CREATE INDEX IF NOT EXISTS idx_tii_attendance_email ON public.tii_attendance(email);
CREATE INDEX IF NOT EXISTS idx_tii_attendance_cmp_id ON public.tii_attendance(cmp_attendance_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tii_attendance_cmp_unique
  ON public.tii_attendance(session_id, cmp_attendance_id)
  WHERE cmp_attendance_id IS NOT NULL;

-- TII Attendance Reports: Aggregated reports per event/day/subgroup
CREATE TABLE IF NOT EXISTS public.tii_attendance_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,                    -- e.g., "TII 2025"
  event_id uuid NOT NULL REFERENCES public.event_configs(id) ON DELETE CASCADE,
  report_type text NOT NULL DEFAULT 'full'
    CHECK (report_type IN ('full', 'by_day', 'by_subgroup', 'summary')),

  -- Overall statistics
  expected_count int,
  attended_count int,
  absent_count int,
  excused_count int,
  unexpected_count int,           -- Walk-ins not in expected pool
  reach_pct numeric(5,2),         -- 0-100 percentage

  -- Lists (text arrays for display)
  present_names text[] DEFAULT '{}',
  absent_names text[] DEFAULT '{}',
  excused_names text[] DEFAULT '{}',
  unexpected_names text[] DEFAULT '{}',

  -- Per-session and per-subgroup breakdowns
  by_session jsonb DEFAULT '{}',          -- {session_id: {expected, present, absent, excused, reach_pct, ...}}
  by_subgroup jsonb DEFAULT '{}',         -- {subgroup: {by_session: {...}, summary: {...}}}

  -- Metadata
  expected_pool_filter text DEFAULT 'confirmed_registered'
    CHECK (expected_pool_filter IN ('confirmed_only', 'confirmed_registered', 'registered_only')),
  share_token uuid UNIQUE,
  attendance_source jsonb,                -- {type: 'cmp'|'manual'|'csv', endpoint: '...', sync_date: ...}
  subgroup_filter text[] DEFAULT '{}',    -- Which subgroups included in report (empty = all)
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tii_reports_event_id ON public.tii_attendance_reports(event_id);
CREATE INDEX IF NOT EXISTS idx_tii_reports_share_token ON public.tii_attendance_reports(share_token);
CREATE INDEX IF NOT EXISTS idx_tii_reports_created_by ON public.tii_attendance_reports(created_by);

-- Enable RLS
ALTER TABLE public.tii_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tii_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tii_attendance_reports ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tii_sessions
-- Inherit from registrations table: registration team, accommodation team, super_admin can see
CREATE POLICY "tii_sessions_registration_team_select"
  ON public.tii_sessions FOR SELECT
  USING (
    EXISTS(
      SELECT 1 FROM public.event_configs ec
      WHERE ec.id = tii_sessions.event_id
      AND (
        current_setting('jwt.claims.user_role', true)::text = 'super_admin'
        OR (
          SELECT COUNT(*) > 0 FROM public.users
          WHERE id = auth.uid()
          AND (role = 'super_admin' OR role = 'regional_secretary')
        )
      )
    )
  );

-- RLS Policies for tii_attendance
-- Anyone in registration team can view attendance for their event
CREATE POLICY "tii_attendance_select"
  ON public.tii_attendance FOR SELECT
  USING (
    EXISTS(
      SELECT 1 FROM public.tii_sessions ts
      WHERE ts.id = tii_attendance.session_id
      AND (
        current_setting('jwt.claims.user_role', true)::text = 'super_admin'
        OR (
          SELECT COUNT(*) > 0 FROM public.users
          WHERE id = auth.uid()
          AND (role = 'super_admin' OR role = 'regional_secretary')
        )
      )
    )
  );

-- Registration team / accommodation team can insert/update attendance
CREATE POLICY "tii_attendance_insert"
  ON public.tii_attendance FOR INSERT
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.tii_sessions ts
      WHERE ts.id = session_id
      AND (
        current_setting('jwt.claims.user_role', true)::text = 'super_admin'
        OR (
          SELECT COUNT(*) > 0 FROM public.users
          WHERE id = auth.uid()
          AND (role = 'super_admin' OR role = 'regional_secretary')
        )
      )
    )
  );

CREATE POLICY "tii_attendance_update"
  ON public.tii_attendance FOR UPDATE
  USING (
    EXISTS(
      SELECT 1 FROM public.tii_sessions ts
      WHERE ts.id = session_id
      AND (
        current_setting('jwt.claims.user_role', true)::text = 'super_admin'
        OR (
          SELECT COUNT(*) > 0 FROM public.users
          WHERE id = auth.uid()
          AND (role = 'super_admin' OR role = 'regional_secretary')
        )
      )
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.tii_sessions ts
      WHERE ts.id = session_id
      AND (
        current_setting('jwt.claims.user_role', true)::text = 'super_admin'
        OR (
          SELECT COUNT(*) > 0 FROM public.users
          WHERE id = auth.uid()
          AND (role = 'super_admin' OR role = 'regional_secretary')
        )
      )
    )
  );

-- RLS Policies for tii_attendance_reports
-- Registration team / accommodation team can view and manage
CREATE POLICY "tii_reports_select"
  ON public.tii_attendance_reports FOR SELECT
  USING (
    current_setting('jwt.claims.user_role', true)::text = 'super_admin'
    OR (
      SELECT COUNT(*) > 0 FROM public.users
      WHERE id = auth.uid()
      AND (role = 'super_admin' OR role = 'regional_secretary')
    )
    -- Public access via share token
    OR share_token IS NOT NULL
  );

-- Only report creator or super_admin can update
CREATE POLICY "tii_reports_update"
  ON public.tii_attendance_reports FOR UPDATE
  USING (
    current_setting('jwt.claims.user_role', true)::text = 'super_admin'
    OR created_by = auth.uid()
  )
  WITH CHECK (
    current_setting('jwt.claims.user_role', true)::text = 'super_admin'
    OR created_by = auth.uid()
  );

-- Registration team / super_admin can insert
CREATE POLICY "tii_reports_insert"
  ON public.tii_attendance_reports FOR INSERT
  WITH CHECK (
    current_setting('jwt.claims.user_role', true)::text = 'super_admin'
    OR (
      SELECT COUNT(*) > 0 FROM public.users
      WHERE id = auth.uid()
      AND (role = 'super_admin' OR role = 'regional_secretary')
    )
  );

-- Comments for documentation
COMMENT ON TABLE public.tii_sessions IS 'Sessions (days/times) for a This Is It multi-day event';
COMMENT ON TABLE public.tii_attendance IS 'Individual attendance records per session';
COMMENT ON TABLE public.tii_attendance_reports IS 'Aggregated attendance reports with session/subgroup breakdowns';

COMMENT ON COLUMN public.tii_attendance_reports.expected_pool_filter IS
  'Controls which registrations count as "expected": confirmed_only, confirmed_registered, or registered_only';
COMMENT ON COLUMN public.tii_attendance_reports.share_token IS
  'UUID token for public read-only access to report via /tii-report/:shareToken route';
