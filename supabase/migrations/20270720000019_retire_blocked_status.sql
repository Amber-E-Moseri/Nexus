-- Retire "Blocked" as a selectable task status, following the same pattern
-- 20270720000008 used to retire "Not Started"/backlog: remap live tasks off
-- it, re-point any dept-scoped custom statuses that were parented to it
-- (org_status_required_for_custom CHECK requires a non-null org_status_id
-- on every non-org status), deactivate the row(s), then assert nothing is
-- left referencing an inactive status before committing.
--
-- Remap target: "In Progress" — Blocked's own category is already
-- 'in_progress', so this preserves "still active, not open/new" semantics
-- (unlike remapping to 'To Do', which would flip the category to 'open').
--
-- get_space_statuses() already filters on active = true (fixed in
-- 20270720000008), so no further RPC change is needed for Kanban/TaskModal
-- pickers to stop showing it.
--
-- Verified against live data before writing this migration: 1 live task on
-- the org-wide Blocked row, 0 on the 4 unused dept-scoped Blocked
-- duplicates, no automation rule conditions/actions reference 'blocked'.

BEGIN;

-- 1. Remap any tasks off "blocked" onto "in_progress" in the same department.
DO $$
DECLARE
  remapped_count INT;
BEGIN
  UPDATE public.tasks t
  SET status_id = inprog_status.id
  FROM public.task_status_definitions blocked_status,
       public.task_status_definitions inprog_status
  WHERE t.status_id = blocked_status.id
    AND blocked_status.legacy_key = 'blocked'
    AND inprog_status.legacy_key = 'in_progress'
    AND inprog_status.department_id IS NOT DISTINCT FROM blocked_status.department_id;

  GET DIAGNOSTICS remapped_count = ROW_COUNT;
  RAISE NOTICE 'Remapped % task(s) off Blocked onto In Progress', remapped_count;
END $$;

-- 2. Re-point any dept-scoped custom statuses still parented to Blocked.
UPDATE public.task_status_definitions
SET org_status_id = (
  SELECT id FROM public.task_status_definitions
  WHERE is_org_status = true AND legacy_key = 'in_progress'
)
WHERE is_org_status = false
  AND org_status_id = (
    SELECT id FROM public.task_status_definitions
    WHERE is_org_status = true AND legacy_key = 'blocked'
  );

-- 3. Deactivate the Blocked row(s) — org row + any dept-scoped duplicates.
UPDATE public.task_status_definitions
SET active = false
WHERE legacy_key = 'blocked'
  AND active = true;

-- 4. Assert no live task still references an inactive Blocked status.
DO $$
DECLARE
  leftover_count INT;
BEGIN
  SELECT count(*) INTO leftover_count
  FROM public.tasks t
  JOIN public.task_status_definitions s ON s.id = t.status_id
  WHERE s.legacy_key = 'blocked' AND s.active = false;

  IF leftover_count > 0 THEN
    RAISE EXCEPTION 'Found % task(s) still referencing inactive Blocked status', leftover_count;
  END IF;
END $$;

COMMIT;
