-- get_team_velocity() was missing the is_archived = false guard,
-- so archived sprints appeared in the Team Velocity dashboard widget.
-- Every other sprint-querying function already applies this filter.

create or replace function public.get_team_velocity(p_dept_id uuid, p_sprint_count integer default 4)
returns table(sprint_id uuid, sprint_name text, start_date date, end_date date, completed_count integer, total_count integer, completion_rate_percent integer)
language sql
security definer
as $function$
  select
    s.id as sprint_id,
    s.name as sprint_name,
    s.start_date,
    s.end_date,
    coalesce(sum(case when t.completed_at is not null then 1 else 0 end), 0)::integer as completed_count,
    count(distinct t.id)::integer as total_count,
    coalesce((sum(case when t.completed_at is not null then 1 else 0 end)::float / nullif(count(distinct t.id), 0) * 100)::integer, 0) as completion_rate_percent
  from public.sprints s
  left join public.tasks t on t.sprint_id = s.id
    and t.parent_task_id is null
  where s.start_date is not null
    and s.end_date is not null
    and s.is_archived = false
    and (select count(distinct u2.department_id) from public.sprint_members sm2
         join public.users u2 on sm2.user_id = u2.id
         where sm2.sprint_id = s.id and u2.department_id = p_dept_id) > 0
  group by s.id, s.name, s.start_date, s.end_date
  order by s.start_date desc
  limit p_sprint_count;
$function$;
