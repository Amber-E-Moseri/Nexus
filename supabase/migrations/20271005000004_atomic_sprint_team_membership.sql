-- Atomic Sprint Team membership operations (and a safe, deliberate reconciliation)
--
-- PROBLEM (proven by src/tests/icplc/teamInfrastructure.test.js): the replace-set API (delete the person's teams in the
-- sprint, then insert the full list the caller believes is right) silently loses concurrent changes: staff 1 adds C, staff
-- 2 acts on a stale A+B view and adds D -> A+B+D, C lost; a stale view also resurrects a removed membership. It is also two
-- non-transactional statements, so a failing insert after the delete leaves the person with no teams.
--
-- THESE OPERATIONS each change exactly ONE relationship, so concurrent operations on different teams cannot undo each other:
--   add_sprint_team_member(sprint, team, user, role)     idempotent (already a member -> false, nothing written)
--   remove_sprint_team_member(sprint, team, user)        idempotent (not a member -> false, nothing written)
-- and, for a deliberate bulk/reconciliation workflow only:
--   reconcile_sprint_member_teams(sprint, user, desired[], expected[])
--     one transaction; every desired team must belong to the sprint; serialized per person+sprint; REFUSES (SQLSTATE 40001,
--     'stale_membership_state') if the person's current teams differ from the caller's `expected` view, so stale state can
--     never overwrite newer changes; applies only the difference.
--
-- AUTHORIZATION: SECURITY DEFINER with an explicit check, the established pattern of delete_sprint_team(): the caller must
-- be a super_admin, or can_manage_sprint(sprint) (sprint creator / owner / manager / regional secretary / Programs), or the
-- creator of the team; the service role is exempt. This is deliberately NARROWER than the table policy
-- sprint_team_members_write, which lets any dept_lead write any sprint's teams. Row-level RLS on the table is not relied on
-- (and not changed).
--
-- VALIDATION: the team must exist and belong to the stated sprint. A sprint_members row is NOT required: people who are
-- added only to a team (no sprint-wide membership) are an established pattern in Nexus.
-- AUDIT: the row-level trigger from 20271005000002 writes one added/removed event per membership row that really changes;
-- a no-op writes nothing, and a reconcile writes one event per row it adds or removes, never a whole-set event.
--
-- DRIFT SHIM (temporary, remove once production is verified): application code has historically inserted a sprint_id into
-- sprint_team_members, a column the migration chain never creates. If a database nevertheless has it, the insert below
-- fills it from the team so the functions work in both worlds. The column is never created or required here.

create or replace function public._assert_can_manage_sprint_team(p_sprint_id uuid, p_team_creator uuid)
  returns void language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then return; end if;
  if auth.uid() is null then
    raise exception 'permission denied: authentication required' using errcode = '42501';
  end if;
  -- explicit IS NOT TRUE: a NULL term (e.g. a team with no creator) must deny, never fall through
  if (
    coalesce(public.current_user_role() = 'super_admin', false)
    or coalesce(public.can_manage_sprint(p_sprint_id), false)
    or coalesce(p_team_creator = auth.uid(), false)
  ) is not true then
    raise exception 'permission denied: you cannot manage teams in this sprint' using errcode = '42501';
  end if;
end;
$$;

create or replace function public._insert_sprint_team_member(p_sprint_id uuid, p_team_id uuid, p_user_id uuid, p_role text)
  returns integer language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_n integer;
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'sprint_team_members' and column_name = 'sprint_id') then
    execute 'insert into public.sprint_team_members (team_id, user_id, role, sprint_id) values ($1, $2, $3, $4) on conflict (team_id, user_id) do nothing'
      using p_team_id, p_user_id, p_role, p_sprint_id;
  else
    insert into public.sprint_team_members (team_id, user_id, role) values (p_team_id, p_user_id, p_role)
    on conflict (team_id, user_id) do nothing;
  end if;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create or replace function public.add_sprint_team_member(p_sprint_id uuid, p_team_id uuid, p_user_id uuid, p_role text default null)
  returns boolean language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_team_sprint uuid; v_creator uuid;
begin
  select st.sprint_id, st.created_by into v_team_sprint, v_creator from public.sprint_teams st where st.id = p_team_id;
  if not found then raise exception 'team not found' using errcode = 'P0002'; end if;
  if v_team_sprint is distinct from p_sprint_id then
    raise exception 'team does not belong to this sprint' using errcode = '22023';
  end if;
  perform public._assert_can_manage_sprint_team(p_sprint_id, v_creator);
  if not exists (select 1 from public.users u where u.id = p_user_id) then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  return public._insert_sprint_team_member(p_sprint_id, p_team_id, p_user_id, p_role) = 1;
end;
$$;

create or replace function public.remove_sprint_team_member(p_sprint_id uuid, p_team_id uuid, p_user_id uuid)
  returns boolean language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_team_sprint uuid; v_creator uuid; v_n integer;
begin
  select st.sprint_id, st.created_by into v_team_sprint, v_creator from public.sprint_teams st where st.id = p_team_id;
  if not found then raise exception 'team not found' using errcode = 'P0002'; end if;
  if v_team_sprint is distinct from p_sprint_id then
    raise exception 'team does not belong to this sprint' using errcode = '22023';
  end if;
  perform public._assert_can_manage_sprint_team(p_sprint_id, v_creator);
  delete from public.sprint_team_members where team_id = p_team_id and user_id = p_user_id;
  get diagnostics v_n = row_count;
  return v_n = 1;
end;
$$;

create or replace function public.reconcile_sprint_member_teams(p_sprint_id uuid, p_user_id uuid, p_desired uuid[], p_expected uuid[])
  returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_desired  uuid[] := coalesce((select array_agg(distinct t) from unnest(p_desired) t where t is not null), '{}');
  v_expected uuid[] := coalesce((select array_agg(distinct t) from unnest(p_expected) t where t is not null), '{}');
  v_current  uuid[];
  v_add      uuid[];
  v_remove   uuid[];
  v_team     uuid;
begin
  if p_expected is null then
    raise exception 'expected team set is required (optimistic concurrency)' using errcode = '22023';
  end if;
  if not exists (select 1 from public.sprints s where s.id = p_sprint_id) then
    raise exception 'sprint not found' using errcode = 'P0002';
  end if;
  perform public._assert_can_manage_sprint_team(p_sprint_id, null);
  if not exists (select 1 from public.users u where u.id = p_user_id) then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from unnest(v_desired) d where not exists (select 1 from public.sprint_teams st where st.id = d and st.sprint_id = p_sprint_id)) then
    raise exception 'a requested team does not belong to this sprint' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_sprint_id::text || ':' || p_user_id::text, 0));
  select coalesce(array_agg(stm.team_id), '{}') into v_current
  from public.sprint_team_members stm join public.sprint_teams st on st.id = stm.team_id
  where st.sprint_id = p_sprint_id and stm.user_id = p_user_id;
  if (select coalesce(array_agg(x order by x), '{}') from unnest(v_current) x) is distinct from (select coalesce(array_agg(x order by x), '{}') from unnest(v_expected) x) then
    raise exception 'stale_membership_state: the person''s teams changed since they were loaded' using errcode = '40001';
  end if;
  v_add    := coalesce((select array_agg(d) from unnest(v_desired) d where d <> all (v_current)), '{}');
  v_remove := coalesce((select array_agg(c) from unnest(v_current) c where c <> all (v_desired)), '{}');
  foreach v_team in array v_remove loop
    delete from public.sprint_team_members where team_id = v_team and user_id = p_user_id;
  end loop;
  foreach v_team in array v_add loop
    perform public._insert_sprint_team_member(p_sprint_id, v_team, p_user_id, null);
  end loop;
  return jsonb_build_object('added', to_jsonb(v_add), 'removed', to_jsonb(v_remove));
end;
$$;

revoke execute on function public._assert_can_manage_sprint_team(uuid, uuid) from anon, authenticated, public;
revoke execute on function public._insert_sprint_team_member(uuid, uuid, uuid, text) from anon, authenticated, public;
revoke execute on function public.add_sprint_team_member(uuid, uuid, uuid, text) from anon, public;
revoke execute on function public.remove_sprint_team_member(uuid, uuid, uuid) from anon, public;
revoke execute on function public.reconcile_sprint_member_teams(uuid, uuid, uuid[], uuid[]) from anon, public;
grant  execute on function public.add_sprint_team_member(uuid, uuid, uuid, text) to authenticated, service_role;
grant  execute on function public.remove_sprint_team_member(uuid, uuid, uuid) to authenticated, service_role;
grant  execute on function public.reconcile_sprint_member_teams(uuid, uuid, uuid[], uuid[]) to authenticated, service_role;
