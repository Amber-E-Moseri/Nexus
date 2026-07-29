-- Fix: show ALL active dept members in the team activity heatmap,
-- including those with zero activity in the last 7 days.
-- The original used CROSS JOIN LATERAL on activity_log which silently dropped
-- users with no matching rows. Replaced with a flat LEFT JOIN.

create or replace function public.get_team_activity_heatmap(p_dept_id uuid)
returns table (
  user_id uuid,
  name text,
  day_offset integer,
  activity_count integer
)
language sql
security definer
as $$
  select
    u.id   as user_id,
    u.name,
    day_series.day as day_offset,
    count(al.id)::integer as activity_count
  from public.users u
  cross join generate_series(0, 6) as day_series(day)
  left join public.activity_log al
    on  al.user_id = u.id
    and al.timestamp::date = (current_date - (day_series.day || ' days')::interval)::date
  where u.department_id = p_dept_id
    and u.status = 'active'
  group by u.id, u.name, day_series.day
  order by u.name asc, day_series.day asc;
$$;

grant execute on function public.get_team_activity_heatmap(uuid) to authenticated;
