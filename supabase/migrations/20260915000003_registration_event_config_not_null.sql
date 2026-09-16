-- PHASE 6 + 7: Enforce NOT NULL on event_config_id in all registration-domain tables
-- and protect historical records from accidental event-config deletion.
--
-- Prerequisites: 20260915000002_backfill_tii_event_config_id.sql must have run first.
--
-- Changes:
--   1. Verify no NULL event_config_id rows remain (abort if they do)
--   2. Add NOT NULL constraint to registrations, working_list, roster, event_payments
--   3. Change FK from ON DELETE SET NULL → ON DELETE RESTRICT to protect historical records
--   4. event_payments: replace unique(email) with unique(email, event_config_id) so the
--      same person can have payment records across different events without a key collision.
--      Update the upsert conflict target in application code (see RegistrationEcosystem.jsx).
--
-- NOTE on working_list and roster unique(email):
--   Both tables currently have unique(email), which prevents the same person from
--   appearing in two different events. This is documented as a known limitation:
--   the ICPLC branch must drop unique(email) and add unique(email, event_config_id)
--   for those tables before enabling working-list or roster import for ICPLC.
--   That change is deferred here because the ICPLC import tab is currently hidden,
--   making the constraint harmless for the current ICPLC deployment.

-- ── Safety check ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  n bigint;
BEGIN
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
END $$;

-- ── NOT NULL constraints ──────────────────────────────────────────────────────
ALTER TABLE public.registrations
  ALTER COLUMN event_config_id SET NOT NULL;

ALTER TABLE public.working_list
  ALTER COLUMN event_config_id SET NOT NULL;

ALTER TABLE public.roster
  ALTER COLUMN event_config_id SET NOT NULL;

ALTER TABLE public.event_payments
  ALTER COLUMN event_config_id SET NOT NULL;

-- ── FK: ON DELETE SET NULL → ON DELETE RESTRICT ───────────────────────────────
-- Historical preservation: deleting an event_config must not silently destroy
-- the registration/payment records that belong to that event.

ALTER TABLE public.registrations
  DROP CONSTRAINT IF EXISTS registrations_event_config_id_fkey;
ALTER TABLE public.registrations
  ADD CONSTRAINT registrations_event_config_id_fkey
  FOREIGN KEY (event_config_id) REFERENCES public.event_configs(id) ON DELETE RESTRICT;

ALTER TABLE public.working_list
  DROP CONSTRAINT IF EXISTS working_list_event_config_id_fkey;
ALTER TABLE public.working_list
  ADD CONSTRAINT working_list_event_config_id_fkey
  FOREIGN KEY (event_config_id) REFERENCES public.event_configs(id) ON DELETE RESTRICT;

ALTER TABLE public.roster
  DROP CONSTRAINT IF EXISTS roster_event_config_id_fkey;
ALTER TABLE public.roster
  ADD CONSTRAINT roster_event_config_id_fkey
  FOREIGN KEY (event_config_id) REFERENCES public.event_configs(id) ON DELETE RESTRICT;

ALTER TABLE public.event_payments
  DROP CONSTRAINT IF EXISTS event_payments_event_config_id_fkey;
ALTER TABLE public.event_payments
  ADD CONSTRAINT event_payments_event_config_id_fkey
  FOREIGN KEY (event_config_id) REFERENCES public.event_configs(id) ON DELETE RESTRICT;

-- ── event_payments: composite unique (email, event_config_id) ─────────────────
-- Replace the single-column unique(email) with a per-event composite unique so that
-- the same person can have payment records in TII and in ICPLC.
-- The upsert in FinanceTab is updated to use onConflict: 'email,event_config_id'.

-- Drop the old unique constraint on email alone.
-- PostgreSQL auto-names this <table>_<column>_key.
ALTER TABLE public.event_payments
  DROP CONSTRAINT IF EXISTS event_payments_email_key;

-- Also drop any duplicate unique index that may exist under the column definition
DROP INDEX IF EXISTS public.event_payments_email_unique;

-- Add composite unique
ALTER TABLE public.event_payments
  ADD CONSTRAINT event_payments_email_event_config_id_key
  UNIQUE (email, event_config_id);

-- The email-only index is now covered by the composite unique index above.
-- Keep the separate non-unique email index for fast lookups by email alone
-- (used in join-based RPCs that cross-reference registrations and working_list).
-- If it was already dropped by removing the constraint, recreate it:
CREATE INDEX IF NOT EXISTS event_payments_email_idx
  ON public.event_payments (email);

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
