-- Diagnostic: Check sprint_members vs sprint_team_members for TII2
do $$
declare
  v_sprint uuid := 'b7515367-2ccd-4e2c-8f31-933ab43e1135';
  v_sprint_members_count int;
  v_sprint_team_members_count int;
begin
  select count(*) into v_sprint_members_count from public.sprint_members where sprint_id = v_sprint;
  select count(*) into v_sprint_team_members_count from public.sprint_team_members where sprint_id = v_sprint;

  raise notice '✓ TII2 sprint_members count: %', v_sprint_members_count;
  raise notice '✓ TII2 sprint_team_members count: %', v_sprint_team_members_count;
end $$;
