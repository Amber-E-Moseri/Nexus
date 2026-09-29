-- Group is derived from Subgroup:
--   BLW Central East Subgroup A / B -> Central East
--   BLW West Subgroup A / B         -> West
--   BLW Central Subgroup A / B      -> Central
-- A trigger keeps icplc_participants.group_name in sync on every insert/update (imports, drawer
-- edits, manual adds). If the subgroup is empty or unrecognised, group_name is left as-is.
CREATE OR REPLACE FUNCTION public.icplc_group_from_subgroup(p_subgroup TEXT)
RETURNS TEXT AS $$
  SELECT CASE
    WHEN p_subgroup ILIKE '%central east%' THEN 'Central East'
    WHEN p_subgroup ILIKE '%west%'         THEN 'West'
    WHEN p_subgroup ILIKE '%central%'      THEN 'Central'
  END;
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.icplc_participants_sync_group()
RETURNS TRIGGER AS $$
DECLARE
  v_group TEXT;
BEGIN
  v_group := public.icplc_group_from_subgroup(NEW.subgroup);
  IF v_group IS NOT NULL THEN
    NEW.group_name := v_group;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS icplc_participants_sync_group ON public.icplc_participants;
CREATE TRIGGER icplc_participants_sync_group
  BEFORE INSERT OR UPDATE OF subgroup, group_name ON public.icplc_participants
  FOR EACH ROW EXECUTE FUNCTION public.icplc_participants_sync_group();

-- Backfill everyone who already has a subgroup (the trigger fills group_name).
UPDATE public.icplc_participants
SET subgroup = subgroup
WHERE subgroup IS NOT NULL AND trim(subgroup) <> '';
