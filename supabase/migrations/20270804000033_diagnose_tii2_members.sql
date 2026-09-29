-- Diagnostic: check why TII2 sprint team members aren't populated
-- Run this to see:
-- 1. How many sprint_team_members exist for TII2
-- 2. Which guard checks might be failing

do $$
declare
  v_sprint uuid := 'b7515367-2ccd-4e2c-8f31-933ab43e1135';
  v_count int;
begin
  -- Count existing sprint_team_members for TII2
  select count(*) into v_count
  from public.sprint_team_members stm
  join public.sprint_teams st on st.id = stm.team_id
  where st.sprint_id = v_sprint;
  raise notice '✓ TII2 sprint_team_members count: %', v_count;

  -- Check if key people are active
  raise notice '--- User status checks ---';
  raise notice 'Jason Ikeokwu active: %', exists(select 1 from public.users where name like '%Jason%' and id = '477a2d5a-05b8-4063-80b6-c4371b643de0' and status = 'active');
  raise notice 'Amber Moseri active: %', exists(select 1 from public.users where name like '%Amber%' and id = '3e5ad72c-1da4-4cde-9220-97e82c920e4e' and status = 'active');
  raise notice 'Dorcas M active: %', exists(select 1 from public.users where name like '%Dorcas%' and id = '750e94e0-aa87-491c-8372-958225861484' and status = 'active');

  -- Check if departments exist
  raise notice '--- Department checks ---';
  raise notice 'Pastors dept exists: %', exists(select 1 from public.departments where name = 'Pastors' and id = 'e06d95c4-c36e-439f-993c-2b7f2393d277');
  raise notice 'Admins dept exists: %', exists(select 1 from public.departments where name = 'Admins' and id = '2aee687a-4dad-447b-ad6b-1e0239a6beb6');
  raise notice 'ORS dept exists: %', exists(select 1 from public.departments where id = '740b2809-b821-4861-b323-c37612de7741');
  raise notice 'PFCC dept exists: %', exists(select 1 from public.departments where id = 'a7f3d1d8-7a11-40d4-b65f-cd0bf17308ad');

  -- Check if TII2 sprint exists
  raise notice '--- Sprint check ---';
  raise notice 'TII2 sprint exists: %', exists(select 1 from public.sprints where id = v_sprint);
end $$;
