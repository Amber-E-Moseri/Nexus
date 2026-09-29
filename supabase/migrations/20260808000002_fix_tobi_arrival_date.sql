-- Fix Tobi Ibiyeye's arrival date format
-- GUARD: registrations table managed externally (Apps Script sync); doesn't exist on fresh installs.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'registrations' AND relnamespace = 'public'::regnamespace)
  THEN
    EXECUTE $stmt$UPDATE public.registrations SET arrival_date = '2026-08-28'::date WHERE email = 'tobiibiyeye101@gmail.com'$stmt$;
  END IF;
END;
$$;
