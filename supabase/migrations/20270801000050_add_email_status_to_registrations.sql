-- Add email_status tracking to registrations
-- GUARD: registrations managed by external Apps Script sync
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'registrations' AND relnamespace = 'public'::regnamespace) THEN
    RAISE NOTICE 'Skipping: registrations not yet created';
    RETURN;
  END IF;
  EXECUTE $stmt$ALTER TABLE registrations ADD COLUMN IF NOT EXISTS email_status TEXT DEFAULT 'not_registered' CHECK (email_status IN ('not_registered', 'confirming', 'confirmed'))$stmt$;
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_registrations_email_status ON registrations(email_status)';
END;
$$;
