-- Add due_time to tasks (nullable time-of-day, stored as time without time zone)
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS due_time time;

-- Also add to the tasks view used by the dashboard RPC if it references columns directly
-- (No view changes needed — due_time is additive and RPCs use SELECT *)
