-- Mark Ivana Moseri absent by phone
-- GUARD: working_list created later by 20270804000021.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'working_list' AND relnamespace = 'public'::regnamespace)
  THEN
    EXECUTE $stmt$UPDATE working_list SET absent = true WHERE phone_number = '+16475814338' OR LOWER(full_name) LIKE '%ivana moseri%'$stmt$;
  END IF;
END;
$$;
