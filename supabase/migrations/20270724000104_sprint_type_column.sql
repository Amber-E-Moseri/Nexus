-- =============================================================================
-- Persist sprint type so custom sprints stay custom regardless of later
-- team assignments
-- -----------------------------------------------------------------------------
-- SprintModal.jsx already has a three-way template selector (single-dept /
-- multi-dept / custom), and sync_task_department_id() (20270720000029)
-- already implements the intended resolution at sprint-creation time. The
-- gap: `sprints` never persisted WHICH template a sprint was created with —
-- "custom" was purely the absence of department_id and auto-created teams,
-- not something stored. SprintMemberPanel.jsx's per-member team-assignment
-- control lets an editor assign any existing team to any sprint's members,
-- with no restriction limiting this to sprints actually created as
-- multi-dept. The moment a team with a department_id gets assigned to a
-- member of a nominally "custom" sprint, the trigger's team-based
-- resolution fires for that member's tasks exactly as it would for a real
-- multi-dept sprint — silently converting "custom" into multi-dept from the
-- trigger's point of view, leaking tasks onto that team's space board.
-- =============================================================================

alter table public.sprints
  add column if not exists sprint_type text
    check (sprint_type in ('single_dept', 'multi_dept', 'custom'));

-- Backfill BEFORE constraining NOT NULL — the DEFAULT only applies to rows
-- inserted after the ALTER below, not retroactively to existing NULLs.
update public.sprints set sprint_type = 'single_dept' where department_id is not null and sprint_type is null;
update public.sprints set sprint_type = 'multi_dept'
  where department_id is null and sprint_type is null
    and exists (select 1 from public.sprint_teams st where st.sprint_id = sprints.id);
-- Ambiguous case (no department, no teams either way): can't distinguish
-- "genuinely custom" from "an empty multi-dept sprint with no teams added
-- yet" — default to the safer direction. A wrongly-'custom' sprint just
-- needs its type corrected if actually meant multi-dept; the alternative
-- risks silently exposing a sprint meant to stay private.
update public.sprints set sprint_type = 'custom' where sprint_type is null;

-- Load-bearing, not cosmetic: without NOT NULL DEFAULT 'custom', any
-- sprint-creation path other than SprintModal.jsx's three branches (a
-- future clone/duplicate feature, a direct insert, anything unaware of this
-- convention) would insert sprint_type = NULL. Since SQL `NULL = 'custom'`
-- is NULL (falsy), the trigger's `if sprint_type = 'custom'` check would
-- silently fail open — reopening the identical leak this migration exists
-- to close. Making "untyped" and "custom" the same safe state by
-- construction means no future insert path can accidentally bypass the fix.
alter table public.sprints
  alter column sprint_type set default 'custom',
  alter column sprint_type set not null;

-- -----------------------------------------------------------------------------
-- Extend sync_task_department_id() (same trigger from 20270720000029,
-- extended not replaced): skip priority-2 (team-based) resolution entirely
-- for custom sprints, regardless of whether the assignee has since been
-- added to a team. Because the column is NOT NULL, there's no third NULL
-- state to reason about — the check is exhaustive.
-- -----------------------------------------------------------------------------

create or replace function public.sync_task_department_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sprint_dept_id uuid;
  v_sprint_type    text;
  v_team_dept_id   uuid;
  v_is_insert      boolean := (TG_OP = 'INSERT');
begin
  if new.sprint_id is null then
    return new;
  end if;

  -- Priority 1: sprint's own department_id (single-dept sprints)
  select department_id, sprint_type into v_sprint_dept_id, v_sprint_type
  from public.sprints where id = new.sprint_id;

  if v_sprint_dept_id is not null then
    new.department_id := v_sprint_dept_id;
    return new;
  end if;

  -- Custom sprints never resolve a department via team membership, no
  -- matter what teams get assigned to members later.
  if v_sprint_type = 'custom' then
    if v_is_insert then
      new.department_id := null;
    elsif new.assignee_id is distinct from old.assignee_id then
      new.department_id := null;
    end if;
    return new;
  end if;

  -- Priority 2: assignee's team department_id (multi-dept sprints)
  -- Excludes external/temporary members — they never get space visibility.
  if new.assignee_id is not null then
    select st.department_id into v_team_dept_id
    from public.sprint_team_members stm
    join public.sprint_teams st on st.id = stm.team_id
    where st.sprint_id = new.sprint_id
      and stm.user_id = new.assignee_id
      and st.department_id is not null
      and not exists (
        select 1 from public.sprint_members sm
        where sm.sprint_id = new.sprint_id
          and sm.user_id = new.assignee_id
          and sm.is_temporary = true
      )
    order by st.created_at asc
    limit 1;

    if v_team_dept_id is not null then
      new.department_id := v_team_dept_id;
      return new;
    end if;
  end if;

  -- Priority 3: no resolution possible
  if v_is_insert then
    new.department_id := null;
  elsif new.assignee_id is distinct from old.assignee_id and v_sprint_dept_id is null then
    new.department_id := null;
  end if;

  return new;
end;
$$;

-- create or replace preserves the existing trigger binding
-- (trg_sync_task_department_id, before insert or update of sprint_id, assignee_id).

-- -----------------------------------------------------------------------------
-- create_sprint_with_template (20270720000025) never set sprints.sprint_type
-- (nor sprints.department_id, for that matter — only sprint_teams.department_id
-- gets set; single-dept sprints already relied on the same team-based
-- resolution as multi-dept via sprint_team_members, an existing quirk this
-- migration doesn't change). Without this fix, every RPC-created single/
-- multi-dept sprint would fall through to the new column's
-- DEFAULT 'custom' — which would suppress team-based resolution for a
-- sprint whose teams were deliberately created, breaking already-working
-- task linking. p_template_type already carries the exact value needed
-- ('single_dept' | 'multi_dept' | 'custom') — just persist it.
-- -----------------------------------------------------------------------------

create or replace function public.create_sprint_with_template(
  p_name text,
  p_goal text,
  p_description text,
  p_start_date date,
  p_end_date date,
  p_template_type text,
  p_selected_dept_ids uuid[],
  p_created_by uuid
)
returns table (
  sprint_id uuid,
  created_teams jsonb
) as $$
declare
  v_sprint_id uuid;
  v_dept_id uuid;
  v_team_id uuid;
  v_member_count int;
  v_teams jsonb := '[]'::jsonb;
begin
  -- Create sprint
  insert into public.sprints (name, goal, description, start_date, end_date, created_by, status, is_archived, sprint_type)
  values (p_name, p_goal, p_description, p_start_date, p_end_date, p_created_by, 'planning', false, p_template_type)
  returning sprints.id into v_sprint_id;

  -- Add creator as owner sprint member
  insert into public.sprint_members (sprint_id, user_id, role)
  values (v_sprint_id, p_created_by, 'owner');

  if p_template_type = 'single_dept' and array_length(p_selected_dept_ids, 1) > 0 then
    v_dept_id := p_selected_dept_ids[1];

    insert into public.sprint_teams (sprint_id, name, department_id)
    select v_sprint_id, d.name, d.id
    from public.departments d
    where d.id = v_dept_id
    returning id into v_team_id;

    -- Add all active dept members as sprint members
    insert into public.sprint_members (sprint_id, user_id, role)
    select v_sprint_id, u.id, 'contributor'
    from public.users u
    where u.department_id = v_dept_id
      and u.status = 'active'
      and u.id != p_created_by;

    get diagnostics v_member_count = row_count;
    v_member_count := v_member_count + 1;

    -- Assign all dept members (including creator) to the team via junction table
    insert into public.sprint_team_members (sprint_id, team_id, user_id)
    select v_sprint_id, v_team_id, u.id
    from public.users u
    where u.department_id = v_dept_id
      and u.status = 'active'
    on conflict do nothing;

    v_teams := v_teams || jsonb_build_object(
      'id', v_team_id,
      'name', (select d.name from public.departments d where d.id = v_dept_id),
      'member_count', v_member_count
    );

  elsif p_template_type = 'multi_dept' and array_length(p_selected_dept_ids, 1) > 0 then
    foreach v_dept_id in array p_selected_dept_ids loop
      insert into public.sprint_teams (sprint_id, name, department_id)
      select v_sprint_id, d.name, d.id
      from public.departments d
      where d.id = v_dept_id
      returning id into v_team_id;

      -- Add all active dept members as sprint members (ignore conflicts for creator)
      insert into public.sprint_members (sprint_id, user_id, role)
      select v_sprint_id, u.id, 'contributor'
      from public.users u
      where u.department_id = v_dept_id
        and u.status = 'active'
        and u.id != p_created_by
      on conflict do nothing;

      get diagnostics v_member_count = row_count;
      v_member_count := v_member_count + 1;

      -- Assign all dept members to this team via junction table
      insert into public.sprint_team_members (sprint_id, team_id, user_id)
      select v_sprint_id, v_team_id, u.id
      from public.users u
      where u.department_id = v_dept_id
        and u.status = 'active'
      on conflict do nothing;

      v_teams := v_teams || jsonb_build_object(
        'id', v_team_id,
        'name', (select d.name from public.departments d where d.id = v_dept_id),
        'member_count', v_member_count
      );
    end loop;

  elsif p_template_type = 'custom' then
    v_teams := '[]'::jsonb;
  end if;

  return query select v_sprint_id as sprint_id, v_teams as created_teams;
end;
$$ language plpgsql security definer;
