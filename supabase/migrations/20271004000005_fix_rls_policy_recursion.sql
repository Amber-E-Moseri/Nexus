-- Break mutual RLS recursion between departments <-> group_space_members and
-- sprints <-> sprint_teams / sprint_members. Any authenticated read of
-- departments, sprints, tasks, etc. raised "infinite recursion detected in policy".
--
-- Cycle 1: departments_select -> group_space_members (RLS) -> group_space_members_select -> departments (RLS)
-- Cycle 2: sprints_select -> sprint_teams (RLS) -> sprint_teams_select_space_access -> sprints (RLS)
--          (sprint_members_select_space_access closes the same loop)
--
-- Fix: the cross-table lookups move into SECURITY DEFINER helpers (pinned search_path,
-- same pattern as is_sprint_member / can_view_space). Predicates keep their original
-- meaning; the only intentional behaviour change is correcting departments_select's
-- group-space membership clause, which compared gsm.group_space_id = gsm.id (never true)
-- instead of gsm.group_space_id = departments.id.

create or replace function public.is_group_space_owner(p_space_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.departments d
    where d.id = p_space_id and d.space_type = 'group' and d.owner_id = auth.uid()
  )
$$;

create or replace function public.is_group_space_member(p_space_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.group_space_members gsm
    where gsm.group_space_id = p_space_id and gsm.user_id = auth.uid()
  )
$$;

-- sprint_teams of a sprint belonging to the caller's department (was an RLS-subject subquery in sprints_select)
create or replace function public.sprint_has_team_in_my_department(p_sprint_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.sprint_teams st
    where st.sprint_id = p_sprint_id and st.department_id = public.current_user_department()
  )
$$;

-- Exactly the sprints_select predicate, evaluated without RLS on sprints/sprint_teams.
create or replace function public.can_see_sprint(p_sprint_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.sprints s
    where s.id = p_sprint_id
      and (
        public.is_super_admin()
        or public.current_user_role() = 'regional_secretary'
        or public.is_programs_team()
        or s.created_by = auth.uid()
        or public.is_sprint_member(s.id)
        or (s.department_id is not null and s.department_id = public.current_user_department())
        or public.sprint_has_team_in_my_department(s.id)
      )
  )
$$;

-- department_id of a sprint without RLS (used by *_space_access policies)
create or replace function public.can_view_sprint_space(p_sprint_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.sprints s
    where s.id = p_sprint_id
      and s.department_id is not null
      and public.can_see_sprint(s.id)
      and public.can_view_space(s.department_id)
  )
$$;

revoke all on function public.is_group_space_owner(uuid), public.is_group_space_member(uuid),
  public.sprint_has_team_in_my_department(uuid), public.can_see_sprint(uuid), public.can_view_sprint_space(uuid) from public;
grant execute on function public.is_group_space_owner(uuid), public.is_group_space_member(uuid),
  public.sprint_has_team_in_my_department(uuid), public.can_see_sprint(uuid), public.can_view_sprint_space(uuid)
  to authenticated, service_role;

-- group_space_members_select: owner check via helper (no departments RLS)
drop policy if exists group_space_members_select on public.group_space_members;
create policy group_space_members_select on public.group_space_members for select using (
  public.current_user_role() = 'super_admin'
  or user_id = auth.uid()
  or public.is_group_space_owner(group_space_id)
);

-- departments_select: same as 20271003000006 but group clause uses the helper with the correct join
drop policy if exists departments_select on public.departments;
create policy departments_select on public.departments for select using (
  public.current_user_role() in ('super_admin', 'regional_secretary')
  or (space_type = 'personal' and owner_id = auth.uid())
  or (space_type = 'department' and (
        id = public.current_user_department()
        or (public.is_programs_team() and name in ('Media', 'Admin', 'PFCC'))
      ))
  or (space_type = 'group' and (owner_id = auth.uid() or public.is_group_space_member(id)))
  or (space_type in ('program', 'sandbox') and (
        public.current_user_role() in ('super_admin', 'dept_lead', 'regional_secretary')
        or visibility = 'org'
      ))
);

drop policy if exists sprints_select on public.sprints;
create policy sprints_select on public.sprints for select using (
  public.is_super_admin()
  or public.current_user_role() = 'regional_secretary'
  or public.is_programs_team()
  or created_by = auth.uid()
  or public.is_sprint_member(id)
  or (department_id is not null and department_id = public.current_user_department())
  or public.sprint_has_team_in_my_department(id)
);

drop policy if exists sprint_teams_select_space_access on public.sprint_teams;
create policy sprint_teams_select_space_access on public.sprint_teams for select using (
  sprint_id is null or public.can_view_sprint_space(sprint_id)
);

drop policy if exists sprint_members_select_space_access on public.sprint_members;
create policy sprint_members_select_space_access on public.sprint_members for select using (
  public.can_view_sprint_space(sprint_id)
);

-- Cycle 3: sprint_teams_select -> sprint_team_members (RLS) -> sprint_team_members_select -> sprint_teams (RLS)
create or replace function public.is_sprint_team_member(p_team_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.sprint_team_members stm
    where stm.team_id = p_team_id and stm.user_id = auth.uid()
  )
$$;

-- team's sprint membership / space visibility, evaluated without RLS on sprint_teams
create or replace function public.can_read_sprint_team_members(p_team_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.sprint_teams st
    where st.id = p_team_id
      and (
        public.is_sprint_member(st.sprint_id)
        or exists (
          select 1 from public.sprints s
          where s.id = st.sprint_id and s.department_id is not null
            and public.can_see_sprint(s.id) and public.can_view_space(s.department_id)
        )
      )
  )
$$;

revoke all on function public.is_sprint_team_member(uuid), public.can_read_sprint_team_members(uuid) from public;
grant execute on function public.is_sprint_team_member(uuid), public.can_read_sprint_team_members(uuid) to authenticated, service_role;

drop policy if exists sprint_teams_select on public.sprint_teams;
create policy sprint_teams_select on public.sprint_teams for select using (
  public.has_sprint_viewer_privilege()
  or public.is_sprint_member(sprint_id)
  or public.is_sprint_team_member(id)
);

drop policy if exists sprint_team_members_select on public.sprint_team_members;
create policy sprint_team_members_select on public.sprint_team_members for select using (
  public.is_super_admin()
  or user_id = auth.uid()
  or public.can_read_sprint_team_members(team_id)
);

-- Cycle 4: users_select_pastor_members -> pastor_members (RLS) -> pastor_members_select_scope -> users (RLS)
-- Every authenticated read of public.users (and so of everything whose policy reads users) hit this.
create or replace function public.pastor_pair_in_my_department(p_pastor_id uuid, p_member_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.users pastors
    join public.users members on members.id = p_member_id
    where pastors.id = p_pastor_id
      and pastors.department_id = public.current_user_department()
      and members.department_id = public.current_user_department()
  )
$$;
revoke all on function public.pastor_pair_in_my_department(uuid, uuid) from public;
grant execute on function public.pastor_pair_in_my_department(uuid, uuid) to authenticated, service_role;

drop policy if exists pastor_members_select_scope on public.pastor_members;
create policy pastor_members_select_scope on public.pastor_members for select to authenticated using (
  pastor_id = auth.uid()
  or member_id = auth.uid()
  or public.current_user_role() = 'super_admin'
  or (public.current_user_role() = 'dept_lead' and public.pastor_pair_in_my_department(pastor_id, member_id))
);

-- Cycle 5 (runtime): users_select_authenticated calls current_user_can_bypass_department(), which was a
-- plain (SECURITY INVOKER) function selecting from public.users. Executed under RLS it re-enters
-- users_select_authenticated for every visible row -> "stack depth limit exceeded" for any
-- authenticated non-admin reading a populated users table (and every policy that calls it).
-- Same pattern as current_user_role()/current_user_department(): SECURITY DEFINER, pinned search_path.
create or replace function public.current_user_can_bypass_department()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.users where id = auth.uid())
    in ('super_admin', 'regional_secretary'),
    false
  )
$$;
