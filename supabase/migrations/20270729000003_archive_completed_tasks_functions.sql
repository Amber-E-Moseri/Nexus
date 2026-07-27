-- Weekly/biweekly completed-task archival: sweep functions, manual
-- archive/unarchive RPCs, the Archive-view read RPC, and the cron trigger
-- function. Modeled directly on the Trash feature
-- (20270720000017_task_trash.sql: soft_delete_task/restore_task/
-- get_trash_tasks) and the hardened cron pattern
-- (20270724000204_recurring_meetings_cron_dedicated_secret.sql).
--
-- "Completed" is determined by task_status_definitions.category = 'completed'
-- via tasks.status_id — every status row (org-wide or dept-specific) carries
-- its own accurate category directly (see src/lib/taskStatuses.js
-- createTaskStatus), so no extra join through org_status_id is needed.
--
-- Sprint tasks (sprint_id is not null) are permanently out of scope — sprints
-- have their own separate archive mechanism and should keep showing their
-- full task history while active. Only top-level tasks (parent_task_id is
-- null) are swept — a completed subtask stays visible until its parent is
-- also archived.

-- 1. Weekly sweep: department/space tasks.
create or replace function public.archive_completed_space_tasks()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.tasks t
  set archived_at = now()
  from public.task_status_definitions sd
  where t.status_id = sd.id
    and sd.category = 'completed'
    and t.department_id is not null
    and t.is_personal = false
    and t.sprint_id is null
    and t.parent_task_id is null
    and t.deleted_at is null
    and t.archived_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.archive_completed_space_tasks() to service_role;

-- 2. Biweekly sweep: personal tasks. Runs on a weekly cron tick but
-- self-gates on a last-run marker in app_settings, since standard 5-field
-- cron can't express "every 2 weeks" — this is robust to a missed run
-- (it just catches up on the next weekly tick) unlike a raw N-day interval
-- expression, which would drift.
create or replace function public.archive_completed_personal_tasks()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_last_run timestamptz;
begin
  select value::timestamptz into v_last_run
  from public.app_settings where key = 'last_personal_archive_run';

  if v_last_run is not null and now() - v_last_run < interval '14 days' then
    return 0;
  end if;

  update public.tasks t
  set archived_at = now()
  from public.task_status_definitions sd
  where t.status_id = sd.id
    and sd.category = 'completed'
    and t.is_personal = true
    and t.sprint_id is null
    and t.parent_task_id is null
    and t.deleted_at is null
    and t.archived_at is null;

  get diagnostics v_count = row_count;

  insert into public.app_settings (key, value) values ('last_personal_archive_run', now()::text)
  on conflict (key) do update set value = excluded.value;

  return v_count;
end;
$$;

grant execute on function public.archive_completed_personal_tasks() to service_role;

-- 3. Manual single-task archive/unarchive (task detail modal), and the
-- Archive-view read RPC — all copy soft_delete_task/restore_task/
-- get_trash_tasks' exact authorization union verbatim, so "who can act on
-- a task" and "who can see it archived" stay in lockstep by construction,
-- same rationale as the Trash feature's own comment.

create or replace function public.archive_task(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  t public.tasks%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into t from public.tasks where id = p_task_id;
  if not found then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;

  if not (
    t.created_by = v_uid
    or public.current_user_role() in ('super_admin', 'regional_secretary')
    or (t.department_id is not null and public.has_space_role(v_uid, t.department_id, 'dept_lead'))
    or t.assignee_id = v_uid
    or (t.sprint_id is not null and public.can_manage_sprint(t.sprint_id))
  ) then
    raise exception 'Not authorized to archive this task' using errcode = '42501';
  end if;

  update public.tasks
  set archived_at = now()
  where id = p_task_id
    and archived_at is null;
end;
$$;

grant execute on function public.archive_task(uuid) to authenticated;

create or replace function public.unarchive_task(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  t public.tasks%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into t from public.tasks where id = p_task_id;
  if not found then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;

  if t.archived_at is null then
    raise exception 'Task is not archived' using errcode = 'P0001';
  end if;

  if not (
    t.created_by = v_uid
    or public.current_user_role() in ('super_admin', 'regional_secretary')
    or (t.department_id is not null and public.has_space_role(v_uid, t.department_id, 'dept_lead'))
    or t.assignee_id = v_uid
    or (t.sprint_id is not null and public.can_manage_sprint(t.sprint_id))
  ) then
    raise exception 'Not authorized to unarchive this task' using errcode = '42501';
  end if;

  update public.tasks set archived_at = null where id = p_task_id;
end;
$$;

grant execute on function public.unarchive_task(uuid) to authenticated;

create or replace function public.get_archived_tasks()
returns setof public.tasks
language sql
security definer
set search_path = public
stable
as $$
  select t.*
  from public.tasks t
  where t.archived_at is not null
    and t.deleted_at is null
    and (
      t.created_by = auth.uid()
      or public.current_user_role() in ('super_admin', 'regional_secretary')
      or (t.department_id is not null and public.has_space_role(auth.uid(), t.department_id, 'dept_lead'))
      or t.assignee_id = auth.uid()
      or (t.sprint_id is not null and public.can_manage_sprint(t.sprint_id))
    )
  order by t.archived_at desc;
$$;

grant execute on function public.get_archived_tasks() to authenticated;

-- 4. Cron trigger, hardened style (dedicated secret via app_setting(),
-- graceful no-op + RAISE LOG if unconfigured) — copies
-- generate_recurring_meetings_trigger() (20270724000204) exactly, only
-- parameterized by scope so one edge function/one trigger fn serves both
-- the weekly space sweep and the weekly-tick-but-biweekly-gated personal
-- sweep.
create or replace function public.archive_completed_tasks_trigger(p_scope text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text := public.app_setting('supabase_url');
  v_apikey text := public.app_setting('service_role_key');
  v_cron_secret text := public.app_setting('archive_tasks_cron_secret');
begin
  if v_url is null or v_apikey is null or v_cron_secret is null then
    raise log 'archive_completed_tasks_trigger: app_settings not configured; skipping';
    return;
  end if;

  perform net.http_post(
    url := v_url || '/functions/v1/archive-completed-tasks',
    body := jsonb_build_object('scope', p_scope),
    headers := jsonb_build_object(
      'apikey', v_apikey,
      'Authorization', 'Bearer ' || v_cron_secret,
      'Content-Type', 'application/json'
    )
  );
end;
$$;

-- Manual test triggers:
-- SELECT public.archive_completed_space_tasks();
-- SELECT public.archive_completed_personal_tasks();
-- SELECT public.archive_completed_tasks_trigger('space');
-- SELECT public.archive_completed_tasks_trigger('personal');
