-- Status Hierarchy Migration - Option B: Interactive Mapping
-- IMPORTANT: This migration PAUSES before applying mappings for review
-- Stop at "REVIEW POINT" and run the review query before continuing

BEGIN;

-- Step 1: Add schema columns for org status hierarchy
ALTER TABLE public.task_status_definitions
ADD COLUMN IF NOT EXISTS org_status_id uuid REFERENCES public.task_status_definitions(id),
ADD COLUMN IF NOT EXISTS is_org_status boolean NOT NULL DEFAULT false;

-- Create index for hierarchy navigation
CREATE INDEX IF NOT EXISTS task_status_definitions_org_status_id_idx
  ON public.task_status_definitions(org_status_id);

-- Step 2: Mark the 6 canonical org-wide statuses
-- These are the org-wide statuses (department_id IS NULL)
UPDATE public.task_status_definitions
SET is_org_status = true
WHERE department_id IS NULL
  AND legacy_key IN ('backlog', 'in_progress', 'review', 'blocked', 'done', 'cancelled');

-- Step 3: Create a temporary table for reviewing mappings
-- This captures all proposed mappings based on category + name heuristics
CREATE TEMP TABLE status_mapping_review AS
SELECT
  dept_status.id as dept_status_id,
  dept_status.name as custom_status_name,
  dept_status.category,
  dept_status.department_id,
  COUNT(DISTINCT t.id) as task_count,
  CASE
    -- Mapping logic: category + name/legacy_key heuristics
    WHEN dept_status.legacy_key = 'backlog' THEN (
      SELECT id FROM public.task_status_definitions
      WHERE is_org_status = true AND legacy_key = 'backlog'
    )
    WHEN dept_status.legacy_key = 'in_progress' THEN (
      SELECT id FROM public.task_status_definitions
      WHERE is_org_status = true AND legacy_key = 'in_progress'
    )
    WHEN dept_status.legacy_key = 'review' THEN (
      SELECT id FROM public.task_status_definitions
      WHERE is_org_status = true AND legacy_key = 'review'
    )
    WHEN dept_status.legacy_key = 'blocked' THEN (
      SELECT id FROM public.task_status_definitions
      WHERE is_org_status = true AND legacy_key = 'blocked'
    )
    WHEN dept_status.legacy_key = 'done' THEN (
      SELECT id FROM public.task_status_definitions
      WHERE is_org_status = true AND legacy_key = 'done'
    )
    WHEN dept_status.legacy_key = 'cancelled' THEN (
      SELECT id FROM public.task_status_definitions
      WHERE is_org_status = true AND legacy_key = 'cancelled'
    )
    -- Fallback for statuses without legacy_key: map by category
    WHEN dept_status.category = 'open' THEN (
      SELECT id FROM public.task_status_definitions
      WHERE is_org_status = true AND category = 'open'
    )
    WHEN dept_status.category = 'in_progress' THEN (
      SELECT id FROM public.task_status_definitions
      WHERE is_org_status = true AND category = 'in_progress' AND legacy_key = 'in_progress'
    )
    WHEN dept_status.category = 'completed' THEN (
      SELECT id FROM public.task_status_definitions
      WHERE is_org_status = true AND category = 'completed'
    )
    WHEN dept_status.category = 'cancelled' THEN (
      SELECT id FROM public.task_status_definitions
      WHERE is_org_status = true AND category = 'cancelled'
    )
    ELSE NULL
  END as proposed_org_status_id
FROM public.task_status_definitions dept_status
LEFT JOIN public.tasks t ON t.status_id = dept_status.id
WHERE dept_status.department_id IS NOT NULL
  OR (dept_status.department_id IS NULL AND dept_status.is_org_status = false)
GROUP BY dept_status.id, dept_status.name, dept_status.category, dept_status.department_id, dept_status.legacy_key
ORDER BY dept_status.department_id, dept_status.name;

-- Step 4: Create a readable view for easy review
CREATE TEMP VIEW mapping_review_readable AS
SELECT
  smr.custom_status_name,
  smr.category,
  smr.task_count,
  COALESCE(org.name, '⚠️ NOT FOUND') as proposed_org_parent,
  CASE
    WHEN smr.proposed_org_status_id IS NULL THEN 'WARNING: No mapping found'
    ELSE 'OK'
  END as mapping_status
FROM status_mapping_review smr
LEFT JOIN public.task_status_definitions org ON org.id = smr.proposed_org_status_id
ORDER BY mapping_status DESC, smr.category, smr.custom_status_name;

-- =============================================================================
-- REVIEW POINT: DO NOT CONTINUE UNTIL YOU HAVE REVIEWED THE MAPPINGS
-- =============================================================================
-- Run this query to see all proposed mappings:
-- SELECT * FROM mapping_review_readable;
--
-- Check that:
--   ✓ All mapping_status values are "OK" (not "WARNING")
--   ✓ Each custom status maps to the correct org parent
--   ✓ No unexpected mappings exist
--
-- If mappings look WRONG:
--   1. Run: ROLLBACK;
--   2. Notify with problematic status names and their correct mapping
--   3. We'll adjust the CASE logic above and retry
--
-- If mappings look CORRECT, continue below...
-- =============================================================================

-- Step 5: Apply the mappings (only runs if review approved)
UPDATE public.task_status_definitions dept_status
SET org_status_id = smr.proposed_org_status_id
FROM status_mapping_review smr
WHERE dept_status.id = smr.dept_status_id
  AND smr.proposed_org_status_id IS NOT NULL;

-- Step 6: Verify all non-org statuses now have a mapping
-- This query will show any unmapped statuses (should be 0 rows)
CREATE TEMP TABLE unmapped_statuses AS
SELECT id, name, category, department_id
FROM public.task_status_definitions
WHERE is_org_status = false
  AND org_status_id IS NULL;

-- Fail if unmapped statuses exist
DO $$
DECLARE
  unmapped_count INT;
BEGIN
  SELECT COUNT(*) INTO unmapped_count FROM unmapped_statuses;
  IF unmapped_count > 0 THEN
    RAISE EXCEPTION 'Unmapped statuses found. Please ROLLBACK and review the mapping logic.';
  END IF;
END $$;

-- Step 7: Add CHECK constraint to prevent unmapped statuses in the future
ALTER TABLE public.task_status_definitions
ADD CONSTRAINT task_status_definitions_hierarchy_check
CHECK (
  is_org_status = true
  OR org_status_id IS NOT NULL
);

-- Step 8: Delete deprecated/unused department-scoped org statuses
-- (Keep only active, mapped statuses; remove old redundant ones)
DELETE FROM public.task_status_definitions
WHERE is_org_status = false
  AND org_status_id IS NULL
  AND active = false;

-- Step 9: Summary statistics
CREATE TEMP TABLE migration_summary AS
SELECT
  (SELECT COUNT(*) FROM public.task_status_definitions WHERE is_org_status = true) as org_statuses_count,
  (SELECT COUNT(*) FROM public.task_status_definitions WHERE is_org_status = false) as dept_statuses_count,
  (SELECT COUNT(*) FROM public.task_status_definitions WHERE is_org_status = false AND org_status_id IS NULL) as unmapped_statuses_count;

-- Display summary (for verification after COMMIT)
-- SELECT * FROM migration_summary;

COMMIT;

-- =============================================================================
-- VERIFICATION (run AFTER commit):
-- =============================================================================
-- SELECT
--   s.name as custom_status,
--   os.name as org_parent,
--   COUNT(t.id) as tasks_using_it
-- FROM public.task_status_definitions s
-- LEFT JOIN public.task_status_definitions os ON s.org_status_id = os.id
-- LEFT JOIN public.tasks t ON t.status_id = s.id
-- WHERE s.is_org_status = false
-- GROUP BY s.id, s.name, os.id, os.name
-- ORDER BY os.name, s.name;
--
-- -- Verify no orphaned statuses
-- SELECT id, name FROM public.task_status_definitions
-- WHERE is_org_status = false AND org_status_id IS NULL;
-- -- Should return 0 rows
