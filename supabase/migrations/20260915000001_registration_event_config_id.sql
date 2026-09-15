-- Data isolation: link registration-domain tables to their owning event.
--
-- CONTEXT: This Is It 2.0 (TII) and ICPLC are separate event systems that both
-- use RegistrationEcosystem. Without event_config_id, all records in
-- registrations / working_list / roster / event_payments are co-mingled in
-- one pool, making it impossible to distinguish TII 2.0 records from ICPLC
-- records programmatically.
--
-- INVARIANT: NULL event_config_id means "This Is It 2.0 historical record"
-- (all records that pre-date this migration). Going forward, every insert must
-- populate event_config_id so provenance is preserved permanently.
--
-- This migration is additive only — no existing rows are deleted or rewritten.

-- ── registrations ──────────────────────────────────────────────────────────
ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS event_config_id uuid
    REFERENCES public.event_configs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_registrations_event_config_id
  ON public.registrations (event_config_id);

COMMENT ON COLUMN public.registrations.event_config_id IS
  'FK to the event_configs row that owns this registration.
   NULL = This Is It 2.0 historical record (pre-separation).
   Must be set on all new inserts.';

-- ── working_list ────────────────────────────────────────────────────────────
ALTER TABLE public.working_list
  ADD COLUMN IF NOT EXISTS event_config_id uuid
    REFERENCES public.event_configs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_working_list_event_config_id
  ON public.working_list (event_config_id);

COMMENT ON COLUMN public.working_list.event_config_id IS
  'FK to the event_configs row that owns this working list entry.
   NULL = This Is It 2.0 historical record (pre-separation).
   Must be set on all new inserts.';

-- ── roster ──────────────────────────────────────────────────────────────────
ALTER TABLE public.roster
  ADD COLUMN IF NOT EXISTS event_config_id uuid
    REFERENCES public.event_configs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_roster_event_config_id
  ON public.roster (event_config_id);

COMMENT ON COLUMN public.roster.event_config_id IS
  'FK to the event_configs row that owns this roster entry.
   NULL = This Is It 2.0 historical record (pre-separation).
   Must be set on all new inserts.';

-- ── event_payments ──────────────────────────────────────────────────────────
ALTER TABLE public.event_payments
  ADD COLUMN IF NOT EXISTS event_config_id uuid
    REFERENCES public.event_configs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_event_payments_event_config_id
  ON public.event_payments (event_config_id);

COMMENT ON COLUMN public.event_payments.event_config_id IS
  'FK to the event_configs row that owns this payment record.
   NULL = This Is It 2.0 historical record (pre-separation).
   Must be set on all new inserts.';

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
