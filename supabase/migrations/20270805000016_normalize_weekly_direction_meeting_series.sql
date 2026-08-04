-- Keep one Weekly Direction Meeting series, normalize it, and retain its
-- required attendees for all future generated occurrences.
alter table public.meetings disable trigger enforce_meetings_summary_only_update;

do $$
declare
  kept_series_id uuid;
  kept_meeting_id uuid;
begin
  select recurrence_id, id
    into kept_series_id, kept_meeting_id
  from public.meetings
  where lower(title) = 'weekly direction meeting'
    and recurrence_id is not null
  order by (status = 'completed') desc, created_at asc
  limit 1;

  if kept_series_id is null then
    raise notice 'No Weekly Direction Meeting series found.';
    return;
  end if;

  delete from public.meetings
  where lower(title) = 'weekly direction meeting'
    and recurrence_id is not null
    and recurrence_id <> kept_series_id;

  update public.meetings
  set meeting_type = 'manager_meeting',
      -- The series is weekly; generate its next occurrence on that occurrence's day.
      next_occurrence_scheduled = date + interval '7 days'
  where recurrence_id = kept_series_id;

  update public.meetings m
  set allowed_viewers = array(
    select distinct user_id
    from (
      select unnest(coalesce(m.allowed_viewers, '{}'::uuid[])) as user_id
      union
      select u.id
      from public.users u
      where u.email in (
        'moseriewere@gmail.com',
        'jason.ikeokwu@gmail.com',
        'smutambwi1@gmail.com',
        'cedochie@gmail.com',
        'regionalsecretary@lwcanada.org'
      )
    ) viewers
  )
  where m.recurrence_id = kept_series_id;

  insert into public.meeting_attendance (meeting_id, user_id, status)
  select m.id, u.id, 'pending'
  from public.meetings m
  join public.users u on u.email in (
    'moseriewere@gmail.com',
    'jason.ikeokwu@gmail.com',
    'smutambwi1@gmail.com',
    'cedochie@gmail.com',
    'regionalsecretary@lwcanada.org'
  )
  where m.recurrence_id = kept_series_id
  on conflict (meeting_id, user_id) do nothing;
end $$;

alter table public.meetings enable trigger enforce_meetings_summary_only_update;
