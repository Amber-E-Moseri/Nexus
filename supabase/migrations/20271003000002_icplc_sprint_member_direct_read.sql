-- Allow direct sprint members (contributors not on any named sub-team) to
-- read ICPLC participants, while preserving Group Pastor subgroup scoping.
--
-- Problem: icplc_can_read_participants() joins through sprint_team_members,
-- so a sprint contributor who is not on any sub-team returns FALSE, blocking
-- their read access entirely. Group Pastors fall into this category.
--
-- Fix: add a new helper icplc_is_sprint_member() that checks sprint_members
-- directly, then rebuild the read policy with three arms:
--
--   1. sprint_team_member (existing icplc_can_read_participants) → full read
--   2. direct sprint member who is NOT a GP                     → full read
--   3. GP (icplc_gp_is_authorized)                             → subgroup only
--
-- Arms 1 and 2 must exclude GPs so that GPs are always forced through arm 3.

-- ── Helper: is the current user a direct member of the ICPLC sprint? ─────────
create or replace function public.icplc_is_sprint_member()
  returns boolean language sql security definer stable
  set search_path = public, pg_catalog as $$
  select auth.uid() is not null and exists (
    select 1
    from public.event_configs ec
    join public.sprints s    on s.name ilike ec.sprint_pattern
    join public.sprint_members sm on sm.sprint_id = s.id
    where ec.event_name ilike '%ICPLC%'
      and sm.user_id = auth.uid()
  )
$$;

grant execute on function public.icplc_is_sprint_member() to authenticated;

-- ── Rebuild read policy ───────────────────────────────────────────────────────
drop policy if exists icplc_participants_read on public.icplc_participants;

create policy icplc_participants_read on public.icplc_participants
  for select to authenticated
  using (
    -- Arm 1: sprint team member (Programs, Secretariat, Finance, Registration…)
    public.icplc_can_read_participants()

    -- Arm 2: direct sprint contributor with no named team, and NOT a GP
    --        (e.g. a pastor who is on the sprint but doesn't belong to a team)
    or (
      public.icplc_is_sprint_member()
      and public.icplc_gp_is_authorized(event_id) is not true
    )

    -- Arm 3: Group Pastor — scoped to their own subgroup only
    or (
      public.icplc_gp_is_authorized(event_id)
      and subgroup = public.icplc_gp_subgroup(event_id)
    )
  );
