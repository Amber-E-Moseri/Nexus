-- Run with: psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_recursion_and_visibility.sql
-- Everything runs in one transaction that is rolled back. Any failed assertion raises and aborts.
begin;

create or replace function pg_temp.act_as(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', p_uid, 'aud', 'authenticated')::text, true);
  set local role authenticated;
end $$;

-- ── fixtures (as the migration superuser, RLS bypassed) ──
create temp table fx as select
  gen_random_uuid() d1, gen_random_uuid() d2,
  gen_random_uuid() u_admin, gen_random_uuid() u_lead, gen_random_uuid() u_peer,
  gen_random_uuid() u_other, gen_random_uuid() u_assignee, gen_random_uuid() u_multi, gen_random_uuid() t1, gen_random_uuid() t2;
grant select on fx to authenticated;

insert into departments (id, name) select d1, 'RLS-D1-' || left(d1::text, 6) from fx;
insert into departments (id, name) select d2, 'RLS-D2-' || left(d2::text, 6) from fx;
insert into auth.users (id, aud, role, email, instance_id)
  select u, 'authenticated', 'authenticated', u || '@rls.test', '00000000-0000-0000-0000-000000000000'
  from fx, lateral unnest(array[u_admin, u_lead, u_peer, u_other, u_assignee, u_multi]) u;
insert into public.users (id, name, email, role, status, department_id) select u_admin,'admin',u_admin||'@rls.test','super_admin','active',null from fx;
insert into public.users (id, name, email, role, status, department_id) select u_lead,'lead',u_lead||'@rls.test','dept_lead','active',d1 from fx;
insert into public.users (id, name, email, role, status, department_id) select u_peer,'peer',u_peer||'@rls.test','member','active',d1 from fx;
insert into public.users (id, name, email, role, status, department_id) select u_other,'other',u_other||'@rls.test','member','active',d2 from fx;
insert into public.users (id, name, email, role, status, department_id) select u_assignee,'assignee',u_assignee||'@rls.test','member','active',d2 from fx;
insert into public.users (id, name, email, role, status, department_id) select u_multi,'multi',u_multi||'@rls.test','member','active',d2 from fx;
-- t1: department D1 task assigned (legacy column) to a user who is NOT in D1; t2: D1 task, assigned only via task_assignees
insert into tasks (id, title, department_id, task_type, source, is_personal, assignee_id)
  select t1, 'visible to assignee', d1, 'space', 'api', false, u_assignee from fx;
insert into tasks (id, title, department_id, task_type, source, is_personal)
  select t2, 'multi assignee', d1, 'space', 'api', false from fx;
insert into task_assignees (task_id, user_id) select t2, u_multi from fx;

-- ── RLS01: no policy recursion anywhere (every RLS table is readable as an authenticated user) ──
do $$
declare r record; n int := 0; v_uid uuid;
begin
  select u_peer into v_uid from fx;
  for r in select c.relname as tablename from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and c.relrowsecurity and has_table_privilege('authenticated', c.oid, 'select') order by 1 loop
    perform pg_temp.act_as(v_uid);
    begin
      execute format('select count(*) from public.%I', r.tablename);
      n := n + 1;
    exception when sqlstate '42P17' then
      reset role;
      raise exception 'RLS01 FAIL: infinite recursion detected in policy while reading public.%', r.tablename;
    end;
    reset role;
  end loop;
  raise notice 'PASS RLS01: % RLS tables readable by an authenticated user without recursion', n;
end $$;

-- ── RLS02: assignee visibility ──
do $$
declare fx_row fx%rowtype; c int;
begin
  select * into fx_row from fx;
  perform pg_temp.act_as(fx_row.u_assignee);
  select count(*) into c from tasks where id = fx_row.t1; reset role;
  if c <> 1 then raise exception 'RLS02 FAIL: assigned user (outside the department) cannot see their task'; end if;

  perform pg_temp.act_as(fx_row.u_other);
  select count(*) into c from tasks where id in (fx_row.t1, fx_row.t2); reset role;
  if c <> 0 then raise exception 'RLS02 FAIL: unassigned user in another department sees % task(s)', c; end if;

  perform pg_temp.act_as(fx_row.u_multi);
  select count(*) into c from tasks where id = fx_row.t2; reset role;
  if c <> 1 then raise exception 'RLS02 FAIL: task_assignees user cannot see t2'; end if;

  perform pg_temp.act_as(fx_row.u_peer);
  select count(*) into c from tasks where id in (fx_row.t1, fx_row.t2); reset role;
  if c <> 2 then raise exception 'RLS02 FAIL: same-department member should see both department tasks, saw %', c; end if;

  perform pg_temp.act_as(fx_row.u_lead);
  select count(*) into c from tasks where id in (fx_row.t1, fx_row.t2); reset role;
  if c <> 2 then raise exception 'RLS02 FAIL: dept lead should see both, saw %', c; end if;

  perform pg_temp.act_as(fx_row.u_admin);
  select count(*) into c from tasks where id in (fx_row.t1, fx_row.t2); reset role;
  if c <> 2 then raise exception 'RLS02 FAIL: super admin should see both, saw %', c; end if;
  raise notice 'PASS RLS02: assignee / task_assignees / unassigned / peer / dept lead / super admin visibility';
end $$;

-- ── RLS03: security still denies unauthorized access ──
do $$
declare fx_row fx%rowtype; c int;
begin
  select * into fx_row from fx;
  -- other-department user cannot read D1 itself, cannot write D1 tasks
  perform pg_temp.act_as(fx_row.u_other);
  select count(*) into c from departments where id = fx_row.d1; 
  if c <> 0 then reset role; raise exception 'RLS03 FAIL: other-department user can read D1'; end if;
  begin
    insert into tasks (title, department_id, task_type, source, is_personal, created_by) values ('nope', fx_row.d1, 'space', 'api', false, fx_row.u_other);
    reset role; raise exception 'RLS03 FAIL: other-department user inserted into D1';
  exception when insufficient_privilege or check_violation then reset role;
  end;
  perform pg_temp.act_as(fx_row.u_other);
  begin
    update tasks set title = 'hijack' where id = fx_row.t1;
    get diagnostics c = row_count;
    if c <> 0 then reset role; raise exception 'RLS03 FAIL: other-department user updated a D1 task'; end if;
  end;
  reset role;
  -- group-space clause now uses the correct join: a member of a group space sees it; a non-member does not
  insert into departments (id, name, space_type, visibility, owner_id) select gen_random_uuid(), 'RLS-G-' || left(u_lead::text, 6), 'group', 'private', u_lead from fx;
  insert into group_space_members (group_space_id, user_id) select d.id, fx_row.u_peer from departments d where d.name = 'RLS-G-' || left(fx_row.u_lead::text, 6);
  perform pg_temp.act_as(fx_row.u_peer);
  select count(*) into c from departments where name = 'RLS-G-' || left(fx_row.u_lead::text, 6);
  reset role;
  if c <> 1 then raise exception 'RLS03 FAIL: group space member cannot see the group space'; end if;
  perform pg_temp.act_as(fx_row.u_other);
  select count(*) into c from departments where name = 'RLS-G-' || left(fx_row.u_lead::text, 6);
  reset role;
  if c <> 0 then raise exception 'RLS03 FAIL: non-member sees the group space'; end if;
  raise notice 'PASS RLS03: unauthorized read/write still denied; group-space membership visibility correct';
end $$;

-- ── RLS04: new helper functions are not executable by anon/public ──
do $$
declare f text;
begin
  foreach f in array array['is_group_space_owner(uuid)','is_group_space_member(uuid)','sprint_has_team_in_my_department(uuid)','can_see_sprint(uuid)','can_view_sprint_space(uuid)','is_sprint_team_member(uuid)','can_read_sprint_team_members(uuid)','pastor_pair_in_my_department(uuid,uuid)'] loop
    if not (select prosecdef from pg_proc where oid = ('public.' || f)::regprocedure) then raise exception 'RLS04 FAIL: % is not SECURITY DEFINER', f; end if;
    if (select proconfig is null from pg_proc where oid = ('public.' || f)::regprocedure) then raise exception 'RLS04 FAIL: % has no pinned search_path', f; end if;
  end loop;
  raise notice 'PASS RLS04: helper functions are SECURITY DEFINER with pinned search_path';
end $$;

-- ── RLS05: anonymous role sees nothing (helpers keep the existing anon-executable pattern, returning false for a NULL uid) ──
do $$
declare t text; c int;
begin
  set local role anon;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  foreach t in array array['departments','sprints','sprint_teams','sprint_members','sprint_team_members','group_space_members','pastor_members','users','tasks'] loop
    execute format('select count(*) from public.%I', t) into c;
    if c <> 0 then reset role; raise exception 'RLS05 FAIL: anon sees % rows of %', c, t; end if;
  end loop;
  reset role;
  raise notice 'PASS RLS05: anon reads return no rows';
end $$;

rollback;
