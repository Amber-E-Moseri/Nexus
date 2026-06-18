-- Dashboard attendance summary RPC
-- Returns overall attendance rate and per-member breakdown for a given time period
-- Results ordered by member rate DESC; widget uses all rows with first row for overall rate

create or replace function public.get_department_attendance_summary(
  p_department_id uuid default null,
  p_days_back     integer default 30
)
returns table (
  overall_rate_pct numeric,
  member_id        uuid,
  member_name      text,
  member_rate_pct  numeric
)
language sql
stable
as $$
  with date_range as (
    select (current_date - (p_days_back || ' days')::interval)::date as start_date
  ),
  scoped_attendance as (
    select
      ma.user_id,
      u.name,
      ma.status
    from public.meeting_attendance ma
    join public.meetings m on m.id = ma.meeting_id
    join public.users u on u.id = ma.user_id
    cross join date_range dr
    where m.date >= dr.start_date::timestamptz
      and (p_department_id is null or m.department_id = p_department_id)
  ),
  member_rates as (
    select
      user_id,
      name,
      round(
        100.0 * count(*) filter (where status = 'present') / nullif(count(*), 0),
        1
      ) as rate_pct
    from scoped_attendance
    group by user_id, name
  ),
  overall as (
    select round(100.0 * count(*) filter (where status = 'present') / nullif(count(*), 0), 1)::numeric as rate_pct
    from scoped_attendance
  )
  select
    o.rate_pct as overall_rate_pct,
    mr.user_id as member_id,
    mr.name as member_name,
    mr.rate_pct as member_rate_pct
  from member_rates mr
  cross join overall o
  order by mr.rate_pct desc, mr.name;
$$;

grant execute on function public.get_department_attendance_summary(uuid, integer) to authenticated;
