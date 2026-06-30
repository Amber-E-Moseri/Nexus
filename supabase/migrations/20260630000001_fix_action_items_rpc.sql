-- =============================================================================
-- Fix get_user_action_items()
-- -----------------------------------------------------------------------------
-- The original implementation (20260622193832_dashboard_role_queries.sql) was
-- broken in two ways:
--   * it joined meetings via `t.id = m.id` (task id vs meeting id — never
--     matches), and
--   * it filtered tasks by `t.description ilike '%action%'`, but meeting tasks
--     have a null/notes description and never contain that word.
-- It completely ignored the real columns the bridge sets: `t.meeting_id` (FK to
-- meetings) and `t.source = 'meeting'`. As a result the dashboard "My Action
-- Items" widget was always empty.
--
-- This version joins meetings on the actual FK and filters on source='meeting'.
-- NOTE: the users display-name column is `name` (there is no `full_name`).
-- =============================================================================

drop function if exists public.get_user_action_items();

create function public.get_user_action_items()
returns table (
  task_id uuid,
  task_title text,
  due_date date,
  priority text,
  status text,
  status_id uuid,
  meeting_id uuid,
  meeting_title text,
  assigner_name text,
  created_at timestamptz,
  is_overdue boolean
)
language sql
security definer
set search_path = public
as $$
  select
    t.id as task_id,
    t.title as task_title,
    t.due_date,
    t.priority,
    t.status,
    t.status_id,
    t.meeting_id,
    m.title as meeting_title,
    u.name as assigner_name,
    t.created_at,
    (
      t.due_date is not null
      and t.due_date < current_date
      and t.completed_at is null
      and coalesce(t.status, '') not in ('done', 'completed', 'cancelled')
    ) as is_overdue
  from public.tasks t
  left join public.meetings m on m.id = t.meeting_id
  left join public.users u on u.id = t.created_by
  where
    t.assignee_id = auth.uid()
    and t.source = 'meeting'
    and t.is_personal = false
    and t.parent_task_id is null
  order by
    is_overdue desc,
    t.due_date asc nulls last,
    t.created_at desc;
$$;

grant execute on function public.get_user_action_items() to authenticated;
