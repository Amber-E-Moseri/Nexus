create or replace function public.get_department_utilization()
returns table (
  department_id uuid,
  department_name text,
  active_members integer,
  open_tasks integer,
  utilization_percent integer,
  top_users jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.jwt() ->> 'user_role', '') not in ('super_admin', 'regional_secretary') then
    raise exception 'Not authorized to view organization utilization';
  end if;

  return query
  with member_counts as (
    select u.department_id, count(*)::integer as active_members
    from users u
    where u.department_id is not null
      and coalesce(u.status, 'active') = 'active'
    group by u.department_id
  ), open_task_counts as (
    select t.department_id, count(*)::integer as open_tasks
    from tasks t
    where t.is_personal = false
      and t.parent_task_id is null
      and t.completed_at is null
      and t.department_id is not null
    group by t.department_id
  ), completed_by_user as (
    select u.department_id, u.id as user_id, u.name, count(t.id)::integer as completed_tasks
    from users u
    join tasks t on t.assignee_id = u.id
    where t.is_personal = false
      and t.parent_task_id is null
      and t.completed_at >= now() - interval '30 days'
      and u.department_id is not null
    group by u.department_id, u.id, u.name
  ), ranked_users as (
    select *, row_number() over (partition by department_id order by completed_tasks desc, name) as rank
    from completed_by_user
  ), top_users_by_department as (
    select department_id,
      jsonb_agg(jsonb_build_object('name', name, 'completed_tasks', completed_tasks) order by rank) as top_users
    from ranked_users
    where rank <= 3
    group by department_id
  )
  select
    d.id,
    d.name,
    coalesce(m.active_members, 0),
    coalesce(o.open_tasks, 0),
    case when coalesce(m.active_members, 0) = 0 then 0
      else least(100, round(coalesce(o.open_tasks, 0)::numeric * 100 / (m.active_members * 5))::integer)
    end,
    coalesce(t.top_users, '[]'::jsonb)
  from departments d
  left join member_counts m on m.department_id = d.id
  left join open_task_counts o on o.department_id = d.id
  left join top_users_by_department t on t.department_id = d.id
  order by utilization_percent desc, d.name;
end;
$$;

grant execute on function public.get_department_utilization() to authenticated;
