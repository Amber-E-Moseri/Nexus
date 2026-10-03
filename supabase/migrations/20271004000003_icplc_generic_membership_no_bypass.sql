-- ICPLC: generic sprint membership must not bypass an explicit access restriction (F1, narrow)
--
-- PROBLEM (proven against the real policy SQL, see src/tests/icplc/genericMembershipBypass.test.js)
--   icplc_participants_read has an arm for "direct sprint members" (20271003000002) meant for contributors who are on
--   the sprint but on NO named team. The arm only checked sprint_members, so it also admitted people who DO hold team
--   memberships. The team arm deliberately excludes Finance teams from reading participants; a Finance-only person
--   who is also a sprint_members row (which is how people are normally added to a sprint) passed the generic arm and
--   read every participant, including passport / visa / immigration columns.
--
-- FIX (set semantics only; no assumption about the final team structure)
--   The generic arm now applies only to a person with NO team membership in the event's sprint(s). Once a person holds
--   ANY team membership, the team rules decide, exactly as for every other team member:
--     * zero teams        -> unchanged: generic sprint contributor, may read (as designed in 20271003000002)
--     * one team          -> that team's rule applies (a Finance-only person is no longer admitted by the generic arm)
--     * several teams     -> the team arm grants access if ANY of their teams grants it; order is irrelevant, so
--                            Finance + another operational team keeps the access the other team grants
--     * future teams / membership changes are picked up immediately (evaluated per query, nothing is copied or cached)
--   No team or team name is mentioned here. The only name-based rule remains the one already in the team arm
--   (icplc_can_read_participants), untouched.
--
-- ASSUMPTION (documented, not hidden): "assigned to at least one team" means "governed by team rules". Until sprint
-- teams are populated, nobody has a team membership, so every current generic sprint member keeps today's access.
--
-- NOT CHANGED: write access (the generic arm is read-only), Group Pastor scoping, platform roles, event scoping (F2),
-- and which columns a reader sees (sensitive-column access is a separate, deferred change).

drop policy if exists icplc_participants_read on public.icplc_participants;
create policy icplc_participants_read on public.icplc_participants
  for select to authenticated
  using (
    -- team arm / platform roles / Programs department (rules unchanged)
    public.icplc_can_read_participants(event_id)

    -- generic sprint contributor with NO team membership in this event's sprint(s)
    or (
      public.icplc_is_sprint_member(event_id)
      and not public.icplc_has_event_team_membership(event_id)
      and public.icplc_gp_is_authorized(event_id) is not true
    )

    -- Group Pastor: own subgroup of own event only
    or (public.icplc_gp_is_authorized(event_id) and subgroup = public.icplc_gp_subgroup(event_id))
  );
