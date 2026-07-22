-- YOUTHFEST'26 is a one-off event sprint (category='group'), not a real
-- cross-department collaboration — some of its ad-hoc teams (Publicity &
-- Media, Logistics, Food/Business Vendors Procurement) happen to be mapped
-- to real org departments (Media, Admins, PFCC) for convenience, but this
-- sprint's tasks should never surface on those departments' own Space
-- boards. Per product decision: a genuinely multi-dept sprint (departments
-- actually collaborating) should show tasks in each dept's space, but an
-- event/custom sprint should stay entirely within its own sprint board,
-- regardless of whether its teams happen to reuse department names.
--
-- sprint_type was 'multi_dept', which sync_task_department_id() (see
-- 20270720000029_sprint_task_dept_sync.sql) resolves via the assignee's
-- team department_id. Reclassifying to 'custom' makes that trigger never
-- resolve a department_id for this sprint's tasks going forward.

update public.sprints
set sprint_type = 'custom'
where id = '0d97a3c0-4ef3-47b9-8ec9-95b4e33394a4'
  and name = 'YOUTHFEST''26';

-- Backfill: sprint_type only affects the trigger on INSERT or assignee_id
-- change, so existing rows that already leaked a department_id need a
-- one-time clear.
update public.tasks
set department_id = null
where sprint_id = '0d97a3c0-4ef3-47b9-8ec9-95b4e33394a4'
  and department_id is not null;
