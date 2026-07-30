create or replace function public.get_status_usage_counts(p_department_id uuid default null)
returns table(status_id uuid, count bigint)
language sql
stable
as $$
  select status_id, count(*)::bigint as count
  from public.tasks
  where (p_department_id is null or department_id = p_department_id)
    and status_id is not null
  group by status_id;
$$;

create or replace function public.reorder_task_statuses(p_status_updates jsonb)
returns void
language plpgsql
as $$
begin
  with updates as (
    select
      (obj->>'id')::uuid as id,
      (obj->>'sort_order')::int as sort_order
    from jsonb_array_elements(p_status_updates) obj
  )
  update public.task_status_definitions tsd
  set sort_order = updates.sort_order,
      updated_at = now()
  from updates
  where tsd.id = updates.id;
end;
$$;

create index if not exists activity_log_user_id_idx
  on public.activity_log(user_id);

create index if not exists activity_log_entity_idx
  on public.activity_log(entity_type, entity_id);

create index if not exists meetings_department_id_idx
  on public.meetings(department_id);

create index if not exists meetings_created_by_idx
  on public.meetings(created_by);

create index if not exists calendar_events_space_id_idx
  on public.calendar_events(space_id);

create index if not exists calendar_events_sprint_id_idx
  on public.calendar_events(sprint_id);
