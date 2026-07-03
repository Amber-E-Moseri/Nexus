-- Migration: Fix get_space_statuses RPC to include both org and dept statuses
-- Reason: Tasks created with org-wide status_ids must match against available statuses
-- The previous logic was either/or (dept-only OR org-only), breaking status hierarchy

BEGIN;

create or replace function public.get_space_statuses(p_department_id uuid)
returns setof public.task_status_definitions
language sql
stable
set search_path = public
as $$
  select tsd.*
  from public.task_status_definitions tsd
  where tsd.is_org_status = true
    or tsd.department_id = p_department_id
  order by tsd.is_org_status desc, tsd.sort_order asc, tsd.name asc;
$$;

COMMIT;
