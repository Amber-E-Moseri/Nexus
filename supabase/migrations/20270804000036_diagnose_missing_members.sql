-- Diagnostic: Show which users are in sprint_team_members but not in sprint_members
do $$
declare
  v_sprint uuid := 'b7515367-2ccd-4e2c-8f31-933ab43e1135';
  v_count int;
  r record;
begin
  raise notice '--- Users in sprint_team_members but NOT in sprint_members ---';

  select count(distinct stm.user_id) into v_count
  from public.sprint_team_members stm
  where stm.sprint_id = v_sprint
    and not exists (
      select 1 from public.sprint_members sm
      where sm.sprint_id = v_sprint
        and sm.user_id = stm.user_id
    );

  raise notice 'Count: %', v_count;

  -- Show first 5
  for r in (
    select distinct stm.user_id, u.name, u.email
    from public.sprint_team_members stm
    join public.users u on u.id = stm.user_id
    where stm.sprint_id = v_sprint
      and not exists (
        select 1 from public.sprint_members sm
        where sm.sprint_id = v_sprint
          and sm.user_id = stm.user_id
      )
    limit 5
  ) loop
    raise notice '  - % (%)', r.name, r.email;
  end loop;
end $$;
