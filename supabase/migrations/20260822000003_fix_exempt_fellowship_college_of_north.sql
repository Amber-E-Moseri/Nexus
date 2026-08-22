-- Fix exempt fellowship name in the active event config (text[] column).
-- "BLW University College of North" (missing "the") was stored incorrectly.
-- Remove both variants then append the correct one to avoid duplicates.

UPDATE event_configs
SET exempt_fellowships = array_append(
  array_remove(
    array_remove(
      COALESCE(exempt_fellowships, ARRAY[]::text[]),
      'BLW University College of North'
    ),
    'BLW University College of the North'
  ),
  'BLW University College of the North'
)
WHERE is_active = true;
