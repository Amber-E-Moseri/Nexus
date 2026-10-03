-- event_configs.sprint_id: the explicit, authoritative event -> sprint relationship
--
-- WHY
--   Before this migration an event reached its sprint only through `sprints.name ILIKE event_configs.sprint_pattern`.
--   Nothing in the schema (event_configs, sprints, calendar, registration tables) carried a real event<->sprint link.
--   A name pattern is a discovery heuristic, not a security boundary: two events whose patterns overlap (the default
--   '%ICPLC%'), or two similarly named sprints, silently share one membership set.
--
-- WHAT
--   1. event_configs.sprint_id  -> sprints(id), NULLABLE. No backfill: nothing here guesses a production mapping.
--   2. A plain (non-unique) index for the FK / ON DELETE SET NULL lookups. Cardinality is: each event has AT MOST ONE
--      explicitly configured sprint (single column); many events MAY reference one sprint. one-event-per-sprint is not
--      a Nexus domain invariant (sprints are generic work containers; an event config can be duplicated as a draft,
--      archived and re-activated, or two programs can deliberately share one organising sprint). Sharing is safe
--      because it can only be created by an explicit super_admin write; the accident this column removes was an
--      OVERLAPPING NAME PATTERN, and that no longer exists. Sharing a sprint shares its team memberships between those
--      events by the admin's explicit choice.
--   3. icplc_event_sprint_ids(event) -- the single choke point behind every F2 event-scoped helper, policy and RPC
--      guard -- now resolves ONLY through sprint_id. sprint_pattern no longer takes part in authorization.
--
-- FAIL CLOSED
--   sprint_id IS NULL  ->  the event resolves to NO sprint  ->  no sprint-derived access (team or direct sprint member).
--   There is no pattern fallback. Platform roles (super_admin, regional_secretary) and the Programs department are
--   event-independent by design and are unaffected.
--   Consequence: after this migration, an ICPLC event gives sprint-derived access only once someone sets its
--   sprint_id. That is deliberate; see CONFIGURING below.
--
-- WHAT IS NOT CHANGED
--   * sprint_pattern stays (NOT NULL): it is still used by UI discovery, the legacy pages and as the default
--     for cloned templates. It simply no longer decides database authorization.
--   * Multi-team semantics: membership is still evaluated as a set over sprint_team_members for the event's sprint.
--     Nothing here reads sprint_members.sprint_team_id; there is no primary team.
--   * No teams are created, no people assigned, no data written.
--   * Cloning a template (activate_event_from_template) lists its columns explicitly and does not copy sprint_id, so a
--     new event starts unlinked and must be configured on its own sprint.
--
-- CONFIGURING (super_admin, one event at a time, after verifying the sprint by id):
--   -- candidates are suggestions only, never applied automatically:
--   --   select ec.id, ec.event_name, s.id as sprint_id, s.name
--   --   from public.event_configs ec left join public.sprints s on s.name ilike ec.sprint_pattern
--   --   where ec.event_name ilike '%ICPLC%' order by 1, 4;
--   --   update public.event_configs set sprint_id = '<sprint uuid>' where id = '<event uuid>';

alter table public.event_configs
  add column if not exists sprint_id uuid references public.sprints(id) on delete set null;

comment on column public.event_configs.sprint_id is
  'Authoritative event -> sprint link used by ICPLC authorization. NULL = unconfigured: sprint-derived access fails closed. '
  'sprint_pattern is legacy/discovery only and never decides authorization.';

create index if not exists event_configs_sprint_id_idx
  on public.event_configs (sprint_id)
  where sprint_id is not null;

-- Same signature, volatility and grants as the F2 definition; only the resolution changes.
-- The ICPLC event-name guard is kept: it can only narrow what resolves, never widen it.
create or replace function public.icplc_event_sprint_ids(p_event_id uuid)
  returns setof uuid language sql security definer stable
  set search_path = public, pg_catalog as $$
    select s.id
    from public.event_configs ec
    join public.sprints s on s.id = ec.sprint_id
    where ec.id = p_event_id
      and ec.sprint_id is not null
      and ec.event_name ilike '%ICPLC%'
  $$;

revoke execute on function public.icplc_event_sprint_ids(uuid) from anon, public;
grant  execute on function public.icplc_event_sprint_ids(uuid) to authenticated;
