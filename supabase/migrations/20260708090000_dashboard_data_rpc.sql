-- BLW-02: consolidate the Dashboard's uncoordinated per-widget queries into a
-- single RPC. Supersedes get_dashboard_stats (kept for backward compatibility)
-- and replaces the client-side count queries previously fired by:
--   - useOrgStats (hero cards)
--   - MyTasksSummaryWidget (getMyTasks -> 4 queries)
--   - useCustomStat (meetings/completed this week)
--   - CompletionRateWidget (4 queries; also fixes its broken updated_at filter —
--     tasks has completed_at, not updated_at, so those counts always read 0)
--   - SprintProgressWidget (up to 6 queries)
--   - OverdueByMemberWidget (2 queries; also returns title, which the widget
--     displays but never previously selected)
--
-- SECURITY INVOKER (the default): every subquery runs under the caller's JWT,
-- so RLS policies still scope all reads.

create or replace function public.get_dashboard_data(
  p_user_id uuid,
  p_role text default null,
  p_department_id uuid default null
)
returns jsonb
language sql
stable
as $$
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
-- Role scoping mirrors CompletionRateWidget's applyRoleFilter()
scoped_tasks as (
  select t.completed_at, t.created_at
  from public.tasks t
  where t.is_personal = false
    and case
      when p_role = 'member' then t.assignee_id = p_user_id
      when p_role = 'dept_lead' then (p_department_id is null or t.department_id = p_department_id)
      when p_role = 'pastor' then t.assignee_id in (select member_id from flock)
      else true
    end
)
select jsonb_build_object(
  'hero', jsonb_build_object(
    'space_count', (select count(*) from public.departments),
    'open_task_count', (
      select count(*) from public.tasks
      where is_personal = false and parent_task_id is null and completed_at is null
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
        and case
          when p_role = 'dept_lead' then (p_department_id is null or department_id = p_department_id)
          when p_role = 'member' then id in (
            select sprint_id from public.sprint_members where user_id = p_user_id
          )
          when p_role = 'pastor' then id in (
            select sprint_id from public.sprint_members
            where user_id in (select member_id from flock)
          )
          else true
        end
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
    -- widget is admin/lead/pastor-only; members get an empty list
    where p_role is distinct from 'member'
      and t.due_date::date < current_date
      and t.status not in ('done', 'completed', 'cancelled')
      and t.assignee_id is not null
      and t.is_personal = false
      and t.parent_task_id is null
      and case
        when p_role = 'dept_lead' then (p_department_id is null or t.department_id = p_department_id)
        when p_role = 'pastor' then t.assignee_id in (select member_id from flock)
        else true
      end
  )
)
from bounds b
$$;

grant execute on function public.get_dashboard_data(uuid, text, uuid) to authenticated;

comment on function public.get_dashboard_data(uuid, text, uuid) is
  'BLW-02: batches dashboard hero stats and count-based widget data (my tasks summary, custom stats, completion rate, sprint progress, overdue by member) into a single round-trip. SECURITY INVOKER so RLS applies.';
