-- Perf fix, part 2: get_dashboard_data(p_user_id, p_role, p_department_id) is
-- LANGUAGE sql STABLE with role-branching CASE logic inside. Because function
-- arguments are bound as parameters (not text-substituted), Postgres can't
-- specialize the plan per role the way it can when the same logic is run with
-- literals inlined. Measured: identical logic run with literals inline took
-- 64.8ms / 886 buffer reads vs 258.6ms / 8,836 buffer reads through the real
-- parameterized call, both under identical real RLS enforcement (SET ROLE
-- authenticated). The 20270816000002 migration fixed a separate, real problem
-- (9 overlapping tasks SELECT policies) but did not fix this one.
--
-- Also fixed here: overdue_by_member is structurally empty for role='member'
-- (widget is admin/lead/pastor-only), but the original ran the full
-- tasks/users join and filtered results away afterward instead of skipping
-- the query. Splitting by role makes this "skip" the natural default rather
-- than something to special-case.
--
-- Fix: split into 4 role-specific functions (member/dept_lead/pastor/
-- everyone-else, matching the original CASE branches exactly) behind a thin
-- plpgsql dispatcher with the original signature, so callers (single call
-- site: useDashboardData.js) don't change. Each variant is a direct
-- extraction of its branch from the original — no new logic, no behavior
-- change, verified via byte-for-byte JSON comparison against the original
-- for one real user per role before this migration was written.

CREATE OR REPLACE FUNCTION public.get_dashboard_data_member(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
with bounds as (
  select
    date_trunc('week', now()) as week_start,
    date_trunc('week', now()) - interval '1 week' as last_week_start,
    date_trunc('week', now()) + interval '1 week' as week_end,
    (date_trunc('week', now()) + interval '6 days')::date as week_end_date
),
scoped_tasks as (
  select t.completed_at, t.created_at
  from public.tasks t
  where t.is_personal = false
    and t.assignee_id = p_user_id
)
select jsonb_build_object(
  'hero', jsonb_build_object(
    'space_count', (select count(*) from public.departments),
    'open_task_count', (
      select count(*) from public.tasks
      where assignee_id = p_user_id
        and is_personal = false
        and parent_task_id is null
        and completed_at is null
    ),
    'my_due_task_count', (
      select count(*) from public.tasks
      where assignee_id = p_user_id and completed_at is null and due_date is not null
    ),
    'active_sprint_count', (select count(*) from public.sprints where status = 'active')
  ),
  'my_tasks_summary', (
    select jsonb_build_object(
      'today', count(*) filter (where due_date::date = current_date),
      'overdue', count(*) filter (where due_date::date < current_date),
      'this_week', count(*) filter (
        where due_date::date > current_date and due_date::date <= b.week_end_date
      ),
      'sprint_open', (
        select count(distinct t.id)
        from public.tasks t
        join public.sprint_members sm on sm.sprint_id = t.sprint_id and sm.user_id = p_user_id
        where t.assignee_id = p_user_id
          and t.task_type = 'sprint'
          and t.completed_at is null
          and t.parent_task_id is null
          and t.deleted_at is null
      )
    )
    from public.tasks
    where assignee_id = p_user_id
      and completed_at is null
      and parent_task_id is null
      and due_date is not null
  ),
  'custom_stats', jsonb_build_object(
    'meetings_this_week', (
      select count(*) from public.meetings
      where date >= b.week_start and date < b.week_end
    ),
    'completed_this_week', (
      select count(*) from public.tasks where completed_at >= b.week_start
    )
  ),
  'completion_rate', (
    select jsonb_build_object(
      'completed_this_week', count(*) filter (where completed_at >= b.week_start),
      'created_this_week', count(*) filter (where created_at >= b.week_start),
      'completed_last_week', count(*) filter (
        where completed_at >= b.last_week_start and completed_at < b.week_start
      )
    )
    from scoped_tasks
  ),
  'sprint_progress', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'status', s.status,
      'start_date', s.start_date,
      'end_date', s.end_date,
      'department_id', s.department_id,
      'total', (
        select count(*) from public.tasks t
        where t.sprint_id = s.id and t.is_personal = false
      ),
      'completed', (
        select count(*)
        from public.tasks t
        join public.task_status_definitions d on d.id = t.status_id
        where t.sprint_id = s.id and t.is_personal = false and d.category = 'completed'
      )
    )), '[]'::jsonb)
    from (
      select id, name, status, start_date, end_date, department_id
      from public.sprints
      where status in ('planning', 'active', 'review')
        and id in (select sprint_id from public.sprint_members where user_id = p_user_id)
      order by start_date desc nulls last
      limit 3
    ) s
  ),
  'overdue_by_member', '[]'::jsonb
)
from bounds b
$function$;

CREATE OR REPLACE FUNCTION public.get_dashboard_data_dept_lead(p_user_id uuid, p_department_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
with bounds as (
  select
    date_trunc('week', now()) as week_start,
    date_trunc('week', now()) - interval '1 week' as last_week_start,
    date_trunc('week', now()) + interval '1 week' as week_end,
    (date_trunc('week', now()) + interval '6 days')::date as week_end_date
),
scoped_tasks as (
  select t.completed_at, t.created_at
  from public.tasks t
  where t.is_personal = false
    and (p_department_id is null or t.department_id = p_department_id)
)
select jsonb_build_object(
  'hero', jsonb_build_object(
    'space_count', (select count(*) from public.departments),
    'open_task_count', (
      select count(*) from public.tasks
      where assignee_id = p_user_id
        and is_personal = false
        and parent_task_id is null
        and completed_at is null
    ),
    'my_due_task_count', (
      select count(*) from public.tasks
      where assignee_id = p_user_id and completed_at is null and due_date is not null
    ),
    'active_sprint_count', (select count(*) from public.sprints where status = 'active')
  ),
  'my_tasks_summary', (
    select jsonb_build_object(
      'today', count(*) filter (where due_date::date = current_date),
      'overdue', count(*) filter (where due_date::date < current_date),
      'this_week', count(*) filter (
        where due_date::date > current_date and due_date::date <= b.week_end_date
      ),
      'sprint_open', (
        select count(distinct t.id)
        from public.tasks t
        join public.sprint_members sm on sm.sprint_id = t.sprint_id and sm.user_id = p_user_id
        where t.assignee_id = p_user_id
          and t.task_type = 'sprint'
          and t.completed_at is null
          and t.parent_task_id is null
          and t.deleted_at is null
      )
    )
    from public.tasks
    where assignee_id = p_user_id
      and completed_at is null
      and parent_task_id is null
      and due_date is not null
  ),
  'custom_stats', jsonb_build_object(
    'meetings_this_week', (
      select count(*) from public.meetings
      where date >= b.week_start and date < b.week_end
    ),
    'completed_this_week', (
      select count(*) from public.tasks where completed_at >= b.week_start
    )
  ),
  'completion_rate', (
    select jsonb_build_object(
      'completed_this_week', count(*) filter (where completed_at >= b.week_start),
      'created_this_week', count(*) filter (where created_at >= b.week_start),
      'completed_last_week', count(*) filter (
        where completed_at >= b.last_week_start and completed_at < b.week_start
      )
    )
    from scoped_tasks
  ),
  'sprint_progress', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'status', s.status,
      'start_date', s.start_date,
      'end_date', s.end_date,
      'department_id', s.department_id,
      'total', (
        select count(*) from public.tasks t
        where t.sprint_id = s.id and t.is_personal = false
      ),
      'completed', (
        select count(*)
        from public.tasks t
        join public.task_status_definitions d on d.id = t.status_id
        where t.sprint_id = s.id and t.is_personal = false and d.category = 'completed'
      )
    )), '[]'::jsonb)
    from (
      select id, name, status, start_date, end_date, department_id
      from public.sprints
      where status in ('planning', 'active', 'review')
        and (p_department_id is null or department_id = p_department_id)
      order by start_date desc nulls last
      limit 3
    ) s
  ),
  'overdue_by_member', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id,
      'title', t.title,
      'due_date', t.due_date,
      'status', t.status,
      'assignee_id', t.assignee_id,
      'assignee_name', u.name
    ) order by t.due_date), '[]'::jsonb)
    from public.tasks t
    join public.users u on u.id = t.assignee_id
    where t.due_date::date < current_date
      and t.status not in ('done', 'completed', 'cancelled')
      and t.assignee_id is not null
      and t.is_personal = false
      and t.parent_task_id is null
      and (p_department_id is null or t.department_id = p_department_id)
  )
)
from bounds b
$function$;

CREATE OR REPLACE FUNCTION public.get_dashboard_data_pastor(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
with bounds as (
  select
    date_trunc('week', now()) as week_start,
    date_trunc('week', now()) - interval '1 week' as last_week_start,
    date_trunc('week', now()) + interval '1 week' as week_end,
    (date_trunc('week', now()) + interval '6 days')::date as week_end_date
),
flock as (
  select member_id from public.pastor_members where pastor_id = p_user_id
),
scoped_tasks as (
  select t.completed_at, t.created_at
  from public.tasks t
  where t.is_personal = false
    and t.assignee_id in (select member_id from flock)
)
select jsonb_build_object(
  'hero', jsonb_build_object(
    'space_count', (select count(*) from public.departments),
    'open_task_count', (
      select count(*) from public.tasks
      where assignee_id = p_user_id
        and is_personal = false
        and parent_task_id is null
        and completed_at is null
    ),
    'my_due_task_count', (
      select count(*) from public.tasks
      where assignee_id = p_user_id and completed_at is null and due_date is not null
    ),
    'active_sprint_count', (select count(*) from public.sprints where status = 'active')
  ),
  'my_tasks_summary', (
    select jsonb_build_object(
      'today', count(*) filter (where due_date::date = current_date),
      'overdue', count(*) filter (where due_date::date < current_date),
      'this_week', count(*) filter (
        where due_date::date > current_date and due_date::date <= b.week_end_date
      ),
      'sprint_open', (
        select count(distinct t.id)
        from public.tasks t
        join public.sprint_members sm on sm.sprint_id = t.sprint_id and sm.user_id = p_user_id
        where t.assignee_id = p_user_id
          and t.task_type = 'sprint'
          and t.completed_at is null
          and t.parent_task_id is null
          and t.deleted_at is null
      )
    )
    from public.tasks
    where assignee_id = p_user_id
      and completed_at is null
      and parent_task_id is null
      and due_date is not null
  ),
  'custom_stats', jsonb_build_object(
    'meetings_this_week', (
      select count(*) from public.meetings
      where date >= b.week_start and date < b.week_end
    ),
    'completed_this_week', (
      select count(*) from public.tasks where completed_at >= b.week_start
    )
  ),
  'completion_rate', (
    select jsonb_build_object(
      'completed_this_week', count(*) filter (where completed_at >= b.week_start),
      'created_this_week', count(*) filter (where created_at >= b.week_start),
      'completed_last_week', count(*) filter (
        where completed_at >= b.last_week_start and completed_at < b.week_start
      )
    )
    from scoped_tasks
  ),
  'sprint_progress', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'status', s.status,
      'start_date', s.start_date,
      'end_date', s.end_date,
      'department_id', s.department_id,
      'total', (
        select count(*) from public.tasks t
        where t.sprint_id = s.id and t.is_personal = false
      ),
      'completed', (
        select count(*)
        from public.tasks t
        join public.task_status_definitions d on d.id = t.status_id
        where t.sprint_id = s.id and t.is_personal = false and d.category = 'completed'
      )
    )), '[]'::jsonb)
    from (
      select id, name, status, start_date, end_date, department_id
      from public.sprints
      where status in ('planning', 'active', 'review')
        and id in (
          select sprint_id from public.sprint_members
          where user_id in (select member_id from flock)
        )
      order by start_date desc nulls last
      limit 3
    ) s
  ),
  'overdue_by_member', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id,
      'title', t.title,
      'due_date', t.due_date,
      'status', t.status,
      'assignee_id', t.assignee_id,
      'assignee_name', u.name
    ) order by t.due_date), '[]'::jsonb)
    from public.tasks t
    join public.users u on u.id = t.assignee_id
    where t.due_date::date < current_date
      and t.status not in ('done', 'completed', 'cancelled')
      and t.assignee_id is not null
      and t.is_personal = false
      and t.parent_task_id is null
      and t.assignee_id in (select member_id from flock)
  )
)
from bounds b
$function$;

CREATE OR REPLACE FUNCTION public.get_dashboard_data_unscoped(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
with bounds as (
  select
    date_trunc('week', now()) as week_start,
    date_trunc('week', now()) - interval '1 week' as last_week_start,
    date_trunc('week', now()) + interval '1 week' as week_end,
    (date_trunc('week', now()) + interval '6 days')::date as week_end_date
),
scoped_tasks as (
  select t.completed_at, t.created_at
  from public.tasks t
  where t.is_personal = false
)
select jsonb_build_object(
  'hero', jsonb_build_object(
    'space_count', (select count(*) from public.departments),
    'open_task_count', (
      select count(*) from public.tasks
      where assignee_id = p_user_id
        and is_personal = false
        and parent_task_id is null
        and completed_at is null
    ),
    'my_due_task_count', (
      select count(*) from public.tasks
      where assignee_id = p_user_id and completed_at is null and due_date is not null
    ),
    'active_sprint_count', (select count(*) from public.sprints where status = 'active')
  ),
  'my_tasks_summary', (
    select jsonb_build_object(
      'today', count(*) filter (where due_date::date = current_date),
      'overdue', count(*) filter (where due_date::date < current_date),
      'this_week', count(*) filter (
        where due_date::date > current_date and due_date::date <= b.week_end_date
      ),
      'sprint_open', (
        select count(distinct t.id)
        from public.tasks t
        join public.sprint_members sm on sm.sprint_id = t.sprint_id and sm.user_id = p_user_id
        where t.assignee_id = p_user_id
          and t.task_type = 'sprint'
          and t.completed_at is null
          and t.parent_task_id is null
          and t.deleted_at is null
      )
    )
    from public.tasks
    where assignee_id = p_user_id
      and completed_at is null
      and parent_task_id is null
      and due_date is not null
  ),
  'custom_stats', jsonb_build_object(
    'meetings_this_week', (
      select count(*) from public.meetings
      where date >= b.week_start and date < b.week_end
    ),
    'completed_this_week', (
      select count(*) from public.tasks where completed_at >= b.week_start
    )
  ),
  'completion_rate', (
    select jsonb_build_object(
      'completed_this_week', count(*) filter (where completed_at >= b.week_start),
      'created_this_week', count(*) filter (where created_at >= b.week_start),
      'completed_last_week', count(*) filter (
        where completed_at >= b.last_week_start and completed_at < b.week_start
      )
    )
    from scoped_tasks
  ),
  'sprint_progress', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'status', s.status,
      'start_date', s.start_date,
      'end_date', s.end_date,
      'department_id', s.department_id,
      'total', (
        select count(*) from public.tasks t
        where t.sprint_id = s.id and t.is_personal = false
      ),
      'completed', (
        select count(*)
        from public.tasks t
        join public.task_status_definitions d on d.id = t.status_id
        where t.sprint_id = s.id and t.is_personal = false and d.category = 'completed'
      )
    )), '[]'::jsonb)
    from (
      select id, name, status, start_date, end_date, department_id
      from public.sprints
      where status in ('planning', 'active', 'review')
      order by start_date desc nulls last
      limit 3
    ) s
  ),
  'overdue_by_member', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id,
      'title', t.title,
      'due_date', t.due_date,
      'status', t.status,
      'assignee_id', t.assignee_id,
      'assignee_name', u.name
    ) order by t.due_date), '[]'::jsonb)
    from public.tasks t
    join public.users u on u.id = t.assignee_id
    where t.due_date::date < current_date
      and t.status not in ('done', 'completed', 'cancelled')
      and t.assignee_id is not null
      and t.is_personal = false
      and t.parent_task_id is null
  )
)
from bounds b
$function$;

-- Thin dispatcher — same signature as before, so useDashboardData.js needs no changes.
CREATE OR REPLACE FUNCTION public.get_dashboard_data(p_user_id uuid, p_role text DEFAULT NULL::text, p_department_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $function$
BEGIN
  CASE p_role
    WHEN 'member' THEN
      RETURN public.get_dashboard_data_member(p_user_id);
    WHEN 'dept_lead' THEN
      RETURN public.get_dashboard_data_dept_lead(p_user_id, p_department_id);
    WHEN 'pastor' THEN
      RETURN public.get_dashboard_data_pastor(p_user_id);
    ELSE
      RETURN public.get_dashboard_data_unscoped(p_user_id);
  END CASE;
END;
$function$;
