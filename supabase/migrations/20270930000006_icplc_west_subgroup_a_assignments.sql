-- Assign 6 ICPLC participants to BLW West Subgroup A (names matched
-- case/punctuation-insensitively; unmatched names are simply not updated).
UPDATE public.icplc_participants p
SET subgroup = 'BLW West Subgroup A',
    updated_at = now()
WHERE regexp_replace(lower(trim(p.full_name)), '[^a-z0-9]', '', 'g') IN (
  SELECT regexp_replace(lower(trim(n)), '[^a-z0-9]', '', 'g')
  FROM unnest(ARRAY[
    'Daniel Umeh', 'Dorcas Mukendi', 'Elbridge Enow-Tiku',
    'Ifedayomi Odusanya', 'Praise Ejiogu', 'Tosin Ajibulu'
  ]) AS n
);
