-- PHASE 3: Backfill historical TII 2.0 records with explicit event_config_id.
--
-- CONTEXT: Migration 20260915000001 added event_config_id to the four registration-domain
-- tables but left existing rows at NULL, treating NULL as "This Is It 2.0 historical record".
-- That was an intentional transitional state. This migration closes that gap by writing the
-- explicit TII event_config_id onto every NULL row, eliminating NULL-as-ownership semantics.
--
-- INVARIANT AFTER THIS MIGRATION:
--   event_config_id = <TII uuid>   → This Is It 2.0 record
--   event_config_id = <ICPLC uuid> → ICPLC record
--   event_config_id IS NULL        → invalid (will be prevented by NOT NULL in next migration)
--
-- GUARD: Aborts if the active event_config is not This Is It 2.0 (name contains "This Is It").
-- Never assign records to the wrong event merely to eliminate NULLs.

-- GUARD: all referenced tables created later.
DO $$
DECLARE
  v_tii_id   uuid;
  v_tii_name text;
  r_reg      bigint := 0;
  r_wl       bigint := 0;
  r_roster   bigint := 0;
  r_pay      bigint := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'registrations' AND relnamespace = 'public'::regnamespace) THEN
    RAISE NOTICE 'Skipping backfill: registrations not yet created';
    RETURN;
  END IF;
  -- Identify the active (TII) config
  SELECT id, event_name
    INTO v_tii_id, v_tii_name
    FROM public.event_configs
   WHERE is_active = true
   LIMIT 1;

  IF v_tii_id IS NULL THEN
    RAISE EXCEPTION
      'No active event_config found — cannot identify the TII record set. '
      'Ensure the This Is It 2.0 config is active before running this migration.';
  END IF;

  IF v_tii_name NOT ILIKE '%This Is It%' THEN
    RAISE EXCEPTION
      'Active event_config is "%" — expected a config whose name contains "This Is It". '
      'Review the active config before proceeding.',
      v_tii_name;
  END IF;

  RAISE NOTICE 'Identified TII config: id=%, name="%"', v_tii_id, v_tii_name;

  -- ── Audit before touching anything ──────────────────────────────────────────
  -- (these counts will appear in the migration log)
  DECLARE
    total_reg    bigint; null_reg    bigint;
    total_wl     bigint; null_wl     bigint;
    total_roster bigint; null_roster bigint;
    total_pay    bigint; null_pay    bigint;
  BEGIN
    SELECT count(*), count(*) FILTER (WHERE event_config_id IS NULL)
      INTO total_reg, null_reg FROM public.registrations;
    SELECT count(*), count(*) FILTER (WHERE event_config_id IS NULL)
      INTO total_wl,  null_wl  FROM public.working_list;
    SELECT count(*), count(*) FILTER (WHERE event_config_id IS NULL)
      INTO total_roster, null_roster FROM public.roster;
    SELECT count(*), count(*) FILTER (WHERE event_config_id IS NULL)
      INTO total_pay, null_pay FROM public.event_payments;

    RAISE NOTICE 'Pre-backfill audit:';
    RAISE NOTICE '  registrations : total=%, null=%', total_reg,    null_reg;
    RAISE NOTICE '  working_list  : total=%, null=%', total_wl,     null_wl;
    RAISE NOTICE '  roster        : total=%, null=%', total_roster,  null_roster;
    RAISE NOTICE '  event_payments: total=%, null=%', total_pay,    null_pay;
  END;

  -- ── Backfill ─────────────────────────────────────────────────────────────────
  -- Idempotent: WHERE event_config_id IS NULL means re-running is safe.
  UPDATE public.registrations   SET event_config_id = v_tii_id WHERE event_config_id IS NULL;
  GET DIAGNOSTICS r_reg    = ROW_COUNT;

  UPDATE public.working_list    SET event_config_id = v_tii_id WHERE event_config_id IS NULL;
  GET DIAGNOSTICS r_wl     = ROW_COUNT;

  UPDATE public.roster          SET event_config_id = v_tii_id WHERE event_config_id IS NULL;
  GET DIAGNOSTICS r_roster = ROW_COUNT;

  UPDATE public.event_payments  SET event_config_id = v_tii_id WHERE event_config_id IS NULL;
  GET DIAGNOSTICS r_pay    = ROW_COUNT;

  RAISE NOTICE 'Backfill complete: registrations=%, working_list=%, roster=%, event_payments=%',
    r_reg, r_wl, r_roster, r_pay;
  RAISE NOTICE 'All historical TII records now carry event_config_id = %', v_tii_id;
END $$;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
