-- BLW-10: distinct action names for the activity-log filter dropdown.
-- Replaces the client pattern of downloading the 1000 most recent log rows
-- and de-duplicating action strings in the browser.
--
-- SECURITY INVOKER (default) — RLS on activity_log applies.

create or replace function public.get_activity_actions(
  p_user_ids uuid[] default null
)
returns text[]
language sql
stable
as $$
  select coalesce(array_agg(distinct action order by action), '{}')
  from public.activity_log
  where action is not null
    and (p_user_ids is null or user_id = any(p_user_ids))
$$;

grant execute on function public.get_activity_actions(uuid[]) to authenticated;

comment on function public.get_activity_actions(uuid[]) is
  'BLW-10: distinct activity_log action names (optionally scoped to a set of user ids) for filter dropdowns.';
