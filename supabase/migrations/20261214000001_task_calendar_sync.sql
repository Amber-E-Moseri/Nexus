-- ============================================================
-- Task -> Google Calendar sync: opt-in flag + per-user sync-state table
-- ============================================================

ALTER TABLE public.google_calendar_tokens
  ADD COLUMN IF NOT EXISTS sync_tasks_enabled boolean NOT NULL DEFAULT false;

-- task_calendar_sync tracks which Google Calendar event backs which
-- (user, task) pair, regardless of whether the task is in scope because
-- it's assigned to the user or because they follow it.
CREATE TABLE IF NOT EXISTS public.task_calendar_sync (
  user_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  task_id         uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  google_event_id text NOT NULL,
  synced_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_task_calendar_sync_task_id ON public.task_calendar_sync(task_id);

ALTER TABLE public.task_calendar_sync ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_calendar_sync_user_isolation"
  ON public.task_calendar_sync FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Writes happen from the google-calendar-sync edge function via the
-- service role, which bypasses RLS; no authenticated insert/update/delete
-- policy is needed.
