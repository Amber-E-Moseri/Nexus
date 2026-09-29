-- Add check-in timestamp to registrations for event-day attendance tracking.
-- Null = not yet checked in. Populated when staff marks someone as arrived.
-- GUARD: registrations managed by external Apps Script sync
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'registrations' AND relnamespace = 'public'::regnamespace) THEN
    RAISE NOTICE 'Skipping: registrations not yet created';
    RETURN;
  END IF;
  EXECUTE 'ALTER TABLE registrations ADD COLUMN IF NOT EXISTS checked_in_at timestamptz';
END;
$$;
