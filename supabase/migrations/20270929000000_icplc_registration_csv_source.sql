-- ICPLC Registration CSV Source Infrastructure
--
-- Adds support for Registration CSV as a dedicated source type.
-- Repairs two proven constraint mismatches:
--   1. icplc_import_batches.status — missing 'applied_with_errors' state
--   2. icplc_import_rows.apply_status — missing 'created', 'linked' states
--   3. icplc_identity_maps.source_type — add 'registration_csv' type
--   4. icplc_import_batches.source — add 'registration_csv' source
--
-- DESIGN DECISIONS:
--   * Status/Registered source evidence preserved in raw_payload
--   * registration_status mapping gated behind deterministic rules
--   * No fuzzy auto-linking; candidates for staff review only
--   * Duplicate Registration ID = conflict (batch continues as applied_with_errors)
--   * Email claims (icplc_email_claims) used for exact deterministic matching

-- ============================================================================
-- 1. Repair icplc_import_batches.status CHECK
-- ============================================================================
-- The existing CHECK constraint does not allow 'applied_with_errors',
-- which is the state used when a batch partially applies (some rows errored).
-- This repair broadens the CHECK to include that state.

ALTER TABLE public.icplc_import_batches
  DROP CONSTRAINT icplc_import_batches_status_check;

ALTER TABLE public.icplc_import_batches
  ADD CONSTRAINT icplc_import_batches_status_check
  CHECK (status in (
    'pending', 'matching', 'matched', 'previewing', 'previewed',
    'applying', 'applied', 'applied_with_errors', 'failed'
  ));

-- ============================================================================
-- 2. Repair icplc_import_rows.apply_status CHECK
-- ============================================================================
-- The existing CHECK constraint does not allow 'created' and 'linked',
-- which are states written by the existing CSV adapter when matching logic
-- creates new rows or links to existing participants.
-- This repair broadens the CHECK to include those states.

ALTER TABLE public.icplc_import_rows
  DROP CONSTRAINT icplc_import_rows_apply_status_check;

ALTER TABLE public.icplc_import_rows
  ADD CONSTRAINT icplc_import_rows_apply_status_check
  CHECK (apply_status in (
    'kept', 'updated', 'protected', 'skipped', 'error',
    'created', 'linked'
  ));

-- ============================================================================
-- 3. Add 'registration_csv' to icplc_identity_maps.source_type
-- ============================================================================
-- Registration CSV is a dedicated source type distinct from:
--   'csv' (generic CSV fallback)
--   'cmp_registrations' (CMP registration data)
--   'cmp_flights' (CMP flight data)
--   'cmp_documentation' (CMP documentation form data)
--   'registration' (legacy registration source)
--
-- This dedicated type ensures source_key (Registration ID) collisions
-- from the Registration CSV are isolated from other sources.

ALTER TABLE public.icplc_identity_maps
  DROP CONSTRAINT icplc_identity_maps_source_type_check;

ALTER TABLE public.icplc_identity_maps
  ADD CONSTRAINT icplc_identity_maps_source_type_check
  CHECK (source_type in (
    'csv', 'cmp_registrations', 'cmp_flights', 'cmp_documentation',
    'registration', 'registration_csv'
  ));

-- ============================================================================
-- 4. Add 'registration_csv' to icplc_import_batches.source
-- ============================================================================
-- Registration CSV batches are created from Registration CSV imports
-- and tracked with source='registration_csv'.
--
-- This is distinct from:
--   'csv' (generic CSV import fallback)
--   'cmp_registrations' (CMP registration sync)
--   'cmp_flights' (CMP flight sync)

ALTER TABLE public.icplc_import_batches
  DROP CONSTRAINT icplc_import_batches_source_check;

ALTER TABLE public.icplc_import_batches
  ADD CONSTRAINT icplc_import_batches_source_check
  CHECK (source in ('csv', 'cmp_registrations', 'cmp_flights', 'registration_csv'));

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- After this migration, the constraints will accept:
--
-- icplc_import_batches.status:
--   'pending', 'matching', 'matched', 'previewing', 'previewed',
--   'applying', 'applied', 'applied_with_errors', 'failed'
--
-- icplc_import_rows.apply_status:
--   'kept', 'updated', 'protected', 'skipped', 'error', 'created', 'linked'
--
-- icplc_identity_maps.source_type:
--   'csv', 'cmp_registrations', 'cmp_flights', 'cmp_documentation',
--   'registration', 'registration_csv'
--
-- icplc_import_batches.source:
--   'csv', 'cmp_registrations', 'cmp_flights', 'registration_csv'
