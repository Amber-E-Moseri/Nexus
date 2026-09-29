-- PHASE 4 follow-up: Scope get_public_registration_data by event_config_id.
--
-- The previous version (20270807000003) joined working_list, registrations, and
-- event_payments by email alone, without filtering by event_config_id. After the
-- backfill and NOT NULL enforcement, all rows carry explicit ownership. This version
-- scopes the query to the event that owns the share token being presented.
--
-- APPROACH: Resolve the event config whose public_token_key matches the stored token,
-- then scope all three data tables to that event's records only.

-- Drop first so we can change the return type (PostgreSQL won't allow
-- CREATE OR REPLACE when OUT-parameter signatures differ).
DROP FUNCTION IF EXISTS public.get_public_registration_data(text);

CREATE OR REPLACE FUNCTION public.get_public_registration_data(p_token text)
RETURNS TABLE (
  row_num             bigint,
  full_name           text,
  subgroup            text,
  fellowship          text,
  registration_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_key  text;
  v_raw        jsonb;
  v_token      text;
  v_event_id   uuid;
BEGIN
  -- Find which event config owns a share token whose value matches p_token.
  -- We iterate all event configs (only a handful exist) to find the matching one.
  SELECT ec.id, rc.key
    INTO v_event_id, v_token_key
    FROM public.event_configs ec
    JOIN public.registration_config rc
      ON rc.key = ec.public_token_key
   WHERE trim(both '"' from rc.value::text) = p_token
   LIMIT 1;

  -- Fallback: try the legacy tii2_public_token key directly (pre-event_configs configs)
  IF v_event_id IS NULL THEN
    SELECT value INTO v_raw
      FROM public.registration_config
     WHERE key = 'tii2_public_token'
     LIMIT 1;

    IF v_raw IS NOT NULL AND trim(both '"' from v_raw::text) = p_token THEN
      SELECT id INTO v_event_id
        FROM public.event_configs
       WHERE is_active = true
       LIMIT 1;
    END IF;
  END IF;

  -- Token did not match any event
  IF v_event_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    row_number() OVER (ORDER BY COALESCE(combined.full_name, '')) AS row_num,
    combined.full_name,
    combined.subgroup,
    combined.fellowship,
    combined.registration_status
  FROM (
    -- Primary: everyone on this event's working list
    SELECT
      COALESCE(r.full_name,  wl.full_name,  '') AS full_name,
      COALESCE(r.subgroup,   wl.subgroup,   '') AS subgroup,
      COALESCE(r.fellowship, wl.fellowship, '') AS fellowship,
      CASE
        WHEN r.email IS NULL THEN 'not_registered'
        WHEN ep.amount_paid IS NOT NULL
         AND (ep.amount_paid::numeric) > 0
         AND (ep.amount_paid::numeric) >= (ep.amount_expected::numeric)
          THEN 'confirmed'
        ELSE 'registered_outstanding'
      END AS registration_status
    FROM public.working_list wl
    LEFT JOIN public.registrations  r  ON lower(wl.email) = lower(r.email)
                                      AND r.event_config_id  = v_event_id
    LEFT JOIN public.event_payments ep ON lower(wl.email) = lower(ep.email)
                                      AND ep.event_config_id = v_event_id
    WHERE wl.event_config_id = v_event_id

    UNION ALL

    -- Gap-fill: registrants not on the working list
    SELECT
      COALESCE(r.full_name, '') AS full_name,
      COALESCE(r.subgroup,  '') AS subgroup,
      COALESCE(r.fellowship,'') AS fellowship,
      CASE
        WHEN ep.amount_paid IS NOT NULL
         AND (ep.amount_paid::numeric) > 0
         AND (ep.amount_paid::numeric) >= (ep.amount_expected::numeric)
          THEN 'confirmed'
        ELSE 'registered_outstanding'
      END AS registration_status
    FROM public.registrations r
    LEFT JOIN public.event_payments ep ON lower(r.email) = lower(ep.email)
                                      AND ep.event_config_id = v_event_id
    WHERE r.event_config_id = v_event_id
      AND NOT EXISTS (
        SELECT 1 FROM public.working_list wl
         WHERE lower(wl.email) = lower(r.email)
           AND wl.event_config_id = v_event_id
      )
  ) combined
  ORDER BY COALESCE(combined.full_name, '');
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_registration_data(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
