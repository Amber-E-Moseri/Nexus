-- Audit trail for Sprint Team membership and for the event -> sprint authorization link (activity_log)
--
-- Before real ICPLC teams are populated, every change to who is on a team, and every change to which sprint an event
-- trusts, must be reconstructable. This reuses the existing activity_log (no second audit system) and is done with
-- database triggers so UI, RPC and direct authorized SQL all leave a record.
--
-- sprint_team_member_added / sprint_team_member_removed     entity_type 'sprint_team', entity_id = team id
--   One row per membership row that changes. Adding a person to Team 2 never touches Team 1's rows, and removing them
--   from Team 1 writes a removal for Team 1 only: the log never implies a person's whole team set changed.
-- sprint_team_created / _deleted / _archived / _unarchived / _sprint_changed   entity_type 'sprint_team'
--   Archiving (and moving a team to another sprint) changes authorization, so it is recorded too.
-- event_sprint_link_changed                                 entity_type 'event_config', entity_id = event id
--   previous_sprint_id -> new_sprint_id with operation linked | unlinked | relinked. Includes the system unlink
--   caused by deleting a linked sprint (FK ON DELETE SET NULL). No other event_configs column is recorded.
--
-- Metadata is structural ids only: actor, affected user id, sprint, team (id + label), operation, source. It never
-- contains emails, names of people, or participant data. user_id is the authenticated actor when there is one
-- (auth.uid()), NULL for system / service-role work; metadata.source distinguishes 'app' from 'system'.
-- The sprint of a membership is read from the team (sprint_team_members itself carries no sprint pointer here); for a
-- membership removed by the cascade of a raw team delete the team row is already gone, so sprint_id/team_name are null.
--
-- Nothing here changes authorization. No data is read or written by the migration itself.

create or replace function public.audit_actor()
  returns uuid language sql stable security definer set search_path = public, pg_catalog as $$
    select u.id from public.users u where u.id = auth.uid()
  $$;

create or replace function public.audit_sprint_team_member_change()
  returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_actor  uuid := auth.uid();
  v_source text := coalesce(nullif(current_setting('nexus.change_source', true), ''), case when auth.uid() is null then 'system' else 'app' end);
  v_row    record;
  v_op     text;
  v_sprint uuid;
  v_name   text;
  v_meta   jsonb;
begin
  for v_row in
    select * from (
      select 'removed'::text as op, OLD.team_id as team_id, OLD.user_id as user_id where TG_OP in ('DELETE', 'UPDATE')
      union all
      select 'added'::text, NEW.team_id, NEW.user_id where TG_OP in ('INSERT', 'UPDATE')
    ) x
    -- an UPDATE only counts as a membership change if it moves the row to another team or person
    where TG_OP <> 'UPDATE' or (OLD.team_id is distinct from NEW.team_id or OLD.user_id is distinct from NEW.user_id)
  loop
    select st.sprint_id, st.name into v_sprint, v_name from public.sprint_teams st where st.id = v_row.team_id;
    v_meta := jsonb_build_object(
      'actor_id', v_actor, 'affected_user_id', v_row.user_id, 'operation', v_row.op, 'source', v_source,
      'sprint_id', v_sprint, 'team_id', v_row.team_id, 'team_name', v_name);
    if v_actor is null then v_meta := v_meta - 'actor_id'; end if;
    insert into public.activity_log (user_id, action, entity_type, entity_id, metadata)
    values (public.audit_actor(), 'sprint_team_member_' || v_row.op, 'sprint_team', v_row.team_id, v_meta);
  end loop;
  return null;
end;
$$;

drop trigger if exists sprint_team_members_audit on public.sprint_team_members;
create trigger sprint_team_members_audit
  after insert or update or delete on public.sprint_team_members
  for each row execute function public.audit_sprint_team_member_change();

create or replace function public.audit_sprint_team_change()
  returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_actor  uuid := auth.uid();
  v_source text := coalesce(nullif(current_setting('nexus.change_source', true), ''), case when auth.uid() is null then 'system' else 'app' end);
  v_action text;
  v_meta   jsonb;
  v_row    public.sprint_teams;
begin
  v_row := case when TG_OP = 'DELETE' then OLD else NEW end;
  v_meta := jsonb_build_object('actor_id', v_actor, 'source', v_source, 'sprint_id', v_row.sprint_id, 'team_id', v_row.id, 'team_name', v_row.name);
  if TG_OP = 'INSERT' then
    v_action := 'sprint_team_created';
  elsif TG_OP = 'DELETE' then
    v_action := 'sprint_team_deleted';
  else
    if coalesce(OLD.is_archived, false) is distinct from coalesce(NEW.is_archived, false) then
      insert into public.activity_log (user_id, action, entity_type, entity_id, metadata)
      values (public.audit_actor(),
              case when coalesce(NEW.is_archived, false) then 'sprint_team_archived' else 'sprint_team_unarchived' end,
              'sprint_team', NEW.id, case when v_actor is null then v_meta - 'actor_id' else v_meta end);
    end if;
    if OLD.sprint_id is distinct from NEW.sprint_id then
      v_action := 'sprint_team_sprint_changed';
      v_meta := v_meta || jsonb_build_object('previous_sprint_id', OLD.sprint_id, 'new_sprint_id', NEW.sprint_id);
    end if;
  end if;
  if v_action is not null then
    if v_actor is null then v_meta := v_meta - 'actor_id'; end if;
    insert into public.activity_log (user_id, action, entity_type, entity_id, metadata)
    values (public.audit_actor(), v_action, 'sprint_team', v_row.id, v_meta);
  end if;
  return null;
end;
$$;

drop trigger if exists sprint_teams_audit on public.sprint_teams;
create trigger sprint_teams_audit
  after insert or update or delete on public.sprint_teams
  for each row execute function public.audit_sprint_team_change();

create or replace function public.audit_event_sprint_link_change()
  returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_actor  uuid := auth.uid();
  v_source text := coalesce(nullif(current_setting('nexus.change_source', true), ''), case when auth.uid() is null then 'system' else 'app' end);
  v_prev   uuid := case when TG_OP = 'UPDATE' then OLD.sprint_id else null end;
  v_meta   jsonb;
begin
  if v_prev is not distinct from NEW.sprint_id then
    return null;
  end if;
  v_meta := jsonb_build_object(
    'actor_id', v_actor, 'source', v_source, 'event_id', NEW.id,
    'previous_sprint_id', v_prev, 'new_sprint_id', NEW.sprint_id,
    'operation', case when v_prev is null then 'linked' when NEW.sprint_id is null then 'unlinked' else 'relinked' end);
  if v_actor is null then v_meta := v_meta - 'actor_id'; end if;
  insert into public.activity_log (user_id, action, entity_type, entity_id, metadata)
  values (public.audit_actor(), 'event_sprint_link_changed', 'event_config', NEW.id, v_meta);
  return null;
end;
$$;

drop trigger if exists event_configs_sprint_link_audit on public.event_configs;
create trigger event_configs_sprint_link_audit
  after insert or update of sprint_id on public.event_configs
  for each row execute function public.audit_event_sprint_link_change();

-- Trigger functions are never called directly.
revoke execute on function public.audit_actor() from anon, authenticated, public;
revoke execute on function public.audit_sprint_team_member_change() from anon, authenticated, public;
revoke execute on function public.audit_sprint_team_change() from anon, authenticated, public;
revoke execute on function public.audit_event_sprint_link_change() from anon, authenticated, public;
