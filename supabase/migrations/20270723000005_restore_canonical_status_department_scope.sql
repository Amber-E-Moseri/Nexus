-- Fix: personal (no-department) tasks set to "To Do" (and, discovered during
-- investigation, "In Progress" / "Completed" too) land in the "Other" bucket
-- instead of their real status column/section.
--
-- Root cause: the canonical org-wide rows (is_org_status=true) for To Do,
-- In Progress, and Completed had department_id incorrectly set to a specific
-- department instead of NULL. get_space_statuses() (20270720000004) bypasses
-- department_id entirely for is_org_status=true rows, so per-department
-- Kanban/board views were unaffected -- but listTaskStatuses({departmentId:
-- null}) (src/lib/taskStatuses.js), used for personal/no-department task
-- creation, filters on `department_id IS NULL` and so could never see these
-- three canonical rows. Personal task creation fell back to legacy duplicate
-- rows (same category/name, department_id already NULL, left over from
-- earlier status-hierarchy migrations) that get_space_statuses() can never
-- return under any department -- so any personal task saved against them
-- was invisible to every bucketing query and landed in "Other".
--
-- Cancelled's canonical row already had department_id = NULL and was
-- unaffected. Blocked and Review's canonical rows are already inactive
-- (retired by 20270720000019 and via the "In Review -> In Progress" mapping
-- respectively) and are left untouched here -- restoring their department_id
-- would collide with other already-inactive same-named rows for no live
-- benefit, since CLAUDE.md already establishes neither surfaces again.
--
-- Ordering note: the null-department partial unique indexes
-- (task_status_definitions_global_name_idx, ..._global_legacy_idx) enforce
-- uniqueness regardless of `active`, and each duplicate below shares its
-- exact name (and, for two of them, legacy_key) with its canonical
-- counterpart. So the duplicates must be renamed/cleared *before* the
-- canonical rows' department_id is restored to NULL -- otherwise this
-- migration would violate its own uniqueness constraints. If any step here is
-- ever reordered incorrectly, Postgres aborts the whole transaction rather
-- than silently applying a bad state.

BEGIN;

-- 1. Remap any tasks already pointing at the legacy duplicate rows onto their
--    true canonical counterparts.
DO $$
DECLARE
  remapped_count INT;
BEGIN
  UPDATE public.tasks
  SET status_id = '257d3384-6191-458e-b7e6-5e215ff50809'
  WHERE status_id = 'ca924b42-5163-4912-8d31-c494e4191dce';
  GET DIAGNOSTICS remapped_count = ROW_COUNT;
  RAISE NOTICE 'Remapped % task(s) off duplicate To Do onto canonical To Do', remapped_count;

  UPDATE public.tasks
  SET status_id = '38816cde-f45e-4647-ba52-deb418d246d5'
  WHERE status_id = 'b4bce509-57e0-4003-816e-4ea05ee649f7';
  GET DIAGNOSTICS remapped_count = ROW_COUNT;
  RAISE NOTICE 'Remapped % task(s) off duplicate In Progress onto canonical In Progress', remapped_count;

  UPDATE public.tasks
  SET status_id = '8335f92a-9ccb-4e1b-8e8e-841b500181b4'
  WHERE status_id = '02f360e4-5178-4a78-a825-64bf31fee7be';
  GET DIAGNOSTICS remapped_count = ROW_COUNT;
  RAISE NOTICE 'Remapped % task(s) off duplicate Completed onto canonical Completed', remapped_count;
END $$;

-- 2. Assert the remap fully cleared before touching the duplicate rows.
DO $$
DECLARE
  leftover_count INT;
BEGIN
  SELECT count(*) INTO leftover_count FROM public.tasks
  WHERE status_id IN (
    'ca924b42-5163-4912-8d31-c494e4191dce',
    'b4bce509-57e0-4003-816e-4ea05ee649f7',
    '02f360e4-5178-4a78-a825-64bf31fee7be'
  );
  IF leftover_count > 0 THEN
    RAISE EXCEPTION 'Found % task(s) still referencing a duplicate status after remap', leftover_count;
  END IF;
END $$;

-- 3. Retire the three duplicates: deactivate, and rename/clear legacy_key so
--    they no longer collide with their canonical counterparts under the
--    department_id-IS-NULL uniqueness constraints once step 4 restores
--    those canonical rows to department_id = NULL. Not deleted, so they stay
--    in the audit trail (matching the backlog/blocked retirement precedent).
UPDATE public.task_status_definitions
SET active = false, name = 'To Do (retired duplicate)'
WHERE id = 'ca924b42-5163-4912-8d31-c494e4191dce';

UPDATE public.task_status_definitions
SET active = false, name = 'In Progress (retired duplicate)', legacy_key = null
WHERE id = 'b4bce509-57e0-4003-816e-4ea05ee649f7';

UPDATE public.task_status_definitions
SET active = false, name = 'Completed (retired duplicate)', legacy_key = null
WHERE id = '02f360e4-5178-4a78-a825-64bf31fee7be';

-- 4. Restore the canonical org-wide rows to department_id = NULL so personal
--    (no-department) task creation can see them again, matching the
--    correctly-scoped "Cancelled" row.
UPDATE public.task_status_definitions
SET department_id = null
WHERE id IN (
  '257d3384-6191-458e-b7e6-5e215ff50809', -- To Do
  '38816cde-f45e-4647-ba52-deb418d246d5', -- In Progress
  '8335f92a-9ccb-4e1b-8e8e-841b500181b4'  -- Completed
);

COMMIT;

-- Regression guard: lets a test assert the null-department uniqueness
-- constraint actually rejects a duplicate, instead of just checking the
-- index "exists" (which, per this migration's own investigation, proved
-- nothing about whether a row was actually miscoped). Self-cleaning if the
-- guard is somehow broken, so it's safe to call in any environment.
CREATE OR REPLACE FUNCTION public.test_assert_status_duplicate_rejected(
  p_name text, p_category text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rejected boolean := false;
BEGIN
  BEGIN
    -- is_org_status=true (with org_status_id left null) satisfies the
    -- org_status_required_for_custom CHECK without needing a real parent id;
    -- the department_id-IS-NULL unique indexes this is actually testing
    -- don't key off is_org_status, so this still exercises the same
    -- constraint a real duplicate would hit.
    INSERT INTO task_status_definitions (name, category, color, department_id, is_org_status, legacy_key, active)
    VALUES (p_name, p_category, '#7A7D86', null, true, null, true);
  EXCEPTION
    WHEN unique_violation THEN
      v_rejected := true;
  END;
  IF NOT v_rejected THEN
    -- Guard didn't reject it -- clean up the row we just created so the
    -- check is non-destructive even when it's failing.
    DELETE FROM task_status_definitions
    WHERE name = p_name AND category = p_category AND department_id IS NULL
      AND legacy_key IS NULL AND active = true AND color = '#7A7D86';
  END IF;
  RETURN v_rejected;
END;
$$;

REVOKE ALL ON FUNCTION public.test_assert_status_duplicate_rejected(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.test_assert_status_duplicate_rejected(text, text) TO service_role;

-- Rollback (order matters -- reverse of the above; does not restore original
-- task->status_id remapping from step 1, which is correct regardless of
-- whether this migration is rolled back):
-- BEGIN;
-- UPDATE task_status_definitions SET department_id = 'e06d95c4-c36e-439f-993c-2b7f2393d277' WHERE id = '257d3384-6191-458e-b7e6-5e215ff50809';
-- UPDATE task_status_definitions SET department_id = 'a7f3d1d8-7a11-40d4-b65f-cd0bf17308ad' WHERE id = '38816cde-f45e-4647-ba52-deb418d246d5';
-- UPDATE task_status_definitions SET department_id = '9798f8e3-50f2-4e5b-a456-c4ad9f94fe85' WHERE id = '8335f92a-9ccb-4e1b-8e8e-841b500181b4';
-- UPDATE task_status_definitions SET active = true, name = 'To Do' WHERE id = 'ca924b42-5163-4912-8d31-c494e4191dce';
-- UPDATE task_status_definitions SET active = true, name = 'In Progress', legacy_key = 'in_progress' WHERE id = 'b4bce509-57e0-4003-816e-4ea05ee649f7';
-- UPDATE task_status_definitions SET active = true, name = 'Completed', legacy_key = 'done' WHERE id = '02f360e4-5178-4a78-a825-64bf31fee7be';
-- COMMIT;
