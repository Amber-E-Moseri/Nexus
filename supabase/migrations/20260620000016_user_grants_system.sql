-- User grants system for dynamic, fine-grained permissions
-- Allows granting specific capabilities to users beyond their role/department

create table public.user_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  grant_type text not null,
  resource_type text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  unique(user_id, grant_type, resource_type)
);

alter table public.user_grants enable row level security;

-- Only super_admin can manage grants
create policy "user_grants_select" on public.user_grants
  for select to authenticated
  using (public.current_user_role() = 'super_admin');

create policy "user_grants_insert" on public.user_grants
  for insert to authenticated
  with check (public.current_user_role() = 'super_admin');

create policy "user_grants_update" on public.user_grants
  for update to authenticated
  using (public.current_user_role() = 'super_admin');

create policy "user_grants_delete" on public.user_grants
  for delete to authenticated
  using (public.current_user_role() = 'super_admin');

-- Helper function to check if user has a grant
create or replace function public.user_has_grant(p_user_id uuid, p_grant_type text, p_resource_type text default null)
returns boolean
language sql
security definer
as $$
  select exists(
    select 1 from public.user_grants
    where user_id = p_user_id
      and grant_type = p_grant_type
      and (p_resource_type is null or resource_type is null or resource_type = p_resource_type)
  )
$$;

-- Grant types for reference:
-- 'communications_manager' - can create/edit/delete communications campaigns
-- 'meetings_manager' - can create/edit/delete meetings across all departments
-- Add more as needed
