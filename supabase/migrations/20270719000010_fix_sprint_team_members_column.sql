-- sprint_team_members was defined twice across migrations:
-- - 20260619000002 created it with `team_id`
-- - 20260620000000 (IF NOT EXISTS) tried to create it with `sprint_team_id`
-- On databases where 20260619000002 failed (e.g. missing `spaces` table reference),
-- the table was created by 20260620000000 with `sprint_team_id`.
-- The frontend uniformly uses `team_id` — this migration normalises the column name.

do $$
begin
  -- Rename sprint_team_id → team_id if that's what the DB has
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'sprint_team_members'
      and column_name  = 'sprint_team_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'sprint_team_members'
      and column_name  = 'team_id'
  ) then
    alter table public.sprint_team_members rename column sprint_team_id to team_id;
  end if;
end $$;
