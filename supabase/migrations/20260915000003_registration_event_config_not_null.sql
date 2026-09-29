-- PHASE 6 + 7: Enforce NOT NULL on event_config_id in all registration-domain tables.
-- GUARD: all referenced tables created later; skip if not present.
DO $$
DECLARE
  n bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'registrations' AND relnamespace = 'public'::regnamespace) THEN
    RAISE NOTICE 'Skipping NOT NULL enforcement: registrations not yet created';
    RETURN;
  END IF;

  -- Safety check
  SELECT count(*) INTO n FROM public.registrations WHERE event_config_id IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION 'registrations has % NULL event_config_id rows. Run backfill first.', n;
  END IF;

  SELECT count(*) INTO n FROM public.working_list WHERE event_config_id IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION 'working_list has % NULL event_config_id rows. Run backfill first.', n;
  END IF;

  SELECT count(*) INTO n FROM public.roster WHERE event_config_id IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION 'roster has % NULL event_config_id rows. Run backfill first.', n;
  END IF;

  SELECT count(*) INTO n FROM public.event_payments WHERE event_config_id IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION 'event_payments has % NULL event_config_id rows. Run backfill first.', n;
  END IF;

  RAISE NOTICE 'Safety check passed: no NULL event_config_id rows in any table.';

  -- NOT NULL constraints
  EXECUTE 'ALTER TABLE public.registrations ALTER COLUMN event_config_id SET NOT NULL';
  EXECUTE 'ALTER TABLE public.working_list ALTER COLUMN event_config_id SET NOT NULL';
  EXECUTE 'ALTER TABLE public.roster ALTER COLUMN event_config_id SET NOT NULL';
  EXECUTE 'ALTER TABLE public.event_payments ALTER COLUMN event_config_id SET NOT NULL';

  -- FK: ON DELETE SET NULL → ON DELETE RESTRICT
  EXECUTE 'ALTER TABLE public.registrations DROP CONSTRAINT IF EXISTS registrations_event_config_id_fkey';
  EXECUTE 'ALTER TABLE public.registrations ADD CONSTRAINT registrations_event_config_id_fkey FOREIGN KEY (event_config_id) REFERENCES public.event_configs(id) ON DELETE RESTRICT';

  EXECUTE 'ALTER TABLE public.working_list DROP CONSTRAINT IF EXISTS working_list_event_config_id_fkey';
  EXECUTE 'ALTER TABLE public.working_list ADD CONSTRAINT working_list_event_config_id_fkey FOREIGN KEY (event_config_id) REFERENCES public.event_configs(id) ON DELETE RESTRICT';

  EXECUTE 'ALTER TABLE public.roster DROP CONSTRAINT IF EXISTS roster_event_config_id_fkey';
  EXECUTE 'ALTER TABLE public.roster ADD CONSTRAINT roster_event_config_id_fkey FOREIGN KEY (event_config_id) REFERENCES public.event_configs(id) ON DELETE RESTRICT';

  EXECUTE 'ALTER TABLE public.event_payments DROP CONSTRAINT IF EXISTS event_payments_event_config_id_fkey';
  EXECUTE 'ALTER TABLE public.event_payments ADD CONSTRAINT event_payments_event_config_id_fkey FOREIGN KEY (event_config_id) REFERENCES public.event_configs(id) ON DELETE RESTRICT';

  -- event_payments: composite unique (email, event_config_id)
  EXECUTE 'ALTER TABLE public.event_payments DROP CONSTRAINT IF EXISTS event_payments_email_key';
  EXECUTE 'DROP INDEX IF EXISTS public.event_payments_email_unique';
  EXECUTE 'ALTER TABLE public.event_payments DROP CONSTRAINT IF EXISTS event_payments_email_event_config_id_key';
  EXECUTE 'ALTER TABLE public.event_payments ADD CONSTRAINT event_payments_email_event_config_id_key UNIQUE (email, event_config_id)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS event_payments_email_idx ON public.event_payments (email)';
END;
$$;

NOTIFY pgrst, 'reload schema';
