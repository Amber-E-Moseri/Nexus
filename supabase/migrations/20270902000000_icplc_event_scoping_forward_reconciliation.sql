-- ICPLC Event Scoping: Forward-only reconciliation for production
--
-- CONTEXT: This Is It 2.0 (TII) and ICPLC are separate event systems. Before
-- this migration, registration-domain tables (registrations, working_list, roster,
-- event_payments) were shared global pools with no event ownership. This migration
-- brings production schema to event-scoped state expected by current locked V1 code.
--
-- DESIGN: Forward-only. Does not execute old local migrations. Determined from
-- verified production facts: event_configs already exist with explicit TII and
-- ICPLC IDs. Legacy NULL rows belong to TII. New rows must carry event_config_id.
--
-- GUARD: registrations, working_list, roster managed by external Apps Script sync

-- GATE 1: ADD EVENT_CONFIG_ID COLUMNS SAFELY (guarded per table)

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'registrations' AND relnamespace = 'public'::regnamespace) THEN
    EXECUTE 'ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS event_config_id uuid REFERENCES public.event_configs(id) ON DELETE SET NULL';
  ELSE
    RAISE NOTICE 'Skipping registrations event_config_id: table not yet created';
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'working_list' AND relnamespace = 'public'::regnamespace) THEN
    EXECUTE 'ALTER TABLE public.working_list ADD COLUMN IF NOT EXISTS event_config_id uuid REFERENCES public.event_configs(id) ON DELETE SET NULL';
  ELSE
    RAISE NOTICE 'Skipping working_list event_config_id: table not yet created';
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'roster' AND relnamespace = 'public'::regnamespace) THEN
    EXECUTE 'ALTER TABLE public.roster ADD COLUMN IF NOT EXISTS event_config_id uuid REFERENCES public.event_configs(id) ON DELETE SET NULL';
  ELSE
    RAISE NOTICE 'Skipping roster event_config_id: table not yet created';
  END IF;
END;
$$;

ALTER TABLE public.event_payments
  ADD COLUMN IF NOT EXISTS event_config_id uuid
    REFERENCES public.event_configs(id) ON DELETE SET NULL;

-- GATE 2: CREATE INDEXES (guarded per table)

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'registrations' AND relnamespace = 'public'::regnamespace) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_registrations_event_config_id ON public.registrations (event_config_id)';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'working_list' AND relnamespace = 'public'::regnamespace) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_working_list_event_config_id ON public.working_list (event_config_id)';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'roster' AND relnamespace = 'public'::regnamespace) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_roster_event_config_id ON public.roster (event_config_id)';
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_event_payments_event_config_id
  ON public.event_payments (event_config_id);

-- GATE 3-6: BACKFILL + SAFETY (only runs if all tables + event_configs data exist)

DO $$
DECLARE
  v_tii_id       uuid;
  v_icplc_id     uuid;
  v_tii_name     text;
  v_icplc_name   text;
  v_ambiguous    integer;

  total_reg      bigint; null_reg      bigint;
  total_wl       bigint; null_wl       bigint;
  total_roster   bigint; null_roster   bigint;
  total_pay      bigint; null_pay      bigint;

  r_reg_updated  bigint := 0;
  r_wl_updated   bigint := 0;
  r_roster_updated bigint := 0;
  r_pay_updated  bigint := 0;
BEGIN

  -- Skip if external tables don't exist (fresh install)
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'registrations' AND relnamespace = 'public'::regnamespace) THEN
    RAISE NOTICE 'Skipping event scoping backfill: registrations not yet created';
    RETURN;
  END IF;

  -- Identify TII by known verified UUID
  v_tii_id := '6c68fd1b-04ea-4b2d-9bba-d2b4307a83c1'::uuid;

  SELECT event_name INTO v_tii_name FROM public.event_configs WHERE id = v_tii_id;
  IF v_tii_name IS NULL THEN
    RAISE NOTICE 'Skipping event scoping backfill: TII event_config not found — fresh install';
    RETURN;
  END IF;

  RAISE NOTICE 'Identified TII event: id=%, name="%"', v_tii_id, v_tii_name;

  -- Identify ICPLC by known verified UUID
  v_icplc_id := '37db5b0d-6651-4fc6-8ffb-f4f81c9139e4'::uuid;

  SELECT event_name INTO v_icplc_name FROM public.event_configs WHERE id = v_icplc_id;
  IF v_icplc_name IS NULL THEN
    RAISE NOTICE 'Skipping event scoping backfill: ICPLC event_config not found — fresh install';
    RETURN;
  END IF;

  RAISE NOTICE 'Identified ICPLC event: id=%, name="%"', v_icplc_id, v_icplc_name;

  -- Verify no ambiguous TII or ICPLC events
  SELECT count(*) INTO v_ambiguous
    FROM public.event_configs
   WHERE (event_name ILIKE '%This Is It%' OR event_name ILIKE '%TII%')
     AND id != v_tii_id;

  IF v_ambiguous > 0 THEN
    RAISE EXCEPTION 'Ambiguous TII event_configs: % non-canonical rows match TII-like names — cannot safely backfill; manual review required', v_ambiguous;
  END IF;

  SELECT count(*) INTO v_ambiguous
    FROM public.event_configs
   WHERE (event_name ILIKE '%ICPLC%')
     AND id != v_icplc_id;

  IF v_ambiguous > 0 THEN
    RAISE EXCEPTION 'Ambiguous ICPLC event_configs: % non-canonical rows match ICPLC names — cannot safely backfill; manual review required', v_ambiguous;
  END IF;

  -- GATE 4: PRE-BACKFILL AUDIT

  SELECT count(*), count(*) FILTER (WHERE event_config_id IS NULL)
    INTO total_reg, null_reg FROM public.registrations;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'working_list' AND relnamespace = 'public'::regnamespace) THEN
    EXECUTE 'SELECT count(*), count(*) FILTER (WHERE event_config_id IS NULL) FROM public.working_list' INTO total_wl, null_wl;
  ELSE
    total_wl := 0; null_wl := 0;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'roster' AND relnamespace = 'public'::regnamespace) THEN
    EXECUTE 'SELECT count(*), count(*) FILTER (WHERE event_config_id IS NULL) FROM public.roster' INTO total_roster, null_roster;
  ELSE
    total_roster := 0; null_roster := 0;
  END IF;
  SELECT count(*), count(*) FILTER (WHERE event_config_id IS NULL)
    INTO total_pay, null_pay FROM public.event_payments;

  RAISE NOTICE 'Pre-backfill audit:';
  RAISE NOTICE '  registrations : total=%, null=%', total_reg, null_reg;
  RAISE NOTICE '  working_list  : total=%, null=%', total_wl, null_wl;
  RAISE NOTICE '  roster        : total=%, null=%', total_roster, null_roster;
  RAISE NOTICE '  event_payments: total=%, null=%', total_pay, null_pay;

  -- GATE 5: BACKFILL NULLS TO TII (idempotent)

  UPDATE public.registrations   SET event_config_id = v_tii_id WHERE event_config_id IS NULL;
  GET DIAGNOSTICS r_reg_updated = ROW_COUNT;

  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'working_list' AND relnamespace = 'public'::regnamespace) THEN
    EXECUTE 'UPDATE public.working_list SET event_config_id = $1 WHERE event_config_id IS NULL' USING v_tii_id;
    GET DIAGNOSTICS r_wl_updated = ROW_COUNT;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'roster' AND relnamespace = 'public'::regnamespace) THEN
    EXECUTE 'UPDATE public.roster SET event_config_id = $1 WHERE event_config_id IS NULL' USING v_tii_id;
    GET DIAGNOSTICS r_roster_updated = ROW_COUNT;
  END IF;

  UPDATE public.event_payments  SET event_config_id = v_tii_id WHERE event_config_id IS NULL;
  GET DIAGNOSTICS r_pay_updated = ROW_COUNT;

  RAISE NOTICE 'Backfill complete: registrations=%, working_list=%, roster=%, event_payments=%',
    r_reg_updated, r_wl_updated, r_roster_updated, r_pay_updated;

  -- POST-BACKFILL SAFETY ASSERTIONS: verify no unexpected NULL event_config_id remains

  -- registrations: always present at this point (returned early if absent)
  SELECT count(*) INTO null_reg FROM public.registrations WHERE event_config_id IS NULL;
  IF null_reg > 0 THEN
    RAISE EXCEPTION 'Post-backfill invariant violated: % registrations rows have NULL event_config_id', null_reg;
  END IF;
  RAISE NOTICE 'Post-backfill assertion PASS: registrations 0 NULL event_config_id';

  -- working_list: table-guarded
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'working_list' AND relnamespace = 'public'::regnamespace) THEN
    EXECUTE 'SELECT count(*) FROM public.working_list WHERE event_config_id IS NULL' INTO null_wl;
    IF null_wl > 0 THEN
      RAISE EXCEPTION 'Post-backfill invariant violated: % working_list rows have NULL event_config_id', null_wl;
    END IF;
    RAISE NOTICE 'Post-backfill assertion PASS: working_list 0 NULL event_config_id';
  END IF;

  -- roster: table-guarded
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'roster' AND relnamespace = 'public'::regnamespace) THEN
    EXECUTE 'SELECT count(*) FROM public.roster WHERE event_config_id IS NULL' INTO null_roster;
    IF null_roster > 0 THEN
      RAISE EXCEPTION 'Post-backfill invariant violated: % roster rows have NULL event_config_id', null_roster;
    END IF;
    RAISE NOTICE 'Post-backfill assertion PASS: roster 0 NULL event_config_id';
  END IF;

  -- event_payments: always present (unconditional ALTER TABLE above)
  SELECT count(*) INTO null_pay FROM public.event_payments WHERE event_config_id IS NULL;
  IF null_pay > 0 THEN
    RAISE EXCEPTION 'Post-backfill invariant violated: % event_payments rows have NULL event_config_id', null_pay;
  END IF;
  RAISE NOTICE 'Post-backfill assertion PASS: event_payments 0 NULL event_config_id';

END $$;

-- GATE 7: ENFORCE NOT NULL (guarded per table)

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'registrations' AND relnamespace = 'public'::regnamespace)
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='registrations' AND column_name='event_config_id') THEN
    IF NOT EXISTS (SELECT 1 FROM public.registrations WHERE event_config_id IS NULL) THEN
      EXECUTE 'ALTER TABLE public.registrations ALTER COLUMN event_config_id SET NOT NULL';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'working_list' AND relnamespace = 'public'::regnamespace)
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='working_list' AND column_name='event_config_id') THEN
    IF NOT EXISTS (SELECT 1 FROM public.working_list WHERE event_config_id IS NULL) THEN
      EXECUTE 'ALTER TABLE public.working_list ALTER COLUMN event_config_id SET NOT NULL';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'roster' AND relnamespace = 'public'::regnamespace)
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='roster' AND column_name='event_config_id') THEN
    IF NOT EXISTS (SELECT 1 FROM public.roster WHERE event_config_id IS NULL) THEN
      EXECUTE 'ALTER TABLE public.roster ALTER COLUMN event_config_id SET NOT NULL';
    END IF;
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='event_payments' AND column_name='event_config_id') THEN
    IF NOT EXISTS (SELECT 1 FROM public.event_payments WHERE event_config_id IS NULL) THEN
      ALTER TABLE public.event_payments ALTER COLUMN event_config_id SET NOT NULL;
    END IF;
  END IF;
END;
$$;

-- GATE 8: UPDATE FK CONSTRAINTS TO ON DELETE RESTRICT (guarded per table)

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'registrations' AND relnamespace = 'public'::regnamespace) THEN
    EXECUTE 'ALTER TABLE public.registrations DROP CONSTRAINT IF EXISTS registrations_event_config_id_fkey';
    EXECUTE 'ALTER TABLE public.registrations ADD CONSTRAINT registrations_event_config_id_fkey FOREIGN KEY (event_config_id) REFERENCES public.event_configs(id) ON DELETE RESTRICT';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'working_list' AND relnamespace = 'public'::regnamespace) THEN
    EXECUTE 'ALTER TABLE public.working_list DROP CONSTRAINT IF EXISTS working_list_event_config_id_fkey';
    EXECUTE 'ALTER TABLE public.working_list ADD CONSTRAINT working_list_event_config_id_fkey FOREIGN KEY (event_config_id) REFERENCES public.event_configs(id) ON DELETE RESTRICT';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'roster' AND relnamespace = 'public'::regnamespace) THEN
    EXECUTE 'ALTER TABLE public.roster DROP CONSTRAINT IF EXISTS roster_event_config_id_fkey';
    EXECUTE 'ALTER TABLE public.roster ADD CONSTRAINT roster_event_config_id_fkey FOREIGN KEY (event_config_id) REFERENCES public.event_configs(id) ON DELETE RESTRICT';
  END IF;
END;
$$;

ALTER TABLE public.event_payments
  DROP CONSTRAINT IF EXISTS event_payments_event_config_id_fkey;
ALTER TABLE public.event_payments
  ADD CONSTRAINT event_payments_event_config_id_fkey
  FOREIGN KEY (event_config_id) REFERENCES public.event_configs(id) ON DELETE RESTRICT;

-- GATE 9: EVENT_PAYMENTS UNIQUENESS — Convert to composite (email, event_config_id)

ALTER TABLE public.event_payments
  DROP CONSTRAINT IF EXISTS event_payments_email_key;

DROP INDEX IF EXISTS public.event_payments_email_unique;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.event_payments'::regclass
      AND conname = 'event_payments_email_event_config_id_key'
  ) THEN
    ALTER TABLE public.event_payments
      ADD CONSTRAINT event_payments_email_event_config_id_key
      UNIQUE (email, event_config_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_event_payments_email
  ON public.event_payments (email);

-- GATE 10: COMMENTS (guarded per table)

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'registrations' AND relnamespace = 'public'::regnamespace) THEN
    EXECUTE $cmt$COMMENT ON TABLE public.registrations IS 'Event-scoped registration records. event_config_id required. NULL email not allowed.'$cmt$;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'working_list' AND relnamespace = 'public'::regnamespace) THEN
    EXECUTE $cmt$COMMENT ON TABLE public.working_list IS 'Event-scoped working list entries. event_config_id required.'$cmt$;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'roster' AND relnamespace = 'public'::regnamespace) THEN
    EXECUTE $cmt$COMMENT ON TABLE public.roster IS 'Event-scoped roster entries. event_config_id required.'$cmt$;
  END IF;
END;
$$;

COMMENT ON TABLE public.event_payments IS
  'Event-scoped payment records. Composite unique(email, event_config_id) prevents duplicates per event.';

-- GATE 11: EVENT-SCOPED PUBLIC RPC — Preserve 6-column contract
-- This function references registrations/working_list/event_payments but is PL/pgSQL
-- so it validates at call time, not creation time.

CREATE OR REPLACE FUNCTION public.get_public_registration_data(p_token text)
RETURNS TABLE (
  row_num              bigint,
  full_name            text,
  subgroup             text,
  fellowship           text,
  registration_status  text,
  manually_confirmed   boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id  uuid;
BEGIN
  SELECT ec.id INTO v_event_id
    FROM public.event_configs ec
    JOIN public.registration_config rc ON rc.key = ec.public_token_key
   WHERE trim(both '"' from rc.value::text) = p_token
   LIMIT 1;

  IF v_event_id IS NULL THEN
    DECLARE
      v_raw jsonb;
    BEGIN
      SELECT value INTO v_raw
        FROM public.registration_config
       WHERE key = 'tii2_public_token'
       LIMIT 1;

      IF v_raw IS NOT NULL AND trim(both '"' from v_raw::text) = p_token THEN
        v_event_id := '6c68fd1b-04ea-4b2d-9bba-d2b4307a83c1'::uuid;
      END IF;
    END;
  END IF;

  IF v_event_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    row_number() OVER (ORDER BY COALESCE(combined.full_name, '')) AS row_num,
    combined.full_name,
    combined.subgroup,
    combined.fellowship,
    combined.registration_status,
    combined.manually_confirmed
  FROM (
    SELECT
      COALESCE(r.full_name,   wl.full_name,   '') AS full_name,
      COALESCE(r.subgroup,    wl.subgroup,    '') AS subgroup,
      COALESCE(r.fellowship,  wl.fellowship,  '') AS fellowship,
      CASE
        WHEN r.email IS NULL THEN 'not_registered'
        WHEN COALESCE(r.manually_confirmed, false) THEN 'confirmed'
        WHEN ep.amount_paid IS NOT NULL
         AND (ep.amount_paid::numeric) > 0
         AND (ep.amount_paid::numeric) >= (ep.amount_expected::numeric)
          THEN 'confirmed'
        ELSE 'registered_outstanding'
      END AS registration_status,
      COALESCE(r.manually_confirmed, false) AS manually_confirmed
    FROM public.working_list wl
    LEFT JOIN public.registrations  r  ON lower(wl.email) = lower(r.email)
                                      AND r.event_config_id  = v_event_id
    LEFT JOIN public.event_payments ep ON lower(wl.email) = lower(ep.email)
                                      AND ep.event_config_id = v_event_id
    WHERE wl.event_config_id = v_event_id

    UNION ALL

    SELECT
      COALESCE(r.full_name, '') AS full_name,
      COALESCE(r.subgroup,  '') AS subgroup,
      COALESCE(r.fellowship,'') AS fellowship,
      CASE
        WHEN COALESCE(r.manually_confirmed, false) THEN 'confirmed'
        WHEN ep.amount_paid IS NOT NULL
         AND (ep.amount_paid::numeric) > 0
         AND (ep.amount_paid::numeric) >= (ep.amount_expected::numeric)
          THEN 'confirmed'
        ELSE 'registered_outstanding'
      END AS registration_status,
      COALESCE(r.manually_confirmed, false) AS manually_confirmed
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

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'registrations' AND relnamespace = 'public'::regnamespace) THEN
    EXECUTE $cmt$COMMENT ON TABLE public.registrations IS 'Event-scoped via migration 20270902000000_icplc_event_scoping_forward_reconciliation.sql'$cmt$;
  END IF;
END;
$$;
