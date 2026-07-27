-- Create the meeting-documents Storage bucket used by MeetingDocsTab.jsx.
-- Never had a migration (unlike os-attachments/avatars/communication-attachments,
-- which all do) — uploads and the doc list on a meeting's Docs tab have been
-- failing with "Bucket not found" since the bucket was never provisioned.
--
-- Public (not gated behind an "authenticated" read policy like os-attachments):
-- MeetingDocsTab.jsx calls storage.getPublicUrl() and renders the result as a
-- plain <a href> — that only resolves for a public bucket, since a direct
-- browser link click carries no Supabase auth header for RLS to check against.
-- This isn't a wider exposure than today's meeting_files_select policy already
-- allows: that policy is `USING (true)` for any authenticated user regardless
-- of the meeting's own privacy setting, so the storage_path/public_url are
-- already discoverable by any logged-in user via the table.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meeting-documents',
  'meeting-documents',
  true,
  26214400,  -- 25 MB, matches MeetingDocsTab.jsx's MAX_SIZE
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp'
  ]
)
on conflict (id) do nothing;

create policy "Public read meeting-documents"
  on storage.objects for select
  using (bucket_id = 'meeting-documents');

create policy "Authenticated upload meeting-documents"
  on storage.objects for insert
  with check (bucket_id = 'meeting-documents' and auth.role() = 'authenticated');

-- Delete allowed only to the original uploader (joined via meeting_files.uploaded_by),
-- matching the meeting_files_delete RLS policy on the table itself.
create policy "Uploader delete meeting-documents"
  on storage.objects for delete
  using (
    bucket_id = 'meeting-documents'
    and exists (
      select 1 from public.meeting_files mf
      where mf.storage_path = name
        and mf.uploaded_by = auth.uid()
    )
  );
