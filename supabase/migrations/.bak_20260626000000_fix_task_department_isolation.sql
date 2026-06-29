-- Fix: Delete ORS test task that was appearing in Programs space due to department_id mismatch
-- This task (titled 'test' with status='to_do' and status_id='30c2cfdf-d929-43e3-9f64-6677cd890882')
-- had department_id='740b2809-b821-4861-b323-c37612de7741' (ORS) but was incorrectly appearing
-- in Programs space. Delete it as it was test data.

DELETE FROM public.tasks
WHERE title = 'test'
  AND status = 'to_do'
  AND status_id = '30c2cfdf-d929-43e3-9f64-6677cd890882'
  AND department_id = '740b2809-b821-4861-b323-c37612de7741';

-- Note: The backlog orphaned status task will be handled separately if needed.
-- For now, we've fixed the query logic in getDeptTasks() to enforce strict department isolation.
