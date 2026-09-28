-- The "Sync Flights" path already protects hand-edited arrival/departure fields via
-- flight_manual_override (see 20261224-era fixes + the registration-api-sync
-- form=flights branch). The DEFAULT "Sync Registrations" sync (form=registrations)
-- has no equivalent: its apply step does an unconditional
-- upsert(rows, { onConflict: 'email' }) covering full_name, first_name, last_name,
-- gender, subgroup, fellowship, phone, designation, shirt_size, foundation_status,
-- baptism, allergies, and team — so ANY manual correction to those fields (e.g. via
-- the Edit Registration modal) is silently reverted the next time someone re-runs
-- "Sync Registrations" from the platform API. This mirrors the exact bug already
-- fixed for flights, just on a different set of columns.
-- GUARD: registrations managed by external Apps Script sync
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'registrations' AND relnamespace = 'public'::regnamespace) THEN
    RAISE NOTICE 'Skipping: registrations not yet created';
    RETURN;
  END IF;
  EXECUTE 'ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS registration_manual_override boolean NOT NULL DEFAULT false';
  EXECUTE $cmt$COMMENT ON COLUMN public.registrations.registration_manual_override IS
    'When true, "Sync Registrations" (registration-api-sync, form=registrations) skips '
    'this row entirely — set automatically when a general field (name, subgroup, '
    'fellowship, phone, designation, shirt size, foundation status, baptism, allergies, '
    'team, leadership) is hand-edited via the Edit Registration modal, or toggled '
    'explicitly. Same pattern as flight_manual_override for flight fields.'$cmt$;
END;
$$;
