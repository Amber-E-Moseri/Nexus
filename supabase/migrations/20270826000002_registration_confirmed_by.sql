-- Audit trail for manual confirmation: who clicked "Confirm" and when. Previously
-- manually_confirmed was a bare boolean with no record of who set it or when, so a
-- disputed/wrong confirmation couldn't be traced back to a person or a time.
-- GUARD: registrations managed by external Apps Script sync
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'registrations' AND relnamespace = 'public'::regnamespace) THEN
    RAISE NOTICE 'Skipping: registrations not yet created';
    RETURN;
  END IF;
  EXECUTE 'ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS confirmed_by uuid REFERENCES public.users(id) ON DELETE SET NULL';
  EXECUTE 'ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS confirmed_at timestamptz';
  EXECUTE $cmt$COMMENT ON COLUMN public.registrations.confirmed_by IS
    'User who last set manually_confirmed = true via the Confirm button. Cleared when '
    'manually_confirmed is toggled back off.'$cmt$;
  EXECUTE $cmt$COMMENT ON COLUMN public.registrations.confirmed_at IS
    'Timestamp of the manual confirmation named in confirmed_by.'$cmt$;
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_registrations_confirmed_by ON public.registrations(confirmed_by)';
END;
$$;
