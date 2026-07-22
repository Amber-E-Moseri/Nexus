-- Fix: get_active_sprints_for_sidebar silently drops any sprint with a null
-- end_date. `s.end_date >= current_date` evaluates to NULL (not false, but
-- WHERE treats NULL as excluded) when end_date is null, so an active sprint
-- with no end date set never appears in a member's sidebar quick-access
-- list — the primary way most users reach "their" sprints. This is why
-- Pastor Toby Yinka-Okunusi (owner of YOUTHFEST'26, which had null
-- start/end dates) couldn't find his sprint: it was active, not archived,
-- and he was a member, but it was invisible in the sidebar regardless.
--
-- Fix: treat a null end_date as "no end date set yet" (never excluded on
-- that basis) rather than silently dropping the row.

CREATE OR REPLACE FUNCTION public.get_active_sprints_for_sidebar(p_user_id uuid)
RETURNS TABLE(id uuid, name text, start_date date, end_date date, status text, days_remaining integer, team_count integer)
LANGUAGE sql
STABLE
AS $function$
select
  s.id,
  s.name,
  s.start_date,
  s.end_date,
  s.status,
  (s.end_date - current_date)::int as days_remaining,
  count(distinct st.id)::int as team_count
from public.sprints s
left join public.sprint_teams st on s.id = st.sprint_id
where
  s.is_archived = false
  and (s.status = 'active' or s.status = 'planning')
  and (s.end_date is null or s.end_date >= current_date)
  and (
    exists(select 1 from public.sprint_members sm where sm.sprint_id = s.id and sm.user_id = p_user_id)
    or public.current_user_role() = 'super_admin'
  )
group by s.id
order by
  s.status = 'active' desc,  -- Active sprints first
  s.start_date asc;
$function$;

-- Backfill YOUTHFEST'26's dates (confirmed with the sprint owner): now
-- through Sept 3rd, 2026.
update public.sprints
set start_date = '2026-07-21',
    end_date = '2026-09-03'
where id = '0d97a3c0-4ef3-47b9-8ec9-95b4e33394a4';
