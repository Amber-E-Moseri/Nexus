-- Communication Campaign Attachments: Storage & Metadata

-- 1. Add attachments column to communication_campaigns
alter table public.communication_campaigns
  add column if not exists attachments jsonb not null default '[]'::jsonb;

comment on column public.communication_campaigns.attachments is
  'Array of attachment objects: {filename: string, storage_path: string, size: integer, mime_type: string, public_url: string}';

-- 2. Create communication-attachments storage bucket
insert into storage.buckets (id, name, public)
  values ('communication-attachments', 'communication-attachments', true)
  on conflict (id) do nothing;

-- 3. RLS Policies for communication-attachments bucket

-- Authenticated users can upload attachments
create policy "authenticated_users_can_upload_campaign_attachments"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'communication-attachments');

-- Authenticated users can delete attachments (campaign-level access controlled via communication_campaigns RLS)
create policy "authenticated_users_can_delete_campaign_attachments"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'communication-attachments');

-- Public read access to communication attachments
create policy "public_can_read_campaign_attachments"
  on storage.objects
  for select
  to public
  using (bucket_id = 'communication-attachments');
