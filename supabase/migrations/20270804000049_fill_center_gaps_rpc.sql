-- Growth Tracking — fill_center_gaps RPC
-- Creates 'did_not_meet' entries for weeks with no report data.
-- p_unit_ids = NULL  → targets all currently-inactive centers (manual backfill UI)
-- p_unit_ids = [...]  → targets those specific centers regardless of active state
--   (used by growth-reports-sync when auto-reactivating a center — fills the gap
--    period before flipping active=true so those weeks show as did_not_meet, not missing)

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

GRANT EXECUTE ON FUNCTION public.fill_center_gaps(date, date, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fill_center_gaps(date, date, text[]) TO service_role;
