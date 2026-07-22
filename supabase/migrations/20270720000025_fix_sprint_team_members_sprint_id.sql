-- Fix create_sprint_with_template: include sprint_id in sprint_team_members inserts.
-- The table (from 20260620000000) has sprint_id NOT NULL, but the function
-- rewritten in 20270719000004 omitted it, causing null-constraint violations
-- when creating sprints from templates.

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
  insert into public.sprints (name, goal, description, start_date, end_date, created_by, status, is_archived)
  values (p_name, p_goal, p_description, p_start_date, p_end_date, p_created_by, 'planning', false)
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
