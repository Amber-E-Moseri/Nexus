-- Retire the leftover "Not Started" (legacy_key='backlog') status rows.
--
-- Root cause: 20260623000003_task_status_to_do_default.sql introduced "To Do"
-- (legacy_key='to_do') as the new default open status per department, but
-- never deactivated the original "Not Started" (legacy_key='backlog') rows
-- it replaced. Both have sat active side-by-side ever since, and
-- get_space_statuses() (20270720000004) returns every department-scoped row
-- with no `active` filter, so users see 7 statuses per space instead of 6
-- ("To Do" AND "Not Started" both showing).
--
-- sync_task_status_fields() (20260618000001) already falls back to the
-- department's is_default=true active status whenever the preferred
-- legacy_key has no active match, so task-api/index.ts and
-- automation-engine/index.ts (both default new tasks to status: 'backlog')
-- keep working correctly after this — they'll resolve to "To Do" instead.

BEGIN;

-- 1. Remap any existing tasks off "backlog" onto the sibling "To Do" status
--    in the same department (global "backlog" -> global "to_do" too, via
--    IS NOT DISTINCT FROM to handle NULL department_id correctly).
DO $$
DECLARE
  remapped_count INT;
BEGIN
  UPDATE public.tasks t
  SET status_id = todo_status.id
  FROM public.task_status_definitions backlog_status,
       public.task_status_definitions todo_status
  WHERE t.status_id = backlog_status.id
    AND backlog_status.legacy_key = 'backlog'
    AND todo_status.legacy_key = 'to_do'
    AND todo_status.department_id IS NOT DISTINCT FROM backlog_status.department_id;

  GET DIAGNOSTICS remapped_count = ROW_COUNT;
  RAISE NOTICE 'Remapped % task(s) off backlog status onto To Do', remapped_count;
END $$;

-- 2. Now that no task references it, deactivate every "backlog" row
--    (global + all departments). Not deleted, so it stays visible/toggleable
--    in SpaceStatusSettings and any historical audit trail stays intact.
UPDATE public.task_status_definitions
SET active = false
WHERE legacy_key = 'backlog'
  AND active = true;

-- 3. Assert the remap fully cleared before the row went inactive.
DO $$
DECLARE
  leftover_count INT;
BEGIN
  SELECT count(*) INTO leftover_count
  FROM public.tasks t
  JOIN public.task_status_definitions s ON s.id = t.status_id
  WHERE s.legacy_key = 'backlog' AND s.active = false;

  IF leftover_count > 0 THEN
    RAISE EXCEPTION 'Found % task(s) still referencing an inactive backlog status after remap', leftover_count;
  END IF;
END $$;

-- 4. Fix get_space_statuses() to respect `active`, so deactivated statuses
--    (this one, and any future ones) stop leaking into the Kanban board /
--    TaskModal status pickers.
CREATE OR REPLACE FUNCTION public.get_space_statuses(p_department_id uuid)
RETURNS SETOF public.task_status_definitions
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT tsd.*
  FROM public.task_status_definitions tsd
  WHERE tsd.active = true
    AND (
      (
        tsd.is_org_status = true
        AND NOT EXISTS (
          SELECT 1 FROM public.space_disabled_org_statuses sdo
          WHERE sdo.org_status_id = tsd.id
            AND sdo.department_id = p_department_id
        )
      )
      OR tsd.department_id = p_department_id
    )
  ORDER BY tsd.is_org_status DESC, tsd.sort_order ASC, tsd.name ASC;
$$;

COMMIT;
