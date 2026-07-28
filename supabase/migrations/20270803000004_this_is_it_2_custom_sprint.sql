-- "This is it 2.0" is a custom sprint — its tasks should never surface on
-- department space boards. Reclassify from whatever type it currently holds
-- to 'custom' so sync_task_department_id() never resolves a department_id
-- for its tasks going forward.

update public.sprints
set sprint_type = 'custom'
where name = 'This is it 2.0';

-- Backfill: clear any department_id that leaked onto existing tasks before
-- this reclassification. sync_task_department_id() only fires on INSERT or
-- assignee_id change, so we must do this manually for existing rows.
update public.tasks
set department_id = null
where sprint_id = (select id from public.sprints where name = 'This is it 2.0')
  and department_id is not null;
