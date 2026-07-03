-- RESET MIGRATION: Wipe incorrect hierarchy setup, restore clean state
-- Safe to run because: no tasks in system, test environment
-- After this, you can run Option B migration with correct canonical IDs

BEGIN;

-- 1. Drop the constraint so we can modify columns freely
ALTER TABLE public.task_status_definitions DROP CONSTRAINT IF EXISTS org_status_required_for_custom;
ALTER TABLE public.task_status_definitions DROP CONSTRAINT IF EXISTS task_status_definitions_hierarchy_check;

-- 2. Reset the hierarchy columns to clean state
UPDATE public.task_status_definitions
SET
  org_status_id = NULL,
  is_org_status = false;

-- 3. Verify reset
SELECT
  COUNT(*) as total_statuses,
  COUNT(*) FILTER (WHERE org_status_id IS NULL) as unmapped,
  COUNT(*) FILTER (WHERE is_org_status = false) as marked_as_custom
FROM public.task_status_definitions;

COMMIT;
