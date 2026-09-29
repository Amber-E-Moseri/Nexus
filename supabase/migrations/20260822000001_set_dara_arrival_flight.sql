-- Set arrival flight for Nigel Dara and Natasha Dara
-- GUARD: registrations table managed externally; doesn't exist on fresh installs.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'registrations' AND relnamespace = 'public'::regnamespace)
  THEN
    EXECUTE $stmt$UPDATE registrations SET
      arrival_time = '08:40', arrival_flight = 'F8G43', flight_manual_override = true
    WHERE LOWER(full_name) LIKE '%nigel dara%' OR LOWER(full_name) LIKE '%natasha dara%'$stmt$;
  END IF;
END;
$$;
