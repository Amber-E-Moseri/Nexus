-- Correct Tobi Ibiyeye's flight data
-- GUARD: registrations table managed externally; doesn't exist on fresh installs.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'registrations' AND relnamespace = 'public'::regnamespace)
  THEN
    EXECUTE $stmt$UPDATE public.registrations SET
      arrival_date = '2026-08-27'::date, arrival_time = '08:40:00'::time,
      arrival_flight = 'F8643', departure_date = '2026-08-30'::date,
      departure_time = '17:10:00'::time, departure_flight = 'F8648'
    WHERE email = 'tobiibiyeye101@gmail.com'$stmt$;
  END IF;
END;
$$;
