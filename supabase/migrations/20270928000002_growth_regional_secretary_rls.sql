-- Growth Tracking — regional_secretary operational access
-- Widens per-table policies from super_admin-only FOR ALL to per-operation,
-- least-privilege policies that also cover regional_secretary.
--
-- regional_secretary MAY:
--   service_center_schedule    → SELECT, UPDATE (toggle active/inactive)
--   service_center_week_status → full CRUD (operational week flags)
--   report_recipients          → SELECT only
--   service_reports            → SELECT (needed for security_invoker view)
--
-- super_admin retains full CRUD on all tables.
-- service_role bypasses added where they were previously missing.
-- fill_center_gaps receives an explicit role guard in the function body.

-- ── service_reports ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "service_reports_admin" ON public.service_reports;

-- SELECT: super_admin and regional_secretary can read report data
CREATE POLICY "service_reports_select" ON public.service_reports
  FOR SELECT
  USING ((auth.jwt() ->> 'user_role') IN ('super_admin', 'regional_secretary'));

-- INSERT / UPDATE / DELETE: super_admin only (sync writes via service_role)
CREATE POLICY "service_reports_insert" ON public.service_reports
  FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'super_admin');

CREATE POLICY "service_reports_update" ON public.service_reports
  FOR UPDATE
  USING  ((auth.jwt() ->> 'user_role') = 'super_admin')
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'super_admin');

CREATE POLICY "service_reports_delete" ON public.service_reports
  FOR DELETE
  USING ((auth.jwt() ->> 'user_role') = 'super_admin');

-- ── service_center_schedule ───────────────────────────────────────────────────

DROP POLICY IF EXISTS "schedule_admin" ON public.service_center_schedule;

CREATE POLICY "schedule_select" ON public.service_center_schedule
  FOR SELECT
  USING ((auth.jwt() ->> 'user_role') IN ('super_admin', 'regional_secretary'));

-- INSERT / DELETE: super_admin only (adding/removing centers is structural)
CREATE POLICY "schedule_insert" ON public.service_center_schedule
  FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'super_admin');

-- UPDATE: both roles — regional_secretary uses this to toggle active/inactive
CREATE POLICY "schedule_update" ON public.service_center_schedule
  FOR UPDATE
  USING  ((auth.jwt() ->> 'user_role') IN ('super_admin', 'regional_secretary'))
  WITH CHECK ((auth.jwt() ->> 'user_role') IN ('super_admin', 'regional_secretary'));

CREATE POLICY "schedule_delete" ON public.service_center_schedule
  FOR DELETE
  USING ((auth.jwt() ->> 'user_role') = 'super_admin');

-- ── service_center_week_status ────────────────────────────────────────────────

DROP POLICY IF EXISTS "week_status_admin" ON public.service_center_week_status;

-- Both roles own operational flags (merged / did_not_meet)
CREATE POLICY "week_status_ops" ON public.service_center_week_status
  FOR ALL
  USING  ((auth.jwt() ->> 'user_role') IN ('super_admin', 'regional_secretary'))
  WITH CHECK ((auth.jwt() ->> 'user_role') IN ('super_admin', 'regional_secretary'));

-- service_role bypass was missing from the original schema — add it
CREATE POLICY "week_status_service_role" ON public.service_center_week_status
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ── report_recipients ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "recipients_admin" ON public.report_recipients;

-- SELECT: both roles can read the recipient list
CREATE POLICY "recipients_select" ON public.report_recipients
  FOR SELECT
  USING ((auth.jwt() ->> 'user_role') IN ('super_admin', 'regional_secretary'));

-- INSERT / UPDATE / DELETE: super_admin only (recipient management is admin-only)
CREATE POLICY "recipients_insert" ON public.report_recipients
  FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'super_admin');

CREATE POLICY "recipients_update" ON public.report_recipients
  FOR UPDATE
  USING  ((auth.jwt() ->> 'user_role') = 'super_admin')
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'super_admin');

CREATE POLICY "recipients_delete" ON public.report_recipients
  FOR DELETE
  USING ((auth.jwt() ->> 'user_role') = 'super_admin');

-- service_role bypass was missing from the original schema — add it
CREATE POLICY "recipients_service_role" ON public.report_recipients
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ── fill_center_gaps — add explicit role guard ────────────────────────────────
-- The function is SECURITY DEFINER; without an in-body role check any
-- authenticated user can call it.  The GRANT EXECUTE TO authenticated from
-- migration 20270804000049 remains, but the function now rejects callers who
-- are not super_admin or regional_secretary.

CREATE OR REPLACE FUNCTION public.fill_center_gaps(
  p_from      date,
  p_to        date,
  p_unit_ids  text[] DEFAULT NULL
)
RETURNS TABLE(created_count int, centers_affected int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created  int;
  v_centers  int;
BEGIN
  -- Explicit role check: SECURITY DEFINER bypasses RLS so we must guard here
  IF current_user_role() NOT IN ('super_admin', 'regional_secretary') THEN
    RAISE EXCEPTION 'permission denied for fill_center_gaps'
      USING errcode = '42501';
  END IF;

  WITH
  week_spine AS (
    SELECT gs::date AS week_start
    FROM generate_series(
      DATE_TRUNC('week', p_from::timestamp)::date,
      DATE_TRUNC('week', LEAST(p_to, CURRENT_DATE - 1)::timestamp)::date,
      '7 days'::interval
    ) gs
  ),
  target_centers AS (
    SELECT id AS schedule_id, church_unit_id
    FROM service_center_schedule
    WHERE
      CASE
        WHEN p_unit_ids IS NOT NULL THEN church_unit_id = ANY(p_unit_ids)
        ELSE active = false
      END
  ),
  gaps AS (
    SELECT tc.schedule_id, ws.week_start
    FROM target_centers tc
    CROSS JOIN week_spine ws
    WHERE NOT EXISTS (
      SELECT 1 FROM service_reports sr
      WHERE sr.church_unit_id = tc.church_unit_id
        AND DATE_TRUNC('week', sr.service_date::timestamp)::date = ws.week_start
    )
    AND NOT EXISTS (
      SELECT 1 FROM service_center_week_status scws
      WHERE scws.schedule_id     = tc.schedule_id
        AND scws.week_start_date = ws.week_start
    )
  ),
  inserted AS (
    INSERT INTO service_center_week_status (schedule_id, week_start_date, status)
    SELECT schedule_id, week_start, 'did_not_meet'
    FROM gaps
    ON CONFLICT (schedule_id, week_start_date) DO NOTHING
    RETURNING schedule_id
  )
  SELECT COUNT(*)::int, COUNT(DISTINCT schedule_id)::int
  INTO v_created, v_centers
  FROM inserted;

  RETURN QUERY SELECT v_created, v_centers;
END;
$$;
