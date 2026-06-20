-- Dashboard role-specific data queries

-- 1. Get user's action items (tasks from meeting action items)
create or replace function public.get_user_action_items()
returns table (
  task_id uuid,
  title text,
  due_date date,
  assigned_by_id uuid,
  assigned_by_name text,
  meeting_id uuid,
  meeting_title text,
  status_text text
)
language sql
security definer
as $$
  select
    t.id as task_id,
    t.title,
    t.due_date,
    t.created_by as assigned_by_id,
    u.name as assigned_by_name,
    m.id as meeting_id,
    m.title as meeting_title,
    case
      when t.completed_at is not null then 'completed'
      when t.due_date < current_date then 'overdue'
      when t.due_date <= current_date + interval '3 days' then 'due_soon'
      else 'on_track'
    end as status_text
  from public.tasks t
  left join public.users u on t.created_by = u.id
  left join public.meetings m on t.id = m.id or (t.description ilike '%action%' and t.created_at > m.created_at - interval '1 hour')
  where t.assignee_id = auth.uid()
    and t.is_personal = false
    and t.parent_task_id is null
    and (t.description ilike '%action item%' or t.description ilike '%action%')
  order by t.due_date asc nulls last, t.created_at desc;
$$;

grant execute on function public.get_user_action_items() to authenticated;

-- 2. Get team workload (task count per team member)
create or replace function public.get_team_workload(p_dept_id uuid)
returns table (
  user_id uuid,
  name text,
  task_count integer,
  capacity integer,
  utilization_percent integer
)
language sql
security definer
as $$
  select
    u.id,
    u.name,
    coalesce(count(t.id), 0)::integer as task_count,
    5 as capacity,
    least(100, coalesce(count(t.id), 0) * 100 / 5)::integer as utilization_percent
  from public.users u
  left join public.tasks t on t.assignee_id = u.id
    and t.is_personal = false
    and t.parent_task_id is null
    and t.completed_at is null
  where u.department_id = p_dept_id
    and u.status = 'active'
    and u.role in ('member', 'dept_lead')
  group by u.id, u.name
  order by utilization_percent desc, u.name asc;
$$;

grant execute on function public.get_team_workload(uuid) to authenticated;

-- 3. Get pastoral members with attendance
create or replace function public.get_pastoral_members(p_pastor_id uuid)
returns table (
  member_id uuid,
  name text,
  email text,
  attendance_percent integer,
  last_meeting_date timestamptz,
  status text
)
language sql
security definer
as $$
  select
    u.id as member_id,
    u.name,
    u.email,
    coalesce(
      (count(case when ma.status = 'present' then 1 end)::float / nullif(count(m.id), 0) * 100)::integer,
      0
    ) as attendance_percent,
    max(m.date) as last_meeting_date,
    u.status
  from public.pastor_members pm
  join public.users u on pm.member_id = u.id
  left join public.meetings m on m.department_id = u.department_id
    and m.date >= current_date - interval '30 days'
  left join public.meeting_attendance ma on ma.meeting_id = m.id
    and ma.user_id = u.id
  where pm.pastor_id = p_pastor_id
  group by u.id, u.name, u.email, u.status
  order by attendance_percent asc, u.name asc;
$$;

grant execute on function public.get_pastoral_members(uuid) to authenticated;

-- 4. Get absent members (didn't attend recent meetings)
create or replace function public.get_absent_members(p_dept_id uuid, p_days integer default 7)
returns table (
  member_id uuid,
  name text,
  meetings_missed integer,
  last_meeting_date date
)
language sql
security definer
as $$
  select
    u.id as member_id,
    u.name,
    count(distinct m.id)::integer as meetings_missed,
    max(m.meeting_date)::date as last_meeting_date
  from public.users u
  cross join lateral (
    select id, meeting_date
    from public.meetings
    where department_id = p_dept_id
      and meeting_date >= current_date - (p_days || ' days')::interval
  ) m
  left join public.meeting_attendance ma on ma.meeting_id = m.id
    and ma.user_id = u.id
  where u.department_id = p_dept_id
    and u.status = 'active'
    and (ma.id is null or ma.status = 'absent')
  group by u.id, u.name
  having count(distinct m.id) > 0
  order by meetings_missed desc, u.name asc;
$$;

grant execute on function public.get_absent_members(uuid, integer) to authenticated;

-- 5. Get team activity heatmap (last 7 days)
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
    u.id as user_id,
    u.name,
    (current_date - al.date_part)::integer as day_offset,
    count(*)::integer as activity_count
  from public.users u
  cross join lateral generate_series(0, 6) as day_series(day)
  cross join lateral (
    select
      al.id,
      (current_date - (day || ' days')::interval)::date as date_part
    from public.activity_log al
    where al.user_id = u.id
      and al.timestamp >= (current_date - (day || ' days')::interval)
      and al.timestamp < (current_date - (day - 1 || ' days')::interval)
      and al.timestamp >= current_date - interval '7 days'
  ) al
  where u.department_id = p_dept_id
    and u.status = 'active'
  group by u.id, u.name, al.date_part
  order by u.name asc, day_offset asc;
$$;

grant execute on function public.get_team_activity_heatmap(uuid) to authenticated;

-- 6. Get team velocity trend (last 4 sprints)
create or replace function public.get_team_velocity(p_dept_id uuid, p_sprint_count integer default 4)
returns table (
  sprint_id uuid,
  sprint_name text,
  start_date date,
  end_date date,
  completed_count integer,
  total_count integer,
  completion_rate_percent integer
)
language sql
security definer
as $$
  select
    s.id as sprint_id,
    s.name as sprint_name,
    s.start_date,
    s.end_date,
    coalesce(sum(case when t.completed_at is not null then 1 else 0 end), 0)::integer as completed_count,
    count(distinct t.id)::integer as total_count,
    coalesce((sum(case when t.completed_at is not null then 1 else 0 end)::float / nullif(count(distinct t.id), 0) * 100)::integer, 0) as completion_rate_percent
  from public.sprints s
  left join public.sprint_members sm on sm.sprint_id = s.id
  left join public.users u on sm.user_id = u.id
  left join public.tasks t on t.sprint_id = s.id
    and t.parent_task_id is null
  where s.start_date is not null
    and s.end_date is not null
    and (select count(distinct department_id) from public.sprint_members where sprint_id = s.id) > 0
  group by s.id, s.name, s.start_date, s.end_date
  order by s.start_date desc
  limit p_sprint_count;
$$;

grant execute on function public.get_team_velocity(uuid, integer) to authenticated;
