-- RPC functions for TII attendance reporting
-- Builds aggregated reports with per-session and per-subgroup breakdowns

CREATE OR REPLACE FUNCTION public.get_tii_sessions_for_event(event_id_param uuid)
RETURNS TABLE (
  id uuid,
  session_date date,
  session_name text,
  sort_order int,
  active boolean
) LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    ts.id,
    ts.session_date,
    ts.session_name,
    ts.sort_order,
    ts.active
  FROM public.tii_sessions ts
  WHERE ts.event_id = event_id_param
  AND ts.active = true
  ORDER BY ts.sort_order, ts.session_date;
$$;

-- Builds aggregated TII report from attendance records
-- Filters registrations by expected_pool, matches against CMP attendance, calculates stats
CREATE OR REPLACE FUNCTION public.build_tii_report(
  event_id_param uuid,
  expected_pool_filter_param text DEFAULT 'confirmed_registered',
  subgroup_filter_param text[] DEFAULT NULL
)
RETURNS TABLE (
  expected_count int,
  attended_count int,
  absent_count int,
  excused_count int,
  unexpected_count int,
  reach_pct numeric,
  present_names text[],
  absent_names text[],
  excused_names text[],
  unexpected_names text[],
  by_session jsonb,
  by_subgroup jsonb
) LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  v_expected_pool_filter text := expected_pool_filter_param;
  v_subgroup_filter text[] := subgroup_filter_param;
  v_sessions_count int;
  v_expected_count int := 0;
  v_attended_count int := 0;
  v_absent_count int := 0;
  v_excused_count int := 0;
  v_unexpected_count int := 0;
  v_reach_pct numeric;
  v_present_names text[] := '{}';
  v_absent_names text[] := '{}';
  v_excused_names text[] := '{}';
  v_unexpected_names text[] := '{}';
  v_by_session jsonb := '{}'::jsonb;
  v_by_subgroup jsonb := '{}'::jsonb;

  v_expected_set text[];
  v_attended_set text[];
  v_present_set text[];
BEGIN

  -- Get count of sessions
  SELECT COUNT(*) INTO v_sessions_count
  FROM public.tii_sessions
  WHERE event_id = event_id_param AND active = true;

  -- Build expected registrant pool based on filter
  SELECT ARRAY_AGG(LOWER(COALESCE(r.email, r.full_name)))
  INTO v_expected_set
  FROM public.registrations r
  WHERE r.event_id = event_id_param
  AND (
    CASE
      WHEN v_expected_pool_filter = 'confirmed_only' THEN
        r.manually_confirmed = true AND r.confirmed_at IS NOT NULL
      WHEN v_expected_pool_filter = 'confirmed_registered' THEN
        r.submitted_at IS NOT NULL -- Any registered person
      WHEN v_expected_pool_filter = 'registered_only' THEN
        r.submitted_at IS NOT NULL
      ELSE r.submitted_at IS NOT NULL
    END
  )
  AND (v_subgroup_filter IS NULL OR r.subgroup = ANY(v_subgroup_filter));

  v_expected_set := COALESCE(v_expected_set, '{}');
  v_expected_count := ARRAY_LENGTH(v_expected_set, 1);

  -- Get all attendees from CMP (tii_attendance records)
  SELECT ARRAY_AGG(DISTINCT LOWER(COALESCE(ta.email, ta.full_name)))
  INTO v_attended_set
  FROM public.tii_attendance ta
  JOIN public.tii_sessions ts ON ts.id = ta.session_id
  WHERE ts.event_id = event_id_param AND ts.active = true;

  v_attended_set := COALESCE(v_attended_set, '{}');
  v_attended_count := ARRAY_LENGTH(v_attended_set, 1);

  -- Calculate present (intersection of expected and attended)
  SELECT ARRAY_AGG(name)
  INTO v_present_set
  FROM (
    SELECT UNNEST(v_expected_set) AS name
    WHERE UNNEST(v_expected_set) = ANY(v_attended_set)
  ) sub;

  v_present_set := COALESCE(v_present_set, '{}');

  -- Calculate absent
  v_absent_count := ARRAY_LENGTH(v_expected_set, 1) - ARRAY_LENGTH(v_present_set, 1);
  v_present_names := v_present_set;
  v_absent_names := (
    SELECT ARRAY_AGG(name)
    FROM (
      SELECT UNNEST(v_expected_set) AS name
      WHERE NOT (UNNEST(v_expected_set) = ANY(v_present_set))
    ) sub
  );

  -- Calculate unexpected (attended but not expected)
  v_unexpected_count := 0;
  v_unexpected_names := (
    SELECT ARRAY_AGG(name)
    FROM (
      SELECT UNNEST(v_attended_set) AS name
      WHERE NOT (UNNEST(v_attended_set) = ANY(v_expected_set))
    ) sub
  );

  v_unexpected_count := ARRAY_LENGTH(v_unexpected_names, 1);

  -- Calculate reach percentage
  IF v_expected_count > 0 THEN
    v_reach_pct := (ARRAY_LENGTH(v_present_set, 1)::numeric / v_expected_count::numeric * 100)::numeric(5, 2);
  ELSE
    v_reach_pct := 0;
  END IF;

  -- Build per-session breakdown
  WITH session_data AS (
    SELECT
      ts.id,
      ts.session_name,
      ts.session_date,
      COUNT(DISTINCT ta.id) FILTER (WHERE ta.status = 'present')::int AS present_count,
      COUNT(DISTINCT ta.id) FILTER (WHERE ta.status = 'absent')::int AS absent_count,
      COUNT(DISTINCT ta.id) FILTER (WHERE ta.status = 'excused')::int AS excused_count
    FROM public.tii_sessions ts
    LEFT JOIN public.tii_attendance ta ON ta.session_id = ts.id
    WHERE ts.event_id = event_id_param AND ts.active = true
    GROUP BY ts.id, ts.session_name, ts.session_date
  )
  SELECT jsonb_object_agg(
    sd.id::text,
    jsonb_build_object(
      'session_name', sd.session_name,
      'session_date', sd.session_date,
      'expected', v_expected_count,
      'present', sd.present_count,
      'absent', sd.absent_count,
      'excused', sd.excused_count,
      'reach_pct', CASE
        WHEN v_expected_count > 0 THEN (sd.present_count::numeric / v_expected_count::numeric * 100)::numeric(5,2)
        ELSE 0
      END
    )
  )
  INTO v_by_session
  FROM session_data sd;

  v_by_session := COALESCE(v_by_session, '{}'::jsonb);

  -- Build per-subgroup breakdown
  WITH subgroup_data AS (
    SELECT
      r.subgroup,
      COUNT(DISTINCT r.id) AS expected,
      COUNT(DISTINCT ta.id) FILTER (
        WHERE LOWER(COALESCE(ta.email, ta.full_name)) = LOWER(COALESCE(r.email, r.full_name))
      )::int AS present
    FROM public.registrations r
    LEFT JOIN public.tii_attendance ta ON LOWER(COALESCE(ta.email, ta.full_name)) = LOWER(COALESCE(r.email, r.full_name))
    WHERE r.event_id = event_id_param
    AND (
      CASE
        WHEN v_expected_pool_filter = 'confirmed_only' THEN
          r.manually_confirmed = true AND r.confirmed_at IS NOT NULL
        WHEN v_expected_pool_filter = 'confirmed_registered' THEN
          r.submitted_at IS NOT NULL
        ELSE r.submitted_at IS NOT NULL
      END
    )
    AND (v_subgroup_filter IS NULL OR r.subgroup = ANY(v_subgroup_filter))
    GROUP BY r.subgroup
  )
  SELECT jsonb_object_agg(
    sd.subgroup,
    jsonb_build_object(
      'expected', sd.expected,
      'present', sd.present,
      'absent', sd.expected - sd.present,
      'reach_pct', CASE
        WHEN sd.expected > 0 THEN (sd.present::numeric / sd.expected::numeric * 100)::numeric(5,2)
        ELSE 0
      END
    )
  )
  INTO v_by_subgroup
  FROM subgroup_data sd;

  v_by_subgroup := COALESCE(v_by_subgroup, '{}'::jsonb);

  -- Return aggregated report
  RETURN QUERY SELECT
    v_expected_count,
    v_attended_count,
    v_absent_count,
    v_excused_count,
    v_unexpected_count,
    v_reach_pct,
    v_present_names,
    v_absent_names,
    v_excused_names,
    v_unexpected_names,
    v_by_session,
    v_by_subgroup;

END;
$$;

-- Function to sync TII attendance from CMP CSV data
-- Idempotent: uses cmp_attendance_id to prevent duplicates
CREATE OR REPLACE FUNCTION public.sync_tii_attendance_from_cmp(
  session_id_param uuid,
  attendance_records jsonb
)
RETURNS TABLE (
  inserted_count int,
  updated_count int,
  skipped_count int
) LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_record jsonb;
  v_inserted int := 0;
  v_updated int := 0;
  v_skipped int := 0;
  v_full_name text;
  v_email text;
  v_cmp_id text;
  v_registration_id uuid;
BEGIN

  FOREACH v_record IN ARRAY ARRAY(SELECT jsonb_array_elements(attendance_records))
  LOOP
    v_full_name := v_record->>'full_name';
    v_email := v_record->>'email';
    v_cmp_id := v_record->>'cmp_id';

    -- Skip if no name
    IF v_full_name IS NULL OR v_full_name = '' THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Try to match to registration by email first, then name
    SELECT r.id INTO v_registration_id
    FROM public.registrations r
    WHERE (
      (v_email IS NOT NULL AND LOWER(r.email) = LOWER(v_email))
      OR (LOWER(r.full_name) = LOWER(v_full_name))
    )
    LIMIT 1;

    -- Upsert attendance record
    INSERT INTO public.tii_attendance (
      session_id,
      registration_id,
      full_name,
      email,
      status,
      cmp_attendance_id,
      created_by
    ) VALUES (
      session_id_param,
      v_registration_id,
      v_full_name,
      v_email,
      'present',
      v_cmp_id,
      auth.uid()
    )
    ON CONFLICT (session_id, cmp_attendance_id)
    DO UPDATE SET
      status = 'present',
      updated_at = now()
    WHERE tii_attendance.cmp_attendance_id = v_cmp_id;

    IF FOUND THEN
      v_updated := v_updated + 1;
    ELSE
      v_inserted := v_inserted + 1;
    END IF;

  END LOOP;

  RETURN QUERY SELECT v_inserted, v_updated, v_skipped;
END;
$$;

COMMENT ON FUNCTION public.build_tii_report IS
  'Aggregates TII attendance data into summary statistics, per-session, and per-subgroup breakdowns';
COMMENT ON FUNCTION public.sync_tii_attendance_from_cmp IS
  'Syncs attendance from CMP CSV data into tii_attendance table (idempotent via cmp_attendance_id)';
