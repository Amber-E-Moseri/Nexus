-- Assign 18 ICPLC participants to BLW Central Subgroup A (names matched
-- case/punctuation-insensitively; unmatched names are simply not updated).
UPDATE public.icplc_participants p
SET subgroup = 'BLW Central Subgroup A',
    updated_at = now()
WHERE regexp_replace(lower(trim(p.full_name)), '[^a-z0-9]', '', 'g') IN (
  SELECT regexp_replace(lower(trim(n)), '[^a-z0-9]', '', 'g')
  FROM unnest(ARRAY[
    'Amber Moseri', 'Anita Ejemen Ibhakhomu', 'Chibuikem Chukwunyerenwa', 'Creda Moseri',
    'Dami Fatile', 'Emmanuella Prempeh', 'Fadzai Hokonya', 'Fayzah Lawal', 'Gerald Ikem',
    'Jada Morris', 'Jason Chan', 'Jeremy Anyalewechi', 'Kristen Ikem', 'Nigel Dara',
    'Tamara Kelvin', 'Tamilore Adeboyejo', 'Tobi Ibiyeye', 'Tomi Segun-Adebowale'
  ]) AS n
);
