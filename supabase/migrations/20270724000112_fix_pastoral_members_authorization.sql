-- =============================================================================
-- Fix: get_pastoral_members had no caller-identity check
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER bypasses RLS by design, but this function never checked
-- that the caller actually IS p_pastor_id (or has legitimate oversight
-- authority) before returning that pastor's member roster (names, emails,
-- attendance %, last meeting date). Any authenticated user could call this
-- RPC directly with an arbitrary pastor's user id and get their data —
-- the dashboard widget only ever passes the caller's own id, so this was
-- never reachable through the normal UI, but the RPC itself was wide open
-- to anyone hitting it directly (browser console, API client, etc.).
-- Found while investigating a separate report of a pastor seeing another
-- pastor's Flock data — that turned out to be stale client-side state (RLS
-- on flock_contacts itself was verified correct), but this was a real,
-- independent gap turned up along the way.
-- =============================================================================

create or replace function public.get_pastoral_members(p_pastor_id uuid)
returns table(member_id uuid, name text, email text, attendance_percent integer, last_meeting_date timestamp with time zone, status text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if auth.uid() <> p_pastor_id and public.current_user_role() <> 'super_admin' then
    raise exception 'Not authorized to view this pastor''s members' using errcode = '42501';
  end if;

  return query
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
end;
$$;
