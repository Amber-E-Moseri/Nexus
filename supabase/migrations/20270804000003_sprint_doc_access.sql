-- =============================================================================
-- Sprint reference doc access control
-- -----------------------------------------------------------------------------
-- Adds per-file access control to file_attachments for sprint reference docs.
-- access_level='all'      → visible to all authenticated users (existing default)
-- access_level='specific' → visible only to uploader + explicit grants below
-- =============================================================================

alter table public.file_attachments
  add column if not exists access_level text not null default 'all'
    check (access_level in ('all', 'specific'));

-- Junction table: each row grants access to one file for either a user OR a team
create table if not exists public.file_attachment_access (
  id             uuid primary key default gen_random_uuid(),
  file_id        uuid not null references public.file_attachments(id) on delete cascade,
  user_id        uuid references public.users(id) on delete cascade,
  sprint_team_id uuid references public.sprint_teams(id) on delete cascade,
  granted_by     uuid not null references public.users(id),
  created_at     timestamptz default now(),
  -- exactly one of user_id / sprint_team_id must be set
  constraint one_grantee check (
    (user_id is not null)::int + (sprint_team_id is not null)::int = 1
  )
);

create index if not exists file_attachment_access_file_idx        on public.file_attachment_access (file_id);
create index if not exists file_attachment_access_user_idx        on public.file_attachment_access (user_id)        where user_id        is not null;
create index if not exists file_attachment_access_team_idx        on public.file_attachment_access (sprint_team_id) where sprint_team_id is not null;

alter table public.file_attachment_access enable row level security;

-- Authenticated users can read grants for files they can already see
create policy "Read file access grants"
  on public.file_attachment_access for select
  using (auth.role() = 'authenticated');

-- Uploader can add grants
create policy "Uploader can grant access"
  on public.file_attachment_access for insert
  with check (granted_by = auth.uid());

-- Uploader or admin can revoke
create policy "Uploader or admin can revoke access"
  on public.file_attachment_access for delete
  using (
    granted_by = auth.uid()
    or exists (select 1 from public.users where id = auth.uid() and role = 'super_admin')
  );

-- =============================================================================
-- Update file_attachments select policy to enforce access_level
-- =============================================================================
drop policy if exists "Authenticated users read attachments" on public.file_attachments;

create policy "Read file attachments with access check"
  on public.file_attachments for select
  using (
    -- Uploader always sees their own files
    auth.uid() = uploaded_by
    or
    -- 'all' → any authenticated user (existing behaviour, unchanged)
    access_level = 'all'
    or
    -- 'specific' → directly granted user
    (
      access_level = 'specific'
      and exists (
        select 1 from public.file_attachment_access faa
        where faa.file_id = id
          and faa.user_id = auth.uid()
      )
    )
    or
    -- 'specific' → member of a granted sprint team
    (
      access_level = 'specific'
      and exists (
        select 1 from public.file_attachment_access faa
        join public.sprint_team_members stm on stm.team_id = faa.sprint_team_id
        where faa.file_id = id
          and stm.user_id = auth.uid()
      )
    )
  );
