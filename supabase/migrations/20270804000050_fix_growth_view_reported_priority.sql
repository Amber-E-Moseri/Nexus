-- Growth Tracking — fix status priority in weekly aggregation view
-- Problem: fill_center_gaps pre-populates 'did_not_meet' flags for inactive centers.
-- If a service is later submitted and synced, actual data should win over the flag.
-- Fix: check for report data first; manual flags only apply when no data exists.

CREATE OR REPLACE VIEW public.v_service_center_weekly_growth
WITH (security_invoker = on)
AS
WITH
week_spine AS (
  SELECT generate_series(
    COALESCE(
      (SELECT DATE_TRUNC('week', MIN(service_date))::date FROM public.service_reports),
      DATE_TRUNC('week', CURRENT_DATE)::date
    ),
    DATE_TRUNC('week', CURRENT_DATE)::date,
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
      WHEN wd.total_attendance IS NOT NULL                            THEN 'reported'
      WHEN ws.status IS NOT NULL                                      THEN ws.status
      WHEN cw.week_start < DATE_TRUNC('week', CURRENT_DATE)::date    THEN 'missing'
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
  total_attendance - LAG(total_attendance) OVER w       AS wow_delta,
  ROUND(AVG(total_attendance) OVER (
    PARTITION BY church_unit_id
    ORDER BY week_start_date
    ROWS BETWEEN 3 PRECEDING AND CURRENT ROW
  ), 1)                                                 AS rolling_avg_4wk
FROM base
WINDOW w AS (PARTITION BY church_unit_id ORDER BY week_start_date)
ORDER BY church_name, week_start_date;

GRANT SELECT ON public.v_service_center_weekly_growth TO authenticated;
