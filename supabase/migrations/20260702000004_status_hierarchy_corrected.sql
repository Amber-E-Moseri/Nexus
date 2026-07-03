-- Migration: Two-tier status hierarchy with CORRECTED canonical IDs
-- Run this AFTER 20260702000003_status_hierarchy_reset.sql

BEGIN;

-- 1. Ensure schema columns exist
DO $$
BEGIN
  BEGIN
    ALTER TABLE public.task_status_definitions
    ADD COLUMN org_status_id UUID REFERENCES public.task_status_definitions(id) ON DELETE RESTRICT;
  EXCEPTION WHEN duplicate_column THEN NULL;
  END;
  BEGIN
    ALTER TABLE public.task_status_definitions
    ADD COLUMN is_org_status BOOLEAN NOT NULL DEFAULT false;
  EXCEPTION WHEN duplicate_column THEN NULL;
  END;
END $$;

-- 2. Mark the 6 CORRECT org-wide statuses as canonical
-- These are the IDs from your original plan
UPDATE public.task_status_definitions SET is_org_status = true WHERE id::text IN (
  '257d3384-6191-458e-b7e6-5e215ff50809',  -- To Do (open)
  '381b8982-b35b-493e-a595-4e31bb620dc9',  -- Blocked (in_progress)
  '38816cde-f45e-4647-ba52-deb418d246d5',  -- In Progress (in_progress)
  '5beec435-9e50-4700-9156-2042bb6072e3',  -- Review (in_progress)
  '8335f92a-9ccb-4e1b-8e8e-841b500181b4',  -- Completed (completed)
  '0ab29013-96ad-4734-8935-20c512b5bdc0'   -- Cancelled (cancelled)
);

-- 3. Apply the mappings based on category + name heuristics
UPDATE public.task_status_definitions s
SET org_status_id = (
  CASE
    WHEN s.category = 'open' THEN '257d3384-6191-458e-b7e6-5e215ff50809'::uuid
    WHEN s.category = 'completed' THEN '8335f92a-9ccb-4e1b-8e8e-841b500181b4'::uuid
    WHEN s.category = 'cancelled' THEN '0ab29013-96ad-4734-8935-20c512b5bdc0'::uuid
    WHEN s.category = 'in_progress' AND s.name ILIKE '%review%' THEN '5beec435-9e50-4700-9156-2042bb6072e3'::uuid
    WHEN s.category = 'in_progress' AND s.name ILIKE '%blocked%' THEN '381b8982-b35b-493e-a595-4e31bb620dc9'::uuid
    WHEN s.category = 'in_progress' THEN '38816cde-f45e-4647-ba52-deb418d246d5'::uuid
    ELSE NULL
  END
)
WHERE is_org_status = false;

-- 4. Verify all non-org statuses now have a mapping
DO $$
DECLARE
  unmapped_count INT;
BEGIN
  SELECT COUNT(*) INTO unmapped_count FROM public.task_status_definitions
  WHERE is_org_status = false AND org_status_id IS NULL;

  IF unmapped_count > 0 THEN
    RAISE EXCEPTION 'Unmapped statuses found: %. Please review the mapping logic.', unmapped_count;
  END IF;
END $$;

-- 5. Drop existing constraint if present
ALTER TABLE public.task_status_definitions DROP CONSTRAINT IF EXISTS org_status_required_for_custom;
ALTER TABLE public.task_status_definitions DROP CONSTRAINT IF EXISTS task_status_definitions_hierarchy_check;

-- 6. Add CHECK constraint to enforce hierarchy
ALTER TABLE public.task_status_definitions
ADD CONSTRAINT org_status_required_for_custom
  CHECK (
    (is_org_status = true AND org_status_id IS NULL)
    OR
    (is_org_status = false AND org_status_id IS NOT NULL)
  );

-- 7. Final verification - display summary
DO $$
DECLARE
  org_count INT;
  dept_count INT;
  orphaned_count INT;
BEGIN
  SELECT COUNT(*) INTO org_count FROM public.task_status_definitions WHERE is_org_status = true;
  SELECT COUNT(*) INTO dept_count FROM public.task_status_definitions WHERE is_org_status = false AND org_status_id IS NOT NULL;
  SELECT COUNT(*) INTO orphaned_count FROM public.task_status_definitions WHERE is_org_status = false AND org_status_id IS NULL;

  RAISE NOTICE 'Migration Summary:';
  RAISE NOTICE '  Org statuses: %', org_count;
  RAISE NOTICE '  Dept statuses (with parent): %', dept_count;
  RAISE NOTICE '  Orphaned statuses: %', orphaned_count;

  IF orphaned_count > 0 THEN
    RAISE EXCEPTION 'Orphaned statuses detected! Migration failed.';
  END IF;
END $$;

COMMIT;
