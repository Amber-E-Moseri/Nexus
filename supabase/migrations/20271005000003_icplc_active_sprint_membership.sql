-- ICPLC: an expired temporary sprint membership, or an inactive account, no longer authorizes
--
-- DECISION (product): an expired temporary Sprint membership must NOT keep granting Sprint- or Sprint-Team-derived
-- ICPLC access, and authorization must not depend only on the daily clean-up job eventually setting the user inactive.
--
-- WHAT "EXPIRED" MEANS (preserved from the existing code, not invented): sprint_members.membership_end_date is a DATE.
-- A membership is expired when is_temporary = true AND membership_end_date IS NOT NULL AND membership_end_date <=
-- current_date (end date inclusive). This is exactly what is_temp_member_expired() (20260619000001) and the daily
-- deactivate-temporary-members job (.lte('membership_end_date', today)) already use.
--
-- ONE CANONICAL CONCEPT (new, here, not copied into each function):
--   sprint_membership_is_expired(is_temporary, end_date)   the predicate above
--   sprint_member_is_expired(sprint, user)                 a sprint_members row exists for the pair AND it is expired
--   is_active_account(user)                                users.status = 'active'
--   is_active_sprint_member(sprint, user)                  active account AND a sprint_members row that is not expired
--   icplc_event_team_memberships_for(user, event, incl_archived)  the ONE shared team-membership source for ICPLC
--
-- RULES for ICPLC sprint-derived access
--   * direct sprint member arm: needs an ACTIVE sprint membership (is_active_sprint_member).
--   * team arm: needs the team membership AND an active account AND the person's sprint membership in that sprint must not
--     be expired. A team-only member (no sprint_members row at all, the normal way people are added to teams) is not
--     blocked: absence of a row is not expiry.
--   * team membership rows are NEVER deleted or changed by expiry; they stay as configuration/history and simply do not
--     authorize while the parent sprint membership is expired. Renewing (a later end date, or non-temporary) restores access.
--   * an account whose status is not 'active' (inactive, archived, invited, pending_activation) has no sprint- or
--     team-derived ICPLC access.
--
-- NOT CHANGED (deliberately): platform roles (super_admin, regional_secretary), the Programs department, the service
-- role, Group Pastor access (participant-derived, not sprint-derived; see the hardening doc), the generic sprint
-- authorization used elsewhere in Nexus (is_sprint_member() is untouched), and no row is deleted or updated.
--
-- The CMP Edge Functions call icplc_user_team_can_write() below instead of re-implementing membership in TypeScript, so
-- the database and the functions cannot disagree.

create or replace function public.sprint_membership_is_expired(p_is_temporary boolean, p_end_date date)
  returns boolean language sql stable set search_path = public, pg_catalog as $$
    select coalesce(p_is_temporary, false) and p_end_date is not null and p_end_date <= current_date
  $$;

create or replace function public.is_active_account(p_user_id uuid default auth.uid())
  returns boolean language sql stable security definer set search_path = public, pg_catalog as $$
    select exists (select 1 from public.users u where u.id = p_user_id and u.status = 'active')
  $$;

create or replace function public.sprint_member_is_expired(p_sprint_id uuid, p_user_id uuid)
  returns boolean language sql stable security definer set search_path = public, pg_catalog as $$
    select exists (
      select 1 from public.sprint_members sm
      where sm.sprint_id = p_sprint_id and sm.user_id = p_user_id
        and public.sprint_membership_is_expired(sm.is_temporary, sm.membership_end_date)
    )
  $$;

create or replace function public.is_active_sprint_member(p_sprint_id uuid, p_user_id uuid default auth.uid())
  returns boolean language sql stable security definer set search_path = public, pg_catalog as $$
    select public.is_active_account(p_user_id) and exists (
      select 1 from public.sprint_members sm
      where sm.sprint_id = p_sprint_id and sm.user_id = p_user_id
        and not public.sprint_membership_is_expired(sm.is_temporary, sm.membership_end_date)
    )
  $$;

-- The single shared source of "which teams does this person hold for this event's sprint" (set semantics, no primary team).
create or replace function public.icplc_event_team_memberships_for(p_user_id uuid, p_event_id uuid, p_include_archived boolean default false)
  returns table (team_id uuid, team_name text) language sql security definer stable
  set search_path = public, pg_catalog as $$
    select st.id, st.name
    from public.sprint_teams st
    join public.sprint_team_members stm on stm.team_id = st.id
    where p_event_id is not null
      and p_user_id is not null
      and public.is_active_account(p_user_id)
      and st.sprint_id in (select public.icplc_event_sprint_ids(p_event_id))
      and stm.user_id = p_user_id
      and not public.sprint_member_is_expired(st.sprint_id, p_user_id)
      and (p_include_archived or st.is_archived is not true)
  $$;

create or replace function public.icplc_event_team_memberships(p_event_id uuid, p_include_archived boolean default false)
  returns table (team_id uuid, team_name text) language sql security definer stable
  set search_path = public, pg_catalog as $$
    select m.team_id, m.team_name from public.icplc_event_team_memberships_for(auth.uid(), p_event_id, p_include_archived) m
  $$;

create or replace function public.icplc_is_sprint_member(p_event_id uuid)
  returns boolean language sql security definer stable
  set search_path = public, pg_catalog as $$
    select auth.uid() is not null and p_event_id is not null and exists (
      select 1 from public.icplc_event_sprint_ids(p_event_id) s(sprint_id)
      where public.is_active_sprint_member(s.sprint_id, auth.uid())
    )
  $$;

-- For the CMP Edge Functions (service role): the same team rule the write/import helpers use, for an explicit user.
create or replace function public.icplc_user_team_can_write(p_user_id uuid, p_event_id uuid)
  returns boolean language sql security definer stable
  set search_path = public, pg_catalog as $$
    select exists (
      select 1 from public.icplc_event_team_memberships_for(p_user_id, p_event_id, false) m
      where m.team_name not ilike '%Finance%'
        and m.team_name not ilike '%Transportation%'
        and m.team_name not ilike '%Accommodation%'
        and m.team_name not ilike '%Hospitality%'
    )
  $$;

-- Helpers that take an explicit user id would let any signed-in user probe someone else's access: service role only.
revoke execute on function public.icplc_event_team_memberships_for(uuid, uuid, boolean) from anon, authenticated, public;
revoke execute on function public.icplc_user_team_can_write(uuid, uuid) from anon, authenticated, public;
revoke execute on function public.is_active_sprint_member(uuid, uuid) from anon, authenticated, public;
revoke execute on function public.is_active_account(uuid) from anon, authenticated, public;
revoke execute on function public.sprint_member_is_expired(uuid, uuid) from anon, authenticated, public;
grant  execute on function public.icplc_event_team_memberships_for(uuid, uuid, boolean) to service_role;
grant  execute on function public.icplc_user_team_can_write(uuid, uuid) to service_role;
grant  execute on function public.sprint_member_is_expired(uuid, uuid) to service_role;
grant  execute on function public.is_active_account(uuid) to service_role;
grant  execute on function public.is_active_sprint_member(uuid, uuid) to service_role;
revoke execute on function public.icplc_event_team_memberships(uuid, boolean) from anon, public;
grant  execute on function public.icplc_event_team_memberships(uuid, boolean) to authenticated;
