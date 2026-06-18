create or replace function public.get_status_usage_counts(p_department_id uuid)
returns table(status_id uuid, count bigint)
language sql security definer
as $$
  select status_id, count(*)::bigint
  from public.tasks
  where ((p_department_id is null and department_id is null)
    or (p_department_id is not null and department_id = p_department_id))
    and status_id is not null
  group by status_id;
$$;
