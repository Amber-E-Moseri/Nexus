-- Create the os-attachments Storage bucket used by FileUpload.jsx.
-- Bucket was previously only creatable via the dashboard; this makes it reproducible.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'os-attachments',
  'os-attachments',
  false,
  20971520,  -- 20 MB
  array[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do nothing;

-- Authenticated users can read any attachment (task/meeting/sprint/space files)
create policy "Authenticated read os-attachments"
  on storage.objects for select
  using (bucket_id = 'os-attachments' and auth.role() = 'authenticated');

-- Authenticated users can upload
create policy "Authenticated upload os-attachments"
  on storage.objects for insert
  with check (bucket_id = 'os-attachments' and auth.role() = 'authenticated');

-- Delete allowed only to the original uploader (joined via file_attachments.uploaded_by).
-- Avoids path-segment assumptions — storage_path is stored verbatim and matches storage.objects.name.
create policy "Uploader delete os-attachments"
  on storage.objects for delete
  using (
    bucket_id = 'os-attachments'
    and exists (
      select 1 from public.file_attachments fa
      where fa.storage_path = name
        and fa.uploaded_by = auth.uid()
    )
  );
-- No UPDATE policy: uploads are append-only; delete + re-upload for replacements.
