create table if not exists public.file_attachments (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null,
  file_name text not null,
  file_size integer,
  mime_type text,
  entity_type text not null check (entity_type in ('task', 'meeting', 'sprint', 'space')),
  entity_id uuid not null,
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz default now()
);

alter table public.file_attachments enable row level security;

create policy "Authenticated users read attachments"
  on public.file_attachments
  for select
  using (auth.role() = 'authenticated');

create policy "Uploader can insert"
  on public.file_attachments
  for insert
  with check (auth.uid() = uploaded_by);

create policy "Uploader or admin can delete"
  on public.file_attachments
  for delete
  using (
    auth.uid() = uploaded_by
    or exists (
      select 1
      from public.users
      where public.users.id = auth.uid() and public.users.role = 'super_admin'
    )
  );

create index if not exists file_attachments_entity on public.file_attachments (entity_type, entity_id);
create index if not exists file_attachments_uploader on public.file_attachments (uploaded_by);
