-- Fix get_pastoral_members to use correct meetings.date column

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
