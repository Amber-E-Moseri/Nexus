-- RLS note: no RLS is added to this view. It inherits access control from
-- public.tasks, and all underlying task policies continue to apply.

create or replace view public.actionable_tasks as
select t.*
from public.tasks t
left join public.task_status_definitions tsd
  on t.status_id = tsd.id
where t.is_personal = false
  and t.parent_task_id is null
  and (
    tsd.category is null
    or tsd.category not in ('completed', 'cancelled', 'archived')
  );

comment on view public.actionable_tasks is
  'Uses a LEFT JOIN to task_status_definitions and excludes completed/cancelled/archived categories. Rows with NULL status_id remain visible because their completion state is unknown.';
