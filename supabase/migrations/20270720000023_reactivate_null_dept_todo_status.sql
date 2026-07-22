-- User reported "as I create a task it doesn't go to To Do." Root cause: for tasks
-- created with department_id IS NULL (personal tasks, multi-team "All Teams" sprint
-- tasks), the only department_id-null status rows are the two legacy duplicates
-- ('To Do' id ca924b42-5163-4912-8d31-c494e4191dce and 'Not Started'/backlog) — and
-- both were left `active = false`, unlike the null-department 'Cancelled' row, which
-- is active. Verified live: 22 existing tasks already have status_id pointing at this
-- inactive 'To Do' row.
--
-- TasksContext.jsx's "ensure an open-category status is always included" fallback
-- (src/features/tasks/TasksContext.jsx:59-81) queries with includeInactive: true when
-- no active 'open' status is found for the department, finds this inactive row, and
-- copies it into local state with `active` force-overridden to `true` — so the create
-- flow happily assigns its real id as status_id. But every other status query (Kanban
-- columns, get_space_statuses, listTaskStatuses elsewhere) correctly filters on the
-- real `active = false`, so the task is invisible in the "To Do" column everywhere
-- except the create-task dropdown that produced it.
--
-- Fix: reactivate the null-department 'To Do' row so it's a genuine, consistently
-- visible default for department_id-null contexts (mirroring 'Cancelled', which is
-- already active for department_id IS NULL). This also instantly fixes the 22
-- pre-existing tasks without needing a data remap, since they already point at this
-- row's id.
update task_status_definitions
set active = true
where id = 'ca924b42-5163-4912-8d31-c494e4191dce'
  and department_id is null
  and legacy_key is null
  and name = 'To Do';
