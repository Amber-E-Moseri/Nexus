-- sync_task_status_fields() resolved a task's status only from department-owned rows
-- (task_status_definitions.department_id = tasks.department_id). Spaces created through
-- createSpace()/the task-api department flow have no department-owned rows (the org-level model
-- introduced with is_org_status / get_space_statuses means they inherit org statuses), so the
-- insert left status_id NULL and failed with an opaque NOT NULL violation (HTTP 500 in task-api).
--
-- Resolution order is unchanged for departments that own status rows (legacy_key match, default,
-- sort_order); org-level statuses that the space has not disabled are now consulted as a fallback
-- tier. When nothing resolves we raise a specific, mappable error (SQLSTATE TS001) instead of a
-- NOT NULL violation. No status IDs are hardcoded and no rows are inserted.

create or replace function public.sync_task_status_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_status public.task_status_definitions%rowtype;
  preferred_legacy text;
begin
  preferred_legacy := coalesce(new.status, 'backlog');

  if new.status_id is null then
    select d.* into resolved_status
    from (
      select s.*, 0 as tier
      from public.task_status_definitions s
      where new.department_id is not null and s.department_id = new.department_id and s.active
      union all
      select s.*, 1 as tier
      from public.task_status_definitions s
      where s.is_org_status and s.department_id is null and s.active
        and not exists (
          select 1 from public.space_disabled_org_statuses sdo
          where sdo.org_status_id = s.id and sdo.department_id = new.department_id
        )
    ) d
    order by
      case when d.legacy_key = preferred_legacy then 0 else 1 end,
      d.tier,
      case when d.is_default then 0 else 1 end,
      d.sort_order
    limit 1;

    if resolved_status.id is null then
      raise exception 'no active task status definition available for department %', coalesce(new.department_id::text, '(none)')
        using errcode = 'TS001', hint = 'The space has no statuses of its own and no org-level status is enabled for it';
    end if;

    new.status_id := resolved_status.id;
  else
    select * into resolved_status from public.task_status_definitions where id = new.status_id;
  end if;

  if resolved_status.id is not null then
    new.status := coalesce(
      resolved_status.legacy_key,
      regexp_replace(lower(resolved_status.name), '\s+', '_', 'g')
    );

    if resolved_status.category = 'completed' then
      new.completed_at := coalesce(new.completed_at, now());
    elsif tg_op = 'INSERT' or (old.status_id is distinct from new.status_id) then
      new.completed_at := null;
    end if;
  end if;

  return new;
end;
$$;
