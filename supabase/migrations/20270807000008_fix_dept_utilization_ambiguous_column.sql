-- Fix: "column reference department_id is ambiguous" in get_department_utilization.
--
-- RETURNS TABLE declares department_id as an output variable in PL/pgSQL scope.
-- Inside the ranked_users CTE, PARTITION BY department_id is ambiguous between
-- that output variable and the column from completed_by_user.
-- Fix: alias completed_by_user as cbu and qualify all references explicitly.

drop function if exists public.get_department_utilization();

create function public.get_department_utilization()
returns table (
  department_id        uuid,
  department_name      text,
  active_members       integer,
  open_tasks           integer,
  completed_this_week  integer,
  avg_tasks_per_member numeric,
  utilization_percent  integer,
  top_users            jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_user_role() not in ('super_admin', 'regional_secretary') then
    return;
  end if;

  return query
  with member_counts as (
    select u.department_id as dept_id, count(*)::integer as active_members
    from users u
    where u.department_id is not null
      and coalesce(u.status, 'active') = 'active'
    group by u.department_id
  ),
  open_task_counts as (
    select t.department_id as dept_id, count(*)::integer as open_tasks
    from tasks t
    join task_status_definitions tsd on tsd.id = t.status_id
    where t.is_personal = false
      and t.parent_task_id is null
      and t.deleted_at is null
      and t.department_id is not null
      and tsd.category not in ('completed', 'cancelled')
    group by t.department_id
  ),
  completed_this_week_counts as (
    select t.department_id as dept_id, count(*)::integer as completed_this_week
    from tasks t
    join task_status_definitions tsd on tsd.id = t.status_id
    where t.is_personal = false
      and t.parent_task_id is null
      and t.deleted_at is null
      and t.department_id is not null
      and tsd.category = 'completed'
      and t.completed_at >= date_trunc('week', now())
    group by t.department_id
  ),
  completed_by_user as (
    select
      u.department_id as dept_id,
      u.id            as user_id,
      u.name,
      count(t.id)::integer as completed_tasks
    from users u
    join tasks t on t.assignee_id = u.id
    join task_status_definitions tsd on tsd.id = t.status_id
    where t.is_personal = false
      and t.parent_task_id is null
      and t.deleted_at is null
      and tsd.category = 'completed'
      and t.completed_at >= now() - interval '30 days'
      and u.department_id is not null
    group by u.department_id, u.id, u.name
  ),
  ranked_users as (
    select
      cbu.dept_id,
      cbu.name,
      cbu.completed_tasks,
      row_number() over (partition by cbu.dept_id order by cbu.completed_tasks desc, cbu.name) as rnk
    from completed_by_user cbu
  ),
  top_users_by_department as (
    select
      ru.dept_id,
      jsonb_agg(
        jsonb_build_object('name', ru.name, 'completed_tasks', ru.completed_tasks)
        order by ru.rnk
      ) as top_users
    from ranked_users ru
    where ru.rnk <= 3
    group by ru.dept_id
  )
  select
    d.id                                                as department_id,
    d.name                                              as department_name,
    coalesce(m.active_members, 0)                       as active_members,
    coalesce(o.open_tasks, 0)                           as open_tasks,
    coalesce(w.completed_this_week, 0)                  as completed_this_week,
    case
      when coalesce(m.active_members, 0) = 0 then 0::numeric
      else round(coalesce(o.open_tasks, 0)::numeric / m.active_members, 1)
    end                                                 as avg_tasks_per_member,
    case
      when coalesce(m.active_members, 0) = 0 then 0
      else least(100, round(coalesce(o.open_tasks, 0)::numeric * 100 / (m.active_members * 5))::integer)
    end                                                 as utilization_pct,
    coalesce(tu.top_users, '[]'::jsonb)                 as top_users
  from departments d
  left join member_counts             m  on m.dept_id  = d.id
  left join open_task_counts          o  on o.dept_id  = d.id
  left join completed_this_week_counts w on w.dept_id  = d.id
  left join top_users_by_department   tu on tu.dept_id = d.id
  order by 7 desc, d.name;
end;
$$;

grant execute on function public.get_department_utilization() to authenticated;
