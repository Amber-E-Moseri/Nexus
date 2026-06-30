-- Meeting Detail Features: decisions, next_steps fields + meeting_files table

-- Add decisions and next_steps columns to meetings
ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS decisions text,
  ADD COLUMN IF NOT EXISTS next_steps text;

-- meeting_files table for Supabase Storage uploads
CREATE TABLE IF NOT EXISTS public.meeting_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_size bigint NOT NULL,
  mime_type text NOT NULL,
  storage_path text NOT NULL,
  public_url text,
  uploaded_by uuid REFERENCES public.users(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meeting_files_meeting_id ON public.meeting_files(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_files_uploaded_by ON public.meeting_files(uploaded_by);

ALTER TABLE public.meeting_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meeting_files_select" ON public.meeting_files
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "meeting_files_insert" ON public.meeting_files
  FOR INSERT TO authenticated WITH CHECK (uploaded_by = auth.uid());

CREATE POLICY "meeting_files_delete" ON public.meeting_files
  FOR DELETE TO authenticated USING (uploaded_by = auth.uid());
