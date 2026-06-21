-- Migration: Create pastor_subgroup_assignments table
-- Purpose: Link pastors to subgroups they oversee (for meeting reports, attendance tracking)
-- Date: 2026-06-20

create table if not exists public.pastor_subgroup_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  subgroup text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  assigned_at timestamptz not null default now(),

  unique(user_id, subgroup)
);

create index if not exists idx_pastor_subgroup_assignments_user_id
  on public.pastor_subgroup_assignments(user_id);

create index if not exists idx_pastor_subgroup_assignments_subgroup
  on public.pastor_subgroup_assignments(subgroup);

alter table public.pastor_subgroup_assignments enable row level security;

create policy "pastor_subgroup_assignments_select_own"
  on public.pastor_subgroup_assignments
  for select
  using (
    user_id = auth.uid()
    or public.current_user_role() = 'super_admin'
  );

create policy "pastor_subgroup_assignments_insert"
  on public.pastor_subgroup_assignments
  for insert
  with check (
    public.current_user_role() = 'super_admin'
  );

create policy "pastor_subgroup_assignments_update"
  on public.pastor_subgroup_assignments
  for update
  using (
    public.current_user_role() = 'super_admin'
  );

create policy "pastor_subgroup_assignments_delete"
  on public.pastor_subgroup_assignments
  for delete
  using (
    public.current_user_role() = 'super_admin'
  );
