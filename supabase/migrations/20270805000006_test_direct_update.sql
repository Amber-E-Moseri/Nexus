-- DEBUG (dropped in 20270805000008): direct-write probe used to confirm
-- sprint_team_id was reaching the tasks table. Kept for faithful replay.

create or replace function public.test_update_sprint_team_id(
  p_task_id uuid,
  p_sprint_team_id uuid
)
returns jsonb
language plpgsql
as $$
declare
  v_result jsonb;
begin
  update public.tasks
  set sprint_team_id = p_sprint_team_id
  where id = p_task_id;

  select jsonb_build_object(
    'id', id,
    'title', title,
    'sprint_team_id', sprint_team_id,
    'updated', sprint_team_id = p_sprint_team_id
  ) into v_result
  from public.tasks
  where id = p_task_id;

  return v_result;
end;
$$;
