-- hasSprintAccess() (src/features/sprints/lib/sprints.js) queried
-- sprint_members for "does ANY row exist for this sprint_id" with no
-- user_id filter at all. It happened to look correct only because RLS
-- silently scoped the returned rows to what the caller could see. With a
-- sprint that has zero sprint_members rows (e.g. after removing everyone),
-- this returns false for literally every user, including super_admin,
-- regional_secretary, Programs team, and the sprint's own creator/owner --
-- nobody can open the detail view even though sprints_select (RLS) still
-- lets them see the sprint exists on the browse page.
--
-- can_view_sprint() gives the client a single source of truth that mirrors
-- the sprints_select policy (20270727000001) exactly, instead of inferring
-- access from a side effect of sprint_members RLS.

create or replace function public.can_view_sprint(p_sprint_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
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
        or public.is_sprint_member(s.id)
        or (s.department_id is not null and s.department_id = public.current_user_department())
        or exists (
          select 1 from public.sprint_teams st
          where st.sprint_id = s.id
            and st.department_id = public.current_user_department()
        )
      )
  )
$$;

comment on function public.can_view_sprint(uuid) is
  'Client-facing mirror of the sprints_select RLS policy, for UI gating (show detail view vs. locked/request-access screen). Does not itself grant data access -- RLS is still the enforcement layer.';
