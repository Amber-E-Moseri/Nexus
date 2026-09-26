-- ICPLC 2026: Extended participant tracking fields
--
-- Adds operational columns used exclusively by the ICPLC dashboard UI.
-- All columns are manual-only: platform registration sync and flight-sync
-- do NOT write them. NULL means "not yet collected" for every column.
-- The event_config_id on every registrations row already scopes these
-- to ICPLC — no cross-event leakage is possible.

ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS participation_status text
    CHECK (participation_status IN (
      'TRACKING', 'LIKELY', 'CONFIRMED', 'UNCERTAIN', 'NOT_ATTENDING'
    )),
  ADD COLUMN IF NOT EXISTS passport_country text,
  ADD COLUMN IF NOT EXISTS passport_readiness text
    CHECK (passport_readiness IN (
      'READY', 'UNSURE', 'RENEWAL_NEEDED', 'NOT_APPLICABLE'
    )),
  ADD COLUMN IF NOT EXISTS visa_requirement text
    CHECK (visa_requirement IN (
      'NOT_REQUIRED', 'REQUIRED', 'REVIEW'
    )),
  ADD COLUMN IF NOT EXISTS visa_process text
    CHECK (visa_process IN (
      'NOT_APPLICABLE', 'NOT_STARTED', 'IN_PROGRESS', 'APPROVED'
    )),
  ADD COLUMN IF NOT EXISTS icplc_tags text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS operational_note text;

COMMENT ON COLUMN public.registrations.participation_status IS
  'ICPLC operational tracking of how likely the participant is to attend. '
  'NULL means not yet assessed (treated as TRACKING by UI). '
  'Allowed: TRACKING | LIKELY | CONFIRMED | UNCERTAIN | NOT_ATTENDING.';

COMMENT ON COLUMN public.registrations.passport_country IS
  'Passport issuing country for ICPLC participants (manual, never synced).';

COMMENT ON COLUMN public.registrations.passport_readiness IS
  'Operational readiness of the participant''s passport. '
  'Allowed: READY | UNSURE | RENEWAL_NEEDED | NOT_APPLICABLE.';

COMMENT ON COLUMN public.registrations.visa_requirement IS
  'Whether a destination visa is required for this participant. '
  'Allowed: NOT_REQUIRED | REQUIRED | REVIEW.';

COMMENT ON COLUMN public.registrations.visa_process IS
  'Current status of visa application process. '
  'Allowed: NOT_APPLICABLE | NOT_STARTED | IN_PROGRESS | APPROVED.';

COMMENT ON COLUMN public.registrations.icplc_tags IS
  'Operational tags for ICPLC (e.g. Finances, School, Work). Array of strings.';

COMMENT ON COLUMN public.registrations.operational_note IS
  'Free-text operational notes for ICPLC coordinators. Manual-only.';
