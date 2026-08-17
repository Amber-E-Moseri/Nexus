-- Department utilization snapshots: biweekly pre-computed cache.
--
-- The live get_department_utilization() RPC runs 5 CTEs (members, open tasks,
-- completions, per-user completions, top-3 rank) on every dashboard load.
-- For super_admin / regional_secretary this is fine once, but the data doesn't
-- meaningfully change hour-to-hour. Snapshotting biweekly (1st + 15th of each
-- month) means the dashboard reads one fast SELECT instead of 5 live CTEs, and
-- we get a history of utilization over time for free.
--
-- Layout:
--   department_utilization_snapshots — one row per dept per snapshot run
--   refresh_department_utilization_snapshot() — populate a new snapshot (SECURITY DEFINER)
--   get_latest_department_utilization() — widget-facing RPC: returns most-recent snapshot
--   pg_cron job: 0 0 1,15 * * (midnight on the 1st and 15th of each month)
--   Initial snapshot: runs at end of migration so the widget has data on first deploy

-- ── Table ──────────────────────────────────────────────────────────────────────

create table if not exists public.department_utilization_snapshots (
  id                   bigserial primary key,
  snapshot_at          timestamptz not null default now(),
  department_id        uuid        not null references public.departments(id) on delete cascade,
  department_name      text        not null,
  active_members       integer     not null default 0,
  open_tasks           integer     not null default 0,
  completed_this_week  integer     not null default 0,
  avg_tasks_per_member numeric     not null default 0,
  utilization_percent  integer     not null default 0,
  top_users            jsonb       not null default '[]'
);

create index if not exists dept_util_snapshots_at_idx
  on public.department_utilization_snapshots (snapshot_at desc);

create index if not exists dept_util_snapshots_dept_at_idx
  on public.department_utilization_snapshots (department_id, snapshot_at desc);

-- Only super_admin / regional_secretary may read snapshots (mirrors live RPC gate).
alter table public.department_utilization_snapshots enable row level security;

create policy "super_admin and regional_secretary can read dept utilization snapshots"
  on public.department_utilization_snapshots
  for select
  using (
    (select public.current_user_role()) in ('super_admin', 'regional_secretary')
  );

-- ── Refresh function ───────────────────────────────────────────────────────────
-- Called by the cron job (as postgres / service-role) and optionally by admins
-- via supabase.rpc('refresh_department_utilization_snapshot'). SECURITY DEFINER
-- so the cron job doesn't need superuser on every underlying table.

drop function if exists public.refresh_department_utilization_snapshot();

create function public.refresh_department_utilization_snapshot()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snapshot_at timestamptz := now();
begin
  insert into public.department_utilization_snapshots (
    snapshot_at, department_id, department_name,
    active_members, open_tasks, completed_this_week,
    avg_tasks_per_member, utilization_percent, top_users
  )
  with member_counts as (
    select u.department_id as dept_id, count(*)::integer as active_members
    from users u
    where u.department_id is not null
      and coalesce(u.status, 'active') = 'active'
    group by u.department_id
  ),
  open_task_counts as (
    select t.department_id as dept_id, count(*)::integer as open_tasks
    from tasks t
    join task_status_definitions tsd on tsd.id = t.status_id
    where t.is_personal = false
      and t.parent_task_id is null
      and t.deleted_at is null
      and t.department_id is not null
      and tsd.category not in ('completed', 'cancelled')
    group by t.department_id
  ),
  completed_this_week_counts as (
    select t.department_id as dept_id, count(*)::integer as completed_this_week
    from tasks t
    join task_status_definitions tsd on tsd.id = t.status_id
    where t.is_personal = false
      and t.parent_task_id is null
      and t.deleted_at is null
      and t.department_id is not null
      and tsd.category = 'completed'
      and t.completed_at >= date_trunc('week', now())
    group by t.department_id
  ),
  completed_by_user as (
    select
      u.department_id as dept_id,
      u.id            as user_id,
      u.name,
      count(t.id)::integer as completed_tasks
    from users u
    join tasks t on t.assignee_id = u.id
    join task_status_definitions tsd on tsd.id = t.status_id
    where t.is_personal = false
      and t.parent_task_id is null
      and t.deleted_at is null
      and tsd.category = 'completed'
      and t.completed_at >= now() - interval '30 days'
      and u.department_id is not null
    group by u.department_id, u.id, u.name
  ),
  ranked_users as (
    select
      cbu.dept_id,
      cbu.name,
      cbu.completed_tasks,
      row_number() over (partition by cbu.dept_id order by cbu.completed_tasks desc, cbu.name) as rnk
    from completed_by_user cbu
  ),
  top_users_by_department as (
    select
      ru.dept_id,
      jsonb_agg(
        jsonb_build_object('name', ru.name, 'completed_tasks', ru.completed_tasks)
        order by ru.rnk
      ) as top_users
    from ranked_users ru
    where ru.rnk <= 3
    group by ru.dept_id
  )
  select
    v_snapshot_at,
    d.id,
    d.name,
    coalesce(m.active_members, 0),
    coalesce(o.open_tasks, 0),
    coalesce(w.completed_this_week, 0),
    case
      when coalesce(m.active_members, 0) = 0 then 0::numeric
      else round(coalesce(o.open_tasks, 0)::numeric / m.active_members, 1)
    end,
    case
      when coalesce(m.active_members, 0) = 0 then 0
      else round(coalesce(o.open_tasks, 0)::numeric * 100 / (m.active_members * 5))::integer
    end,
    coalesce(tu.top_users, '[]'::jsonb)
  from departments d
  left join member_counts             m  on m.dept_id  = d.id
  left join open_task_counts          o  on o.dept_id  = d.id
  left join completed_this_week_counts w on w.dept_id  = d.id
  left join top_users_by_department   tu on tu.dept_id = d.id;
end;
$$;

-- Only super_admin and regional_secretary can trigger a manual refresh.
-- The cron job runs as postgres (bypasses RLS) so no grant needed there.
create policy "super_admin and regional_secretary can call refresh"
  on public.department_utilization_snapshots
  for insert
  with check (
    (select public.current_user_role()) in ('super_admin', 'regional_secretary')
  );

grant execute on function public.refresh_department_utilization_snapshot() to authenticated;

-- ── Widget-facing RPC ──────────────────────────────────────────────────────────
-- Returns the most-recent snapshot for every department.
-- Falls back to live data if no snapshot exists yet (first deploy).

drop function if exists public.get_latest_department_utilization();

create function public.get_latest_department_utilization()
returns table (
  department_id        uuid,
  department_name      text,
  active_members       integer,
  open_tasks           integer,
  completed_this_week  integer,
  avg_tasks_per_member numeric,
  utilization_percent  integer,
  top_users            jsonb,
  snapshot_at          timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_latest timestamptz;
begin
  if public.current_user_role() not in ('super_admin', 'regional_secretary') then
    return;
  end if;

  select max(s.snapshot_at)
    into v_latest
    from public.department_utilization_snapshots s;

  if v_latest is null then
    -- No snapshot yet: fall back to live query so the widget isn't empty.
    return query select
      r.department_id, r.department_name, r.active_members, r.open_tasks,
      r.completed_this_week, r.avg_tasks_per_member, r.utilization_percent,
      r.top_users, now()
    from public.get_department_utilization() r;
    return;
  end if;

  return query
  select
    s.department_id, s.department_name, s.active_members, s.open_tasks,
    s.completed_this_week, s.avg_tasks_per_member, s.utilization_percent,
    s.top_users, s.snapshot_at
  from public.department_utilization_snapshots s
  where s.snapshot_at = v_latest
  order by s.utilization_percent desc, s.department_name;
end;
$$;

grant execute on function public.get_latest_department_utilization() to authenticated;

-- ── pg_cron job: 1st and 15th of each month at midnight UTC ───────────────────

select cron.unschedule(jobid)
  from cron.job
 where jobname = 'refresh-department-utilization-snapshot';

select cron.schedule(
  'refresh-department-utilization-snapshot',
  '0 0 1,15 * *',
  $$ select public.refresh_department_utilization_snapshot(); $$
);

-- ── Seed: populate first snapshot now so the widget isn't blank on deploy ──────

select public.refresh_department_utilization_snapshot();
