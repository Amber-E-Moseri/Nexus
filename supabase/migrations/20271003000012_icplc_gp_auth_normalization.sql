-- Normalize ICPLC Group Pastor leadership checks with trim/lower.
-- Keeps authorization exact to "group pastor" while tolerating casing and surrounding whitespace.

CREATE OR REPLACE FUNCTION public.icplc_gp_is_authorized(p_event_id uuid)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public, pg_catalog
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND (
      SELECT COUNT(*) = 1
      FROM public.icplc_participants
      WHERE event_id      = p_event_id
        AND nexus_user_id = auth.uid()
        AND lower(btrim(leadership)) = 'group pastor'
        AND subgroup IS NOT NULL
        AND length(btrim(subgroup)) > 0
    )
$$;

REVOKE EXECUTE ON FUNCTION public.icplc_gp_is_authorized(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.icplc_gp_is_authorized(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.icplc_gp_subgroup(p_event_id uuid)
  RETURNS text
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public, pg_catalog
AS $$
  SELECT subgroup
  FROM   public.icplc_participants
  WHERE  event_id      = p_event_id
    AND  nexus_user_id = auth.uid()
    AND  lower(btrim(leadership)) = 'group pastor'
    AND  subgroup IS NOT NULL
    AND  length(btrim(subgroup)) > 0
  LIMIT 1
$$;

REVOKE EXECUTE ON FUNCTION public.icplc_gp_subgroup(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.icplc_gp_subgroup(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.icplc_gp_is_authorized_any()
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public, pg_catalog
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM   public.icplc_participants p
      JOIN   public.event_configs ec ON ec.id = p.event_id
      WHERE  p.nexus_user_id = auth.uid()
        AND  ec.event_name ilike '%ICPLC%'
        AND  lower(btrim(p.leadership)) = 'group pastor'
        AND  p.subgroup IS NOT NULL
        AND  length(btrim(p.subgroup)) > 0
    )
$$;

REVOKE EXECUTE ON FUNCTION public.icplc_gp_is_authorized_any() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.icplc_gp_is_authorized_any() TO authenticated;
