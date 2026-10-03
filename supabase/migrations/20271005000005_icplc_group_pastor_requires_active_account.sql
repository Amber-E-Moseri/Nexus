-- ICPLC: a Group Pastor's subgroup access requires an ACTIVE account
--
-- DECISION: an inactive Group Pastor must not keep ICPLC subgroup access. The participant record still identifies them as a
-- Group Pastor (nothing is deleted or altered when the account stops being active); operational authorization additionally
-- needs an active account, using the same canonical is_active_account() introduced in 20271005000003.
--   active GP + valid participant-derived relationship  -> existing GP access
--   inactive / archived / invited / pending_activation  -> no GP-derived access
--   reactivated                                          -> access resumes if the relationship is still valid
--
-- WHERE IT APPLIES: only the two policy arms that GRANT read access to a Group Pastor (participants and participant tags).
-- icplc_gp_is_authorized() itself is NOT changed, because it is also used as a RESTRICTION ("a group pastor may not write or
-- import"); making it depend on account status would loosen those restrictions. Ambiguous/duplicate GP mappings keep their
-- existing fail-closed behaviour (icplc_gp_is_authorized requires exactly one valid Group Pastor row).
--
-- Not changed: platform roles, the Programs department, the service role, the generic-member and team arms, writes.

create or replace function public.icplc_gp_has_active_access(p_event_id uuid)
  returns boolean language sql stable security definer
  set search_path = public, pg_catalog as $$
    select auth.uid() is not null
      and public.is_active_account(auth.uid())
      and coalesce(public.icplc_gp_is_authorized(p_event_id), false)
  $$;
revoke execute on function public.icplc_gp_has_active_access(uuid) from anon, public;
grant  execute on function public.icplc_gp_has_active_access(uuid) to authenticated;

drop policy if exists icplc_participants_read on public.icplc_participants;
create policy icplc_participants_read on public.icplc_participants
  for select to authenticated
  using (
    public.icplc_can_read_participants(event_id)
    or (
      public.icplc_is_sprint_member(event_id)
      and not public.icplc_has_event_team_membership(event_id)
      and public.icplc_gp_is_authorized(event_id) is not true
    )
    -- Group Pastor: own subgroup of own event only, and only while the account is active
    or (public.icplc_gp_has_active_access(event_id) and subgroup = public.icplc_gp_subgroup(event_id))
  );

drop policy if exists icplc_participant_tags_read on public.icplc_participant_tags;
create policy icplc_participant_tags_read on public.icplc_participant_tags
  for select to authenticated
  using (
    exists (
      select 1 from public.icplc_participants p
      where p.id = icplc_participant_tags.participant_id
        and (
          public.icplc_can_read_participants(p.event_id)
          or (public.icplc_gp_has_active_access(p.event_id) and p.subgroup = public.icplc_gp_subgroup(p.event_id))
        )
    )
  );
