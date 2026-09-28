-- Allow registration team members and programs/secretariat team members to update
-- registrations (manually_confirmed column) for TII 2.0 manual confirmation.
-- Also covers users with an explicit registration_full_access grant (e.g. David Akalue).
-- GUARD: registrations managed by external Apps Script sync

do $$
begin
  if not exists (select 1 from pg_class where relname = 'registrations' and relnamespace = 'public'::regnamespace) then
    raise notice 'Skipping: registrations not yet created';
    return;
  end if;
  if not exists (
    select 1 from pg_policies
    where policyname = 'registration_event_team_update'
      and tablename  = 'registrations'
  ) then
    execute $pol$
    create policy "registration_event_team_update"
      on public.registrations for update
      to authenticated
      using (
        current_user_role() in ('super_admin', 'regional_secretary', 'dept_lead', 'pastor')
        or exists (
          select 1 from public.user_grants ug
          where ug.user_id = auth.uid()
            and ug.grant_type = 'registration_full_access'
        )
        or exists (
          select 1
          from public.sprint_team_members stm
          join public.sprint_teams        st on stm.team_id  = st.id
          join public.sprints              s  on st.sprint_id = s.id
          where stm.user_id = auth.uid()
            and s.name ilike '%This Is It 2.0%'
            and (
              st.name ilike '%Registration%'
              or st.name ilike '%Program%'
              or st.name ilike '%Secretariat%'
            )
        )
      )
      with check (
        current_user_role() in ('super_admin', 'regional_secretary', 'dept_lead', 'pastor')
        or exists (
          select 1 from public.user_grants ug
          where ug.user_id = auth.uid()
            and ug.grant_type = 'registration_full_access'
        )
        or exists (
          select 1
          from public.sprint_team_members stm
          join public.sprint_teams        st on stm.team_id  = st.id
          join public.sprints              s  on st.sprint_id = s.id
          where stm.user_id = auth.uid()
            and s.name ilike '%This Is It 2.0%'
            and (
              st.name ilike '%Registration%'
              or st.name ilike '%Program%'
              or st.name ilike '%Secretariat%'
            )
        )
      )
    $pol$;
  end if;
end $$;
