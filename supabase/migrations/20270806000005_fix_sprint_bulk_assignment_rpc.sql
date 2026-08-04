-- sprint_team_members belongs to a sprint through sprint_teams.team_id; it
-- does not have a sprint_id column. The previous membership check therefore
-- failed before any sprint task assignee set could be written.
create or replace function public.set_task_assignees(p_task_id uuid, p_user_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  t public.tasks%rowtype;
  v_is_sprint_team_member boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into t from public.tasks where id = p_task_id;
  if not found then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;

  v_is_sprint_team_member := exists(
    select 1
    from public.sprint_team_members stm
    join public.sprint_teams st on st.id = stm.team_id
    where st.sprint_id = t.sprint_id
      and stm.user_id = v_uid
  );

  if not (
    t.created_by = v_uid
    or public.current_user_role() in ('super_admin', 'regional_secretary')
    or (t.department_id is not null and public.has_space_role(v_uid, t.department_id, 'dept_lead'))
    or public.has_any_space_role(v_uid, 'ors')
    or public.has_any_space_role(v_uid, 'programs')
    or public.is_task_assignee(p_task_id, v_uid)
    or (t.sprint_id is not null and v_is_sprint_team_member)
  ) then
    raise exception 'Not authorized to assign this task' using errcode = '42501';
  end if;

  delete from public.task_assignees where task_id = p_task_id;

  if p_user_ids is not null and array_length(p_user_ids, 1) > 0 then
    insert into public.task_assignees (task_id, user_id)
    select distinct p_task_id, uid from unnest(p_user_ids) as uid
    on conflict (task_id, user_id) do nothing;
  end if;
end;
$$;

grant execute on function public.set_task_assignees(uuid, uuid[]) to authenticated;
