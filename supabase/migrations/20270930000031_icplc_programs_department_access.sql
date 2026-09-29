-- ICPLC: everyone in the Programs department gets full access (read, write, import),
-- without needing to be on the ICPLC sprint team. Sprint-team rules are unchanged; Programs is ADDED.
-- Finance-only / Transportation / Accommodation / Hospitality restrictions still apply to sprint-team-only members.
--
-- Programs = departments.is_programs (durable flag, 20260930000002), falling back to the name so the
-- helper still works if the flag was never backfilled.

create or replace function public.icplc_is_programs_member()
  returns boolean language sql security definer stable
  set search_path = public, pg_catalog as $$
    select exists (
      select 1
      from public.users u
      join public.departments d on d.id = u.department_id
      where u.id = auth.uid()
        and (d.is_programs = true or lower(d.name) = 'programs')
    )
  $$;

revoke execute on function public.icplc_is_programs_member() from anon, public;
grant  execute on function public.icplc_is_programs_member() to authenticated;

create or replace function public.icplc_can_read_participants()
  returns boolean language sql security definer stable
  set search_path = public, pg_catalog as $$
    select (
      public.current_user_role() in ('super_admin', 'regional_secretary')
      or public.icplc_is_programs_member()
      or exists (
        select 1
        from public.event_configs ec
        join public.sprints s    on s.name ilike ec.sprint_pattern
        join public.sprint_teams st  on st.sprint_id = s.id
        join public.sprint_team_members stm on stm.team_id = st.id
        where ec.event_name ilike '%ICPLC%'
          and stm.user_id = auth.uid()
          and st.name not ilike '%Finance%'
      )
    )
  $$;

create or replace function public.icplc_can_write_participants()
  returns boolean language sql security definer stable
  set search_path = public, pg_catalog as $$
    select (
      public.current_user_role() in ('super_admin', 'regional_secretary')
      or public.icplc_is_programs_member()
      or exists (
        select 1
        from public.event_configs ec
        join public.sprints s           on s.name ilike ec.sprint_pattern
        join public.sprint_teams st         on st.sprint_id = s.id
        join public.sprint_team_members stm on stm.team_id = st.id
        where ec.event_name ilike '%ICPLC%'
          and stm.user_id = auth.uid()
          and st.name not ilike '%Finance%'
          and st.name not ilike '%Transportation%'
          and st.name not ilike '%Accommodation%'
          and st.name not ilike '%Hospitality%'
      )
    )
  $$;

create or replace function public.icplc_can_import()
  returns boolean language sql security definer stable
  set search_path = public, pg_catalog as $$
    select (
      public.current_user_role() in ('super_admin', 'regional_secretary')
      or public.icplc_is_programs_member()
      or exists (
        select 1
        from public.event_configs ec
        join public.sprints s           on s.name ilike ec.sprint_pattern
        join public.sprint_teams st         on st.sprint_id = s.id
        join public.sprint_team_members stm on stm.team_id = st.id
        where ec.event_name ilike '%ICPLC%'
          and stm.user_id = auth.uid()
          and st.name not ilike '%Finance%'
          and st.name not ilike '%Transportation%'
          and st.name not ilike '%Accommodation%'
          and st.name not ilike '%Hospitality%'
      )
    )
  $$;
