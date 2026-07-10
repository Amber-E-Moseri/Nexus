-- BLW-08: resolve the two-tier status hierarchy server-side.
--
-- Replaces the client-side pattern of fetching org statuses and dept statuses
-- separately and joining them in the browser (getStatusHierarchy /
-- getOrgStatusParent in src/lib/taskStatuses.js). Each dept status row comes
-- back pre-joined with its org parent; a broken mapping is reported in
-- hierarchy_error instead of silently resolving to null.
--
-- SECURITY INVOKER (default) — RLS on task_status_definitions applies.

create or replace function public.get_task_status_hierarchy(
  p_department_id uuid default null
)
returns jsonb
language sql
stable
as $$
select jsonb_build_object(
  'org_statuses', (
    select coalesce(jsonb_agg(to_jsonb(o) order by o.sort_order, o.name), '[]'::jsonb)
    from public.task_status_definitions o
    where o.is_org_status = true
      and o.active = true
  ),
  'dept_statuses', (
    select coalesce(jsonb_agg(
      (to_jsonb(d) || jsonb_build_object(
        'org_parent', to_jsonb(p),
        'hierarchy_error',
          case
            when d.org_status_id is null then 'missing_org_status_id'
            when p.id is null then 'org_parent_not_found'
          end
      )) order by d.sort_order, d.name), '[]'::jsonb)
    from public.task_status_definitions d
    left join public.task_status_definitions p
      on p.id = d.org_status_id and p.is_org_status = true
    where d.is_org_status = false
      and d.active = true
      and (p_department_id is null or d.department_id = p_department_id)
  )
)
$$;

grant execute on function public.get_task_status_hierarchy(uuid) to authenticated;

comment on function public.get_task_status_hierarchy(uuid) is
  'BLW-08: org + dept task statuses pre-joined server-side; dept rows carry org_parent and a hierarchy_error flag when org_status_id is missing or dangling.';
