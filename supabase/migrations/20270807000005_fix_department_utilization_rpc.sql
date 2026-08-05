-- Must drop before replace because the return type (new columns) changed.
drop function if exists public.get_department_utilization();

-- Replace the department utilization RPC with a more robust version:
--   1. Soft auth check (return empty instead of raising exception) so a JWT/DB
--      role mismatch surfaces as "no data" rather than an error in the widget.
--   2. Filter deleted tasks (deleted_at IS NULL).
--   3. Use task_status_definitions.category instead of completed_at IS NULL to
--      determine open tasks — matches the app's two-tier status system.
--   4. Add completed_this_week and avg_tasks_per_member to the result shape.

create or replace function public.get_department_utilization()
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
  -- Soft auth: return empty result set instead of raising an exception.
  -- The widget already gates on the frontend role; this is a defence-in-depth
  -- check only.
  if public.current_user_role() not in ('super_admin', 'regional_secretary') then
    return;
  end if;

  return query
  with member_counts as (
    select u.department_id, count(*)::integer as active_members
    from users u
    where u.department_id is not null
      and coalesce(u.status, 'active') = 'active'
    group by u.department_id
  ),
  open_task_counts as (
    select t.department_id, count(*)::integer as open_tasks
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
    select t.department_id, count(*)::integer as completed_this_week
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
      u.department_id,
      u.id as user_id,
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
    select *, row_number() over (partition by department_id order by completed_tasks desc, name) as rank
    from completed_by_user
  ),
  top_users_by_department as (
    select
      department_id,
      jsonb_agg(
        jsonb_build_object('name', name, 'completed_tasks', completed_tasks)
        order by rank
      ) as top_users
    from ranked_users
    where rank <= 3
    group by department_id
  )
  select
    d.id,
    d.name,
    coalesce(m.active_members, 0),
    coalesce(o.open_tasks, 0),
    coalesce(w.completed_this_week, 0),
    case
      when coalesce(m.active_members, 0) = 0 then 0
      else round(coalesce(o.open_tasks, 0)::numeric / m.active_members, 1)
    end as avg_tasks_per_member,
    -- 5 open tasks per member = 100% utilization
    case
      when coalesce(m.active_members, 0) = 0 then 0
      else least(100, round(coalesce(o.open_tasks, 0)::numeric * 100 / (m.active_members * 5))::integer)
    end as utilization_percent,
    coalesce(t.top_users, '[]'::jsonb)
  from departments d
  left join member_counts m on m.department_id = d.id
  left join open_task_counts o on o.department_id = d.id
  left join completed_this_week_counts w on w.department_id = d.id
  left join top_users_by_department t on t.department_id = d.id
  order by utilization_percent desc, d.name;
end;
$$;

grant execute on function public.get_department_utilization() to authenticated;
