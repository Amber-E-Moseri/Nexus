-- Set arrival date for Nigel Dara and Natasha Dara
-- GUARD: registrations table managed externally; doesn't exist on fresh installs.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'registrations' AND relnamespace = 'public'::regnamespace)
  THEN
    EXECUTE $stmt$UPDATE registrations SET arrival_date = '2026-08-28'
    WHERE LOWER(full_name) LIKE '%nigel dara%' OR LOWER(full_name) LIKE '%natasha dara%'$stmt$;
  END IF;
END;
$$;
