-- 'regional' sprints (whole sub-region initiatives) belong in every user's
-- sidebar quick-list, not just members' -- they're org-wide by nature.
-- 'group' sprints stay membership-gated for everyone, including
-- regional_secretary -- the sidebar quick-list is "your sprints" for
-- everyone without exception (matches the design in 20270727000001).
-- regional_secretary's full org-wide access already exists at the RLS layer
-- (sprints_select policy), so the "All Sprints" browse page shows them
-- everything regardless of this RPC. Same base filters/sort/cap apply
-- regardless of role -- this only widens which rows are eligible, not how
-- they're filtered by status/archived/end_date or capped (8, in Sidebar.jsx).

create or replace function public.get_active_sprints_for_sidebar(p_user_id uuid)
returns table(id uuid, name text, start_date date, end_date date, status text, days_remaining integer, team_count integer)
language sql
stable
as $$
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
    s.category = 'regional'
    or exists(select 1 from public.sprint_members sm where sm.sprint_id = s.id and sm.user_id = p_user_id)
  )
group by s.id
order by
  s.status = 'active' desc,
  s.start_date asc;
$$;
