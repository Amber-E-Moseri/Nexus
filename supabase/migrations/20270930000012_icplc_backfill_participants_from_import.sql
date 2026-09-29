-- Participants created or matched by the Registration CSV import were missing the KingsChat
-- handle, subgroup, campus, leadership and phone from the export. This function copies them
-- from the import rows, FILL-ONLY: a field that already has a value is never overwritten.
--
--   p_batch_id NULL  -> every import row in the caller's events (one-off backfill)
--   p_batch_id set   -> just that batch (called after Apply)
--
-- Fields: KingsChat Username/User ID, Group -> subgroup ("BLW CENTRAL EAST SUBGROUP A" ->
-- "BLW Central East Subgroup A"), Fellowship/Church -> region (Campus), Designation ->
-- leadership, Country Code + Phone Number -> source_values.phone_number (what the list reads).
CREATE OR REPLACE FUNCTION public._icplc_backfill_from_import(p_batch_id UUID DEFAULT NULL)
RETURNS INT AS $$
DECLARE
  v_updated INT := 0;
BEGIN
  WITH latest AS (
    SELECT DISTINCT ON (ir.participant_id)
      ir.participant_id,
      NULLIF(TRIM(ir.raw_payload ->> 'KingsChat Username'), '') AS kc_username,
      NULLIF(TRIM(ir.raw_payload ->> 'KingsChat User ID'), '') AS kc_user_id,
      NULLIF(TRIM(COALESCE(ir.raw_payload ->> 'Subgroup', ir.raw_payload ->> 'Group')), '') AS grp,
      NULLIF(TRIM(COALESCE(ir.raw_payload ->> 'Fellowship/Church', ir.raw_payload ->> 'Region')), '') AS campus,
      NULLIF(TRIM(ir.raw_payload ->> 'Designation'), '') AS leadership,
      NULLIF(TRIM(COALESCE(ir.raw_payload ->> 'Country Code', '') || COALESCE(ir.raw_payload ->> 'Phone Number', '')), '') AS phone
    FROM public.icplc_import_rows ir
    WHERE ir.participant_id IS NOT NULL
      AND ir.match_status IN ('auto', 'manual', 'persistent', 'auto_kingschat', 'auto_fuzzy_email', 'auto_fuzzy_name')
      AND (p_batch_id IS NULL OR ir.batch_id = p_batch_id)
    ORDER BY ir.participant_id, ir.created_at DESC
  )
  UPDATE public.icplc_participants p
  SET
    kingschat_username = COALESCE(NULLIF(TRIM(p.kingschat_username), ''), l.kc_username),
    kingschat_user_id  = COALESCE(NULLIF(TRIM(p.kingschat_user_id), ''), l.kc_user_id),
    subgroup = COALESCE(
      NULLIF(TRIM(p.subgroup), ''),
      CASE WHEN l.grp IS NOT NULL THEN replace(initcap(lower(l.grp)), 'Blw ', 'BLW ') END
    ),
    region     = COALESCE(NULLIF(TRIM(p.region), ''), l.campus),
    leadership = COALESCE(NULLIF(TRIM(p.leadership), ''), l.leadership),
    source_values = CASE
      WHEN l.phone IS NOT NULL
        AND COALESCE(NULLIF(TRIM(p.source_values -> 'phone_number' ->> 'value'), ''), '') = ''
      THEN COALESCE(p.source_values, '{}'::jsonb) || jsonb_build_object(
        'phone_number', jsonb_build_object('value', l.phone, 'source', 'registration_csv', 'observed_at', now())
      )
      ELSE p.source_values
    END,
    updated_at = now()
  FROM latest l
  WHERE p.id = l.participant_id
    AND (
      (COALESCE(TRIM(p.kingschat_username), '') = '' AND l.kc_username IS NOT NULL)
      OR (COALESCE(TRIM(p.kingschat_user_id), '') = '' AND l.kc_user_id IS NOT NULL)
      OR (COALESCE(TRIM(p.subgroup), '') = '' AND l.grp IS NOT NULL)
      OR (COALESCE(TRIM(p.region), '') = '' AND l.campus IS NOT NULL)
      OR (COALESCE(TRIM(p.leadership), '') = '' AND l.leadership IS NOT NULL)
      OR (l.phone IS NOT NULL AND COALESCE(TRIM(p.source_values -> 'phone_number' ->> 'value'), '') = '')
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public._icplc_backfill_from_import(UUID) FROM PUBLIC, anon, authenticated;

-- App-facing wrapper: same work, gated on write access.
CREATE OR REPLACE FUNCTION public.icplc_backfill_participants_from_import(p_batch_id UUID DEFAULT NULL)
RETURNS INT AS $$
BEGIN
  IF NOT public.icplc_can_write_participants() THEN
    RAISE EXCEPTION 'Insufficient authorization: icplc_can_write_participants() required';
  END IF;
  RETURN public._icplc_backfill_from_import(p_batch_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.icplc_backfill_participants_from_import(UUID) TO authenticated;

-- One-off backfill of everyone already imported.
SELECT public._icplc_backfill_from_import(NULL);
