-- Track files uploaded to Google Drive from tasks and meetings

CREATE TABLE IF NOT EXISTS public.space_drive_files (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id           uuid        REFERENCES public.tasks(id) ON DELETE CASCADE,
  meeting_id        uuid        REFERENCES public.meetings(id) ON DELETE CASCADE,
  file_id           text        NOT NULL, -- Google Drive file ID
  file_name         text        NOT NULL,
  web_view_link     text        NOT NULL,
  uploaded_by       uuid        NOT NULL REFERENCES public.users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (task_id IS NOT NULL OR meeting_id IS NOT NULL)
);

CREATE INDEX idx_space_drive_files_task_id ON public.space_drive_files(task_id);
CREATE INDEX idx_space_drive_files_meeting_id ON public.space_drive_files(meeting_id);

-- RLS: users can see files for their tasks/meetings
ALTER TABLE public.space_drive_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view drive files for accessible tasks"
  ON public.space_drive_files FOR SELECT
  USING (
    task_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.tasks
      WHERE tasks.id = space_drive_files.task_id
        AND (
          tasks.assignee_id = auth.uid()
          OR tasks.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.sprint_members
            WHERE sprint_members.user_id = auth.uid()
              AND sprint_members.sprint_id = tasks.sprint_id
          )
        )
    )
    OR
    meeting_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.meetings
      WHERE meetings.id = space_drive_files.meeting_id
        AND department_id IN (
          SELECT department_id FROM public.users WHERE id = auth.uid()
        )
    )
  );

CREATE POLICY "Users can insert drive files for their tasks/meetings"
  ON public.space_drive_files FOR INSERT
  WITH CHECK (
    uploaded_by = auth.uid()
    AND (
      task_id IS NOT NULL
      OR meeting_id IS NOT NULL
    )
  );
