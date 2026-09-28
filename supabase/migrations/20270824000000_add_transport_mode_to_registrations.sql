-- Add transport_mode to distinguish bus vs driving for in-state delegates.
-- Allowed values: 'bus', 'driving' (null = unspecified, treated as driving).
-- in_state=true remains the source of truth for "not flying"; transport_mode
-- is a display label only and does not affect fullyConfirmed logic.
-- GUARD: registrations managed by external Apps Script sync
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'registrations' AND relnamespace = 'public'::regnamespace) THEN
    RAISE NOTICE 'Skipping: registrations not yet created';
    RETURN;
  END IF;
  EXECUTE 'ALTER TABLE registrations ADD COLUMN IF NOT EXISTS transport_mode text';
END;
$$;
