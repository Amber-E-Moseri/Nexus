-- ========================================================
-- Personal Reminders: Add task linking
-- ========================================================
-- Allow personal reminders to link to tasks, making them
-- clickable shortcuts to specific tasks.

ALTER TABLE public.personal_reminders
  ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS personal_reminders_task_id_idx ON public.personal_reminders(task_id);
