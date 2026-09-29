-- Fix all flight fields for Tobi Ibiyeye
-- GUARD: registrations table managed externally; doesn't exist on fresh installs.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'registrations' AND relnamespace = 'public'::regnamespace)
  THEN
    EXECUTE $stmt$UPDATE public.registrations SET
      arrival_date = '2026-08-28'::date, arrival_time = '14:25:00'::time,
      arrival_flight = 'Westjet flight 380', departure_date = '2026-08-31'::date,
      departure_time = '07:00:00'::time, departure_flight = 'Westjet flight 483'
    WHERE email = 'tobiibiyeye101@gmail.com'$stmt$;
  END IF;
END;
$$;
