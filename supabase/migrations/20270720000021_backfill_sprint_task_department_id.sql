-- Sprint tasks were created with department_id forced to null (TaskDetailSidebar.jsx,
-- TasksContext.jsx addTask), so they never matched getSpaceTasks()'s
-- `.or(department_id.eq.<dept>, list_id.in.(<space lists>))` filter and were invisible
-- in Space Overview's completion stats. Frontend fix stops nulling department_id going
-- forward; this backfills existing rows so historical sprint work also surfaces.
--
-- Only touches single-team sprints (sprints.department_id is not null). Multi-team
-- "All Teams" sprints have department_id = null by design (task doesn't belong to one
-- space) and are correctly left alone.
update tasks t
set department_id = s.department_id
from sprints s
where t.sprint_id = s.id
  and t.department_id is null
  and s.department_id is not null;
