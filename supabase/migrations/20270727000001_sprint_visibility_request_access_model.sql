-- Sprint visibility redesign: sprints were fully visible to everyone
-- (sprints_select qual = true), which is too broad. New model:
--
-- 1. super_admin, regional_secretary, and Programs team can see every
--    sprint without being a member.
-- 2. Everyone else can see (and thus request access to) a sprint only if:
--    they created it, they're already a member, it belongs to their own
--    department (single-dept sprint), or their department has a team in
--    it (multi-dept sprint). Sprints entirely outside their department(s)
--    are invisible — not just access-gated, genuinely not discoverable.
-- 3. can_manage_sprint() (already gates sprint_access_requests approval,
--    sprint edits, etc.) widened to include regional_secretary and
--    Programs team explicitly, alongside the existing creator/super_admin/
--    dept-space-manager/sprint-owner-manager checks.
-- 4. Sidebar's sprint quick-list drops its super_admin bypass — it now
--    shows only sprints the viewer actually belongs to, for every role
--    without exception. Org-wide/group-sprint discovery for privileged
--    roles belongs on the "All Sprints" browse page, not the sidebar.

drop policy if exists sprints_select on public.sprints;
create policy sprints_select on public.sprints
  for select
  to authenticated
  using (
    public.is_super_admin()
    or public.current_user_role() = 'regional_secretary'
    or public.is_programs_team()
    or created_by = auth.uid()
    or public.is_sprint_member(id)
    or (department_id is not null and department_id = public.current_user_department())
    or exists (
      select 1 from public.sprint_teams st
      where st.sprint_id = sprints.id
        and st.department_id = public.current_user_department()
    )
  );

create or replace function public.can_manage_sprint(p_sprint_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.sprints s
    where s.id = p_sprint_id
      and (
        public.is_super_admin()
        or public.current_user_role() = 'regional_secretary'
        or public.is_programs_team()
        or s.created_by = auth.uid()
        or (
          s.department_id is not null
          and public.can_manage_space(s.department_id)
        )
        or exists (
          select 1
          from public.sprint_members sm
          where sm.sprint_id = p_sprint_id
            and sm.user_id = auth.uid()
            and sm.role in ('owner', 'manager')
        )
      )
  )
$$;

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
  and exists(select 1 from public.sprint_members sm where sm.sprint_id = s.id and sm.user_id = p_user_id)
group by s.id
order by
  s.status = 'active' desc,
  s.start_date asc;
$$;
