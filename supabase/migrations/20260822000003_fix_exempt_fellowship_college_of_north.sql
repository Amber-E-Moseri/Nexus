-- Fix exempt fellowship name in the active event config.
-- GUARD: event_configs created later by 20270807000000.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'event_configs' AND relnamespace = 'public'::regnamespace)
  THEN
    EXECUTE $stmt$UPDATE event_configs
    SET exempt_fellowships = array_append(
      array_remove(array_remove(COALESCE(exempt_fellowships, ARRAY[]::text[]),
        'BLW University College of North'), 'BLW University College of the North'),
      'BLW University College of the North')
    WHERE is_active = true$stmt$;
  END IF;
END;
$$;
