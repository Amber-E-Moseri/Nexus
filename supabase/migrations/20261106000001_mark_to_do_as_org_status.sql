-- Mark "To Do" as an org status so it appears in task creation modals

UPDATE public.task_status_definitions
SET is_org_status = true
WHERE name = 'To Do'
  AND department_id IS NULL
  AND legacy_key = 'to_do';
