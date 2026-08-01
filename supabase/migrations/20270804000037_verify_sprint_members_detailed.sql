-- Detailed check of sprint_members vs sprint_team_members for TII2
do $$
declare
  v_sprint uuid := 'b7515367-2ccd-4e2c-8f31-933ab43e1135';
  v_total_sm int;
  v_distinct_sm int;
  v_distinct_stm int;
begin
  -- Total rows in sprint_members for TII2
  select count(*) into v_total_sm from public.sprint_members where sprint_id = v_sprint;

  -- Distinct users in sprint_members
  select count(distinct user_id) into v_distinct_sm from public.sprint_members where sprint_id = v_sprint;

  -- Distinct users in sprint_team_members
  select count(distinct user_id) into v_distinct_stm from public.sprint_team_members where sprint_id = v_sprint;

  raise notice 'TII2 Sprint Breakdown:';
  raise notice '  sprint_members total rows: %', v_total_sm;
  raise notice '  sprint_members distinct users: %', v_distinct_sm;
  raise notice '  sprint_team_members distinct users: %', v_distinct_stm;

  -- Check if 36 is the actual distinct count or just total rows
  if v_distinct_sm = 36 and v_distinct_stm = 63 then
    raise notice '⚠️  Only 36 of 63 team members are in sprint_members!';
  end if;
end $$;
