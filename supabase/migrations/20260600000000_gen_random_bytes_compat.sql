-- Compatibility wrapper for gen_random_bytes when pgcrypto extension is unavailable
-- This function mimics the behavior of pgcrypto.gen_random_bytes()

-- Check if function already exists in pgcrypto schema
DO $$
BEGIN
  -- If gen_random_bytes doesn't exist in public schema, create a wrapper
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'gen_random_bytes'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ) THEN
    CREATE FUNCTION public.gen_random_bytes(bytes_length integer)
    RETURNS bytea
    LANGUAGE sql
    STABLE
    AS $FUNC$
      SELECT decode(substring(md5(random()::text || clock_timestamp()::text || gen_random_uuid()::text), 1, bytes_length * 2), 'hex');
    $FUNC$;
  END IF;
END $$;
