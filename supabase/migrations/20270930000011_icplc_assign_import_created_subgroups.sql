-- Three participants created from the Registration CSV import (via "Create new entry") were
-- created before that action copied the subgroup. Use the "Group" value from the
-- registrations_export_2026-09-28.csv, only where no subgroup is set yet.
UPDATE public.icplc_participants p
SET subgroup = v.subgroup,
    updated_at = now()
FROM (VALUES
  ('chinelonwokem', 'BLW Central East Subgroup A'),
  ('ikennanwokem',  'BLW Central East Subgroup A'),
  ('jasonikeokwu',  'BLW West Subgroup A')
) AS v(name_key, subgroup)
WHERE regexp_replace(lower(p.full_name), '[^a-z0-9]', '', 'g') = v.name_key
  AND (p.subgroup IS NULL OR trim(p.subgroup) = '');
