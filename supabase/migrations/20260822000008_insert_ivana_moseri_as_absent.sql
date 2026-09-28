-- Ivana Moseri has no working_list row — insert as absent.
-- GUARD: registrations + working_list managed externally; may not exist on fresh installs.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'registrations' AND relnamespace = 'public'::regnamespace)
     AND EXISTS (SELECT 1 FROM pg_class WHERE relname = 'working_list' AND relnamespace = 'public'::regnamespace)
  THEN
    EXECUTE $stmt$INSERT INTO working_list (full_name, email, fellowship, subgroup, absent, manually_added, synced_at)
    SELECT r.full_name, r.email, r.fellowship, r.subgroup, true, true, NOW()
    FROM registrations r WHERE r.email = 'moseriamber@gmail.com'
    ON CONFLICT (email) DO UPDATE SET absent = true$stmt$;
  END IF;
END;
$$;
