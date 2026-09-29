-- One-time, review-before-release backfill: copy gender from the legacy registration with the same
-- email for participants that have none. Never overwrites a recorded value, and skips anything that is
-- not clearly male/female.
-- GUARD: public.registrations / registrations.gender only exist where the legacy registration system
-- was created (not in a fresh local reset), so this is a no-op there.

DO $backfill$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'registrations' AND column_name IN ('gender')
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'registrations' AND column_name = 'email'
  ) THEN
    EXECUTE $sql$
      UPDATE public.icplc_participants p
      SET gender = CASE
          WHEN lower(trim(r.gender)) IN ('male', 'm', 'man') THEN 'male'
          WHEN lower(trim(r.gender)) IN ('female', 'f', 'woman') THEN 'female'
        END
      FROM public.registrations r
      WHERE p.gender IS NULL
        AND p.email IS NOT NULL
        AND lower(trim(r.email)) = lower(trim(p.email))
        AND lower(trim(r.gender)) IN ('male', 'm', 'man', 'female', 'f', 'woman')
    $sql$;
  END IF;
END;
$backfill$;
