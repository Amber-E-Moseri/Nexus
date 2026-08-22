-- Fix exempt fellowship name in the active event config.
-- "BLW University College of North" (missing "the") was stored incorrectly.
-- Remove both the wrong and correct variants, then append the correct one
-- to avoid any duplicate regardless of prior state.

UPDATE event_configs
SET exempt_fellowships = (
  COALESCE(
    (
      SELECT jsonb_agg(elem)
      FROM jsonb_array_elements(COALESCE(exempt_fellowships, '[]'::jsonb)) AS elem
      WHERE elem <> '"BLW University College of North"'::jsonb
        AND elem <> '"BLW University College of the North"'::jsonb
    ),
    '[]'::jsonb
  ) || '["BLW University College of the North"]'::jsonb
)
WHERE is_active = true;
