-- Assign 6 ICPLC participants to BLW Central Subgroup B (names matched
-- case/punctuation-insensitively; unmatched names are simply not updated).
UPDATE public.icplc_participants p
SET subgroup = 'BLW Central Subgroup B',
    updated_at = now()
WHERE regexp_replace(lower(trim(p.full_name)), '[^a-z0-9]', '', 'g') IN (
  SELECT regexp_replace(lower(trim(n)), '[^a-z0-9]', '', 'g')
  FROM unnest(ARRAY[
    'Ava Stewart', 'David Amafuela', 'Naomi Iniss',
    'Natasha Dara', 'Phoebe Kudowor', 'Precious Enoh'
  ]) AS n
);
