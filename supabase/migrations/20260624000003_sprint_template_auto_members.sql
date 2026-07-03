-- ============================================================
-- Sprint Template Auto-Member Population & Active Sprint Filtering
-- ============================================================

-- Phase 1: Ensure department_id exists on sprint_teams (if not already)
alter table public.sprint_teams
  add column if not exists department_id uuid references public.departments(id) on delete set null;

-- Phase 2: Create RPC for creating sprint with template and auto-populating members
create or replace function public.create_sprint_with_template(
  p_name text,
  p_goal text,
  p_description text,
  p_start_date date,
  p_end_date date,
  p_template_type text,              -- 'single_dept' | 'multi_dept' | 'custom'
  p_selected_dept_ids uuid[],        -- department IDs
  p_created_by uuid
)
returns table (
  sprint_id uuid,
  created_teams jsonb  -- array of {id, name, member_count}
) as $$
declare
  v_sprint_id uuid;
  v_dept_id uuid;
  v_team_id uuid;
  v_member_count int;
  v_teams jsonb := '[]'::jsonb;
  v_user_id uuid;
begin
  -- 1. Create sprint
  insert into public.sprints (name, goal, description, start_date, end_date, created_by, status, is_archived)
  values (p_name, p_goal, p_description, p_start_date, p_end_date, p_created_by, 'planning', false)
  returning sprints.id into v_sprint_id;

  -- Add sprint creator as owner
  insert into public.sprint_members (sprint_id, user_id, role)
  values (v_sprint_id, p_created_by, 'owner');

  -- 2. Create teams and auto-populate members based on template
  if p_template_type = 'single_dept' and array_length(p_selected_dept_ids, 1) > 0 then
    -- Single department: create one team, add all active dept members
    v_dept_id := p_selected_dept_ids[1];

    insert into public.sprint_teams (sprint_id, name, department_id)
    select v_sprint_id, d.name, d.id
    from public.departments d
    where d.id = v_dept_id
    returning id into v_team_id;

    -- Auto-add all active members of this dept to sprint
    insert into public.sprint_members (sprint_id, user_id, role, sprint_team_id)
    select v_sprint_id, u.id, 'contributor', v_team_id
    from public.users u
    where u.department_id = v_dept_id
      and u.status = 'active'
      and u.id != p_created_by;  -- Don't re-add creator

    get diagnostics v_member_count = row_count;
    v_member_count := v_member_count + 1;  -- Add 1 for creator who was already added

    v_teams := v_teams || jsonb_build_object(
      'id', v_team_id,
      'name', (select d.name from public.departments d where d.id = v_dept_id),
      'member_count', v_member_count
    );

  elsif p_template_type = 'multi_dept' and array_length(p_selected_dept_ids, 1) > 0 then
    -- Multi-dept collaboration: create team per dept, add all members from each
    foreach v_dept_id in array p_selected_dept_ids loop
      -- Create team for this dept
      insert into public.sprint_teams (sprint_id, name, department_id)
      select v_sprint_id, d.name, d.id
      from public.departments d
      where d.id = v_dept_id
      returning id into v_team_id;

      -- Auto-add all active members of this dept to the team
      insert into public.sprint_members (sprint_id, user_id, role, sprint_team_id)
      select v_sprint_id, u.id, 'contributor', v_team_id
      from public.users u
      where u.department_id = v_dept_id
        and u.status = 'active'
        and u.id != p_created_by;  -- Don't re-add creator

      get diagnostics v_member_count = row_count;
      v_member_count := v_member_count + 1;  -- Add 1 for creator if in this dept

      -- If creator is in this department, they should be in this team too
      if exists (
        select 1 from public.users u
        where u.id = p_created_by and u.department_id = v_dept_id
      ) then
        -- Creator already added as sprint member, update their team assignment for this dept
        update public.sprint_members
        set sprint_team_id = v_team_id
        where public.sprint_members.sprint_id = v_sprint_id
          and public.sprint_members.user_id = p_created_by;
      end if;

      v_teams := v_teams || jsonb_build_object(
        'id', v_team_id,
        'name', (select d.name from public.departments d where d.id = v_dept_id),
        'member_count', v_member_count
      );
    end loop;

  elsif p_template_type = 'custom' then
    -- Custom: no auto-population, user adds teams manually
    v_teams := '[]'::jsonb;
  end if;

  return query select v_sprint_id as sprint_id, v_teams as created_teams;
end;
$$ language plpgsql security definer;

-- Phase 3: Create RPC for getting active sprints for sidebar
create or replace function public.get_active_sprints_for_sidebar(p_user_id uuid)
returns table (
  id uuid,
  name text,
  start_date date,
  end_date date,
  status text,
  days_remaining int,
  team_count int
) as $$
select
  s.id,
  s.name,
  s.start_date,
  s.end_date,
  s.status,
  (s.end_date - current_date)::int as days_remaining,
  count(distinct st.id)::int as team_count
from public.sprints s
left join public.sprint_teams st on s.id = st.sprint_id
where
  s.is_archived = false
  and (s.status = 'active' or s.status = 'planning')
  and s.end_date >= current_date
  and (
    exists(select 1 from public.sprint_members sm where sm.sprint_id = s.id and sm.user_id = p_user_id)
    or public.current_user_role() = 'super_admin'
  )
group by s.id
order by
  s.status = 'active' desc,  -- Active sprints first
  s.start_date asc;
$$ language sql stable;

-- Phase 4: Add index for query performance
create index if not exists sprints_is_archived_end_date_idx
  on public.sprints(is_archived, end_date)
  where is_archived = false;

create index if not exists sprint_teams_sprint_id_idx
  on public.sprint_teams(sprint_id);
