-- Fix get_space_statuses to honour space_disabled_org_statuses.
-- Previously the RPC returned all org-wide statuses unconditionally,
-- so toggling visibility in SpaceStatusSettings had no effect on the
-- Kanban board or TaskModal status picker.
CREATE OR REPLACE FUNCTION public.get_space_statuses(p_department_id uuid)
RETURNS SETOF public.task_status_definitions
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT tsd.*
  FROM public.task_status_definitions tsd
  WHERE (
    tsd.is_org_status = true
    AND NOT EXISTS (
      SELECT 1 FROM public.space_disabled_org_statuses sdo
      WHERE sdo.org_status_id = tsd.id
        AND sdo.department_id = p_department_id
    )
  )
  OR tsd.department_id = p_department_id
  ORDER BY tsd.is_org_status DESC, tsd.sort_order ASC, tsd.name ASC;
$$;
