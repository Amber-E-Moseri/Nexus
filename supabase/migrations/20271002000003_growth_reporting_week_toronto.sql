-- Growth week-semantics correctness (Stream G): ONE reporting-week definition, in Toronto time.
--
-- DEFECT (proven 2026-10-01 against the live view / weekly-growth-report logic):
--   v_service_center_weekly_growth and weekly-growth-report derived "this week" from the UTC date.
--   Sunday evening ET is already Monday UTC (8 PM ET in EDT, 7 PM ET in EST), so at the scheduled
--   Sunday 8:50 PM sync / 9:00 PM report and the Monday 9:00 AM catch-up the code resolved to the
--   FOLLOWING (empty) week: the email/PDF reported 0 of N and the Growth page defaulted to an empty
--   new week.
--
-- PRODUCT DEFINITION (decided 2026-10-01)
--   The Growth reporting period is determined in America/Toronto operational time.
--   growth_reporting_week(t) = the Monday of the latest SUNDAY on or before the Toronto date of t.
--     Sun 2026-10-04 (any time, incl. 8:49 PM and 11:59 PM ET)  -> 2026-09-28
--     Mon 2026-10-05 (00:00 ET, 9:00 AM ET)                     -> 2026-09-28   (catch-up is the same week)
--     Thu 2026-10-01                                             -> 2026-09-21   (last completed reporting week)
--     Sun 2026-10-11 00:00 ET                                    -> 2026-10-05
--   The reporting week rolls over at Sunday 00:00 Toronto time (DST-safe: it is a Toronto calendar date).
--
-- ONE SOURCE OF TRUTH: the view, the weekly report function, the Growth page default, the ?week= link,
-- and (later) the PWA/in-app status all call these SQL functions; JS never recomputes the week or the counts.
--
-- COUNTS: growth_week_summary() is the canonical completeness source (same rows the page lists).
--   expected    = every ACTIVE center for the week          (page's "Y")
--   received    = status 'reported'                          (page's "X")
--   missing     = status 'missing'   (no report, no flag, week already ended in Toronto time)
--   pending     = status 'current'   (no report, no flag, week not yet ended)
--   flagged     = status merged | did_not_meet               (manual flags: expected, but not outstanding)
--   outstanding = missing + pending = centers with no report AND no flag. NOT expected - received.
--   Example (live week 2026-09-07): expected 11, received 7, missing 3, flagged 1 -> outstanding 3, not 4.
--
-- The view keeps the LIVE definition (manual flag wins, then reported, then missing/current) and only
-- changes the date source. No existing migration is modified.

-- ── Toronto date / reporting week ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.growth_toronto_date(p_at timestamptz DEFAULT now())
RETURNS date
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT (p_at AT TIME ZONE 'America/Toronto')::date
$$;

-- Monday of the ISO week containing p_date (null-safe; accepts any date, e.g. a ?week= value).
CREATE OR REPLACE FUNCTION public.growth_week_start(p_date date)
RETURNS date
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT (p_date - ((EXTRACT(isodow FROM p_date)::int) - 1))
$$;

CREATE OR REPLACE FUNCTION public.growth_reporting_week(p_at timestamptz DEFAULT now())
RETURNS date
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = public
AS $$
  -- latest Sunday on/before the Toronto date, minus 6 days = that week's Monday
  SELECT d - (EXTRACT(dow FROM d)::int) - 6
  FROM (SELECT public.growth_toronto_date(p_at) AS d) x
$$;

-- ── View: same live definition, Toronto date instead of UTC CURRENT_DATE ──────
CREATE OR REPLACE VIEW public.v_service_center_weekly_growth
WITH (security_invoker = on)
AS
WITH
week_spine AS (
  SELECT generate_series(
    COALESCE(
      (SELECT DATE_TRUNC('week', MIN(service_date))::date FROM public.service_reports),
      public.growth_week_start(public.growth_toronto_date())
    ),
    public.growth_week_start(public.growth_toronto_date()),
    '1 week'::interval
  )::date AS week_start
),
active_centers AS (
  SELECT id AS schedule_id, church_name, church_unit_id
  FROM public.service_center_schedule
  WHERE active = true
),
center_weeks AS (
  SELECT ac.schedule_id, ac.church_name, ac.church_unit_id, ws.week_start
  FROM active_centers ac
  CROSS JOIN week_spine ws
),
weekly_data AS (
  SELECT
    church_unit_id,
    DATE_TRUNC('week', service_date)::date AS week_start,
    SUM(total_attendance)::integer          AS total_attendance,
    SUM(first_timers)::integer              AS first_timers
  FROM public.service_reports
  GROUP BY church_unit_id, DATE_TRUNC('week', service_date)::date
),
base AS (
  SELECT
    cw.schedule_id,
    cw.church_name,
    cw.church_unit_id,
    cw.week_start                                                    AS week_start_date,
    COALESCE(wd.total_attendance, 0)::integer                        AS total_attendance,
    COALESCE(wd.first_timers, 0)::integer                            AS first_timers,
    CASE
      WHEN ws.status IS NOT NULL                                      THEN ws.status
      WHEN wd.total_attendance IS NOT NULL                            THEN 'reported'
      WHEN cw.week_start < public.growth_week_start(public.growth_toronto_date()) THEN 'missing'
      ELSE 'current'
    END                                                              AS status,
    ws.merged_with,
    ws.note,
    ws.set_by,
    ws.set_at
  FROM center_weeks cw
  LEFT JOIN weekly_data wd
    ON  wd.church_unit_id = cw.church_unit_id
    AND wd.week_start     = cw.week_start
  LEFT JOIN public.service_center_week_status ws
    ON  ws.schedule_id     = cw.schedule_id
    AND ws.week_start_date = cw.week_start
)
SELECT
  schedule_id,
  church_name,
  church_unit_id,
  week_start_date,
  total_attendance,
  first_timers,
  status,
  merged_with,
  note,
  set_by,
  set_at,
  LAG(total_attendance) OVER w                          AS prev_week_attendance,
  CASE
    WHEN status = 'reported' AND LAG(status) OVER w = 'reported'
      THEN total_attendance - LAG(total_attendance) OVER w
    ELSE NULL::integer
  END                                                   AS wow_delta,
  ROUND(AVG(total_attendance) OVER (
    PARTITION BY church_unit_id
    ORDER BY week_start_date
    ROWS BETWEEN 3 PRECEDING AND CURRENT ROW
  ), 1)                                                 AS rolling_avg_4wk
FROM base
WINDOW w AS (PARTITION BY church_unit_id ORDER BY week_start_date)
ORDER BY church_name, week_start_date;

GRANT SELECT ON public.v_service_center_weekly_growth TO authenticated;

-- ── Canonical completeness counts ─────────────────────────────────────────────
-- SECURITY INVOKER: the underlying view is security_invoker, so RLS (super_admin /
-- regional_secretary, plus service_role) still decides who can see anything.
CREATE OR REPLACE FUNCTION public.growth_week_summary(p_week date DEFAULT NULL)
RETURNS TABLE (
  week_start  date,
  expected    integer,
  received    integer,
  missing     integer,
  pending     integer,
  flagged     integer,
  outstanding integer,
  is_closed   boolean
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH w AS (
    SELECT public.growth_week_start(COALESCE(p_week, public.growth_reporting_week())) AS ws
  )
  SELECT
    w.ws,
    COUNT(v.status)::int,
    (COUNT(*) FILTER (WHERE v.status = 'reported'))::int,
    (COUNT(*) FILTER (WHERE v.status = 'missing'))::int,
    (COUNT(*) FILTER (WHERE v.status = 'current'))::int,
    (COUNT(*) FILTER (WHERE v.status IN ('merged', 'did_not_meet')))::int,
    (COUNT(*) FILTER (WHERE v.status IN ('missing', 'current')))::int,
    (public.growth_toronto_date() >= w.ws + 7)
  FROM w
  LEFT JOIN public.v_service_center_weekly_growth v ON v.week_start_date = w.ws
  GROUP BY w.ws
$$;

REVOKE ALL ON FUNCTION public.growth_toronto_date(timestamptz)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.growth_week_start(date)           FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.growth_reporting_week(timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.growth_week_summary(date)         FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.growth_toronto_date(timestamptz)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.growth_week_start(date)            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.growth_reporting_week(timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.growth_week_summary(date)          TO authenticated, service_role;

-- ── fill_center_gaps: same Toronto "today" (only the date source changes) ─────
-- Previously CURRENT_DATE - 1 (UTC): on Sunday evening ET that already included the week being reported,
-- so manual gap filling could flag unreported centers as did_not_meet before the week had ended.
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
      DATE_TRUNC('week', LEAST(p_to, public.growth_toronto_date() - 1)::timestamp)::date,
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
