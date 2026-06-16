-- =============================================================================
-- actionable_tasks view
-- =============================================================================
-- This view replaces the JS-side isTaskActionable() filter and the .limit(200)
-- workaround currently used in getMyTasks and getFlockTasks (src/lib/tasks.js).
--
-- status is a plain text column on tasks. Actionable = not done, not cancelled,
-- not archived. Adjust the excluded values below if your status strings differ.
--
-- Once validated in production, migrate getMyTasks and getFlockTasks to query
-- public.actionable_tasks directly instead of filtering client-side.
--
-- RLS note: views inherit RLS from the underlying tasks table. All existing
-- row-level security policies on tasks remain enforced for every caller.
-- =============================================================================

create or replace view public.actionable_tasks as
select *
from public.tasks
where is_personal = false
  and parent_task_id is null
  and status not in ('done', 'completed', 'cancelled', 'archived');
