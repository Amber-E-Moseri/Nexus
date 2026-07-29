-- =============================================================================
-- Rollback: Remove "This Is It 2.0" spaces created in 20270804000004
-- The 25 teams are NOT group spaces — they belong to the event/sprint context.
-- =============================================================================

DO $$
DECLARE
  v_umbrella uuid := '2fa5e9d3-1316-43f1-8f57-0226634bbdb4';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.departments WHERE id = v_umbrella) THEN
    RAISE NOTICE 'Umbrella space not found — already removed, skipping.';
    RETURN;
  END IF;

  -- Remove space_roles for all team spaces + umbrella
  DELETE FROM public.space_roles
  WHERE space_id IN (
    SELECT id FROM public.departments WHERE parent_id = v_umbrella
    UNION ALL
    SELECT v_umbrella
  );

  -- Remove group_space_members for all team spaces
  DELETE FROM public.group_space_members
  WHERE group_space_id IN (
    SELECT id FROM public.departments WHERE parent_id = v_umbrella
  );

  -- Delete child team spaces, then umbrella
  DELETE FROM public.departments WHERE parent_id = v_umbrella;
  DELETE FROM public.departments WHERE id = v_umbrella;

  RAISE NOTICE 'Removed This Is It 2.0 umbrella + 25 team spaces.';
END $$;

-- Drop parent_id column only if no rows use it (safe guard)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.departments WHERE parent_id IS NOT NULL) THEN
    ALTER TABLE public.departments DROP COLUMN IF EXISTS parent_id;
    DROP INDEX IF EXISTS idx_departments_parent_id;
    RAISE NOTICE 'Dropped parent_id column — no remaining rows used it.';
  ELSE
    RAISE NOTICE 'parent_id column kept — other rows still reference it.';
  END IF;
END $$;
