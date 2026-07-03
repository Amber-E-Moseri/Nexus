-- Fix get_space_statuses RPC to return proper statuses for org-wide sprints
-- For org-wide sprints (department_id IS NULL), include both org and common dept statuses

create or replace function public.get_space_statuses(p_department_id uuid)
returns setof public.task_status_definitions
language sql
stable
set search_path = public
as $$
  select tsd.*
  from public.task_status_definitions tsd
  where (
    -- Always include org-wide statuses
    tsd.is_org_status = true
    -- For specific departments, include their statuses
    or (p_department_id is not null and tsd.department_id = p_department_id)
    -- For org-wide sprints (no department), include all active dept statuses
    or (p_department_id is null and tsd.department_id is not null and tsd.active = true)
  )
  order by tsd.is_org_status desc, tsd.sort_order asc, tsd.name asc;
$$;
