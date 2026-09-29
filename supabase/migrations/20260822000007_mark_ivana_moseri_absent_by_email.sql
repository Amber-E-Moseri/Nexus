-- Mark Ivana Moseri absent by email
-- GUARD: working_list created later by 20270804000021.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'working_list' AND relnamespace = 'public'::regnamespace)
  THEN
    EXECUTE $stmt$UPDATE working_list SET absent = true WHERE email = 'moseriamber@gmail.com'$stmt$;
  END IF;
END;
$$;
