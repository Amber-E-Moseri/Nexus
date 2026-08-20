-- Phase 0: Create Supabase Storage bucket for Zoom recordings
-- Recordings are kept indefinitely (no expiry; manual cleanup by admin)
-- Access controlled via meetings table RLS

-- Create the bucket (must also be done in Supabase dashboard or via CLI)
-- This migration documents the required settings for the bucket:
--   Name: meeting-recordings
--   Public: false
--   Allowed MIME types: video/mp4, video/webm, audio/mp4, audio/mpeg, audio/x-m4a, text/vtt, application/json
--   Max file size: 2GB (Supabase Pro limit)
--   Lifecycle: No auto-delete (keep indefinitely)

-- Storage RLS for the meeting-recordings bucket
CREATE POLICY "recordings_select_by_meeting_access"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'meeting-recordings'
    AND (
      -- Extract meeting_id from path: meeting-recordings/{dept_id}/{meeting_id}/...
      -- Path structure: {department_id}/{meeting_id}/recording.{ext}
      (string_to_array(name, '/'))[2]::uuid IN (
        SELECT id FROM public.meetings m
        WHERE m.created_by = auth.uid()
        OR m.id IN (
          SELECT meeting_id FROM public.meeting_attendance ma
          WHERE ma.user_id = auth.uid()
        )
        OR m.department_id = (SELECT department_id FROM public.users WHERE id = auth.uid())
        OR (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
      )
    )
  );

-- Only service role can insert/update/delete recordings
CREATE POLICY "recordings_backend_only_write"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'meeting-recordings' AND false);

CREATE POLICY "recordings_backend_only_update"
  ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'meeting-recordings' AND false);

CREATE POLICY "recordings_backend_only_delete"
  ON storage.objects
  FOR DELETE
  USING (bucket_id = 'meeting-recordings' AND false);
