-- Persist the "driving / in-state" flag to the DB so all users see the same
-- confirmed count, not just the device that set it via the Transportation tab.
-- GUARD: registrations managed by external Apps Script sync
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'registrations' AND relnamespace = 'public'::regnamespace) THEN
    RAISE NOTICE 'Skipping: registrations not yet created';
    RETURN;
  END IF;
  EXECUTE 'ALTER TABLE registrations ADD COLUMN IF NOT EXISTS in_state boolean NOT NULL DEFAULT false';
END;
$$;
