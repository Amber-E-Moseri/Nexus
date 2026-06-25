-- Meeting Documents Table
-- Store PDF, images, Office files uploaded to meetings
-- Auto-sync minutes PDF to Google Drive

CREATE TABLE IF NOT EXISTS public.meeting_documents (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,

  -- File metadata
  file_name text not null,
  file_size integer not null,
  file_type text not null check (file_type in ('pdf', 'image', 'office', 'other')),
  mime_type text not null,

  -- Drive storage
  drive_file_id text unique not null,
  drive_file_name text not null,
  drive_folder_id text not null,
  drive_share_link text not null,

  -- Metadata
  document_type text not null check (document_type in ('minutes', 'supporting')),
  uploaded_by uuid not null references public.users(id) on delete cascade,
  uploaded_at timestamptz default now(),
  description text,
  is_public boolean default true,

  -- Audit
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes
create index if not exists idx_documents_meeting_id on public.meeting_documents(meeting_id);
create index if not exists idx_documents_uploaded_at on public.meeting_documents(uploaded_at desc);
create index if not exists idx_documents_uploaded_by on public.meeting_documents(uploaded_by);

-- Enable RLS
alter table public.meeting_documents enable row level security;

-- RLS Policies

-- Users can view documents if they can see the meeting
create policy "users_view_meeting_documents" on public.meeting_documents
  for select using (
    exists (
      select 1 from public.meetings m
      where m.id = meeting_id
      and (
        m.department_id = (select department_id from public.users where id = auth.uid())
        or (select role from public.users where id = auth.uid()) = 'super_admin'
        or m.created_by = auth.uid()
      )
    )
  );

-- Users can upload documents if they can manage the meeting
create policy "users_upload_documents" on public.meeting_documents
  for insert with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.meetings m
      where m.id = meeting_id
      and (
        m.created_by = auth.uid()
        or (select role from public.users where id = auth.uid()) = 'super_admin'
        or (select role from public.users where id = auth.uid()) = 'ors'
      )
    )
  );

-- Users can delete their own documents or ORS can delete any
create policy "users_delete_own_documents" on public.meeting_documents
  for delete using (
    uploaded_by = auth.uid()
    or (select role from public.users where id = auth.uid()) = 'super_admin'
    or (select role from public.users where id = auth.uid()) = 'ors'
  );

-- Users can update their own documents
create policy "users_update_own_documents" on public.meeting_documents
  for update using (
    uploaded_by = auth.uid()
    or (select role from public.users where id = auth.uid()) = 'super_admin'
  )
  with check (
    uploaded_by = auth.uid()
    or (select role from public.users where id = auth.uid()) = 'super_admin'
  );
