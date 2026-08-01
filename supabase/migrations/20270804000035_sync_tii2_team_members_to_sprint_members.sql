-- Fix: Sync all 63 sprint_team_members to sprint_members table
-- 36 were already synced by 000009, but 27 are missing.
-- This ensures all team members are also sprint members.

do $$
declare
  v_sprint uuid := 'b7515367-2ccd-4e2c-8f31-933ab43e1135';
  v_inserted int;
begin
  insert into public.sprint_members (sprint_id, user_id, role)
  select distinct v_sprint, stm.user_id, 'contributor'
  from public.sprint_team_members stm
  where stm.sprint_id = v_sprint
  on conflict (sprint_id, user_id) do nothing;

  select count(*) into v_inserted from public.sprint_members where sprint_id = v_sprint;
  raise notice '✓ TII2 sprint_members synced. Total count: %', v_inserted;
end $$;
