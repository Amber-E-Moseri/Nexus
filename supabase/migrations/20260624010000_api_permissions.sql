-- Create API permissions table
create table if not exists public.api_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  permission text not null,
  granted_by uuid references public.users(id),
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  metadata jsonb default '{}',
  unique(user_id, permission),
  check (permission in (
    'export_data',
    'manage_automations',
    'view_analytics',
    'manage_integrations',
    'manage_users',
    'create_teams',
    'manage_sprints',
    'manage_meetings',
    'api_access'
  ))
);

-- Create permission audit log
create table if not exists public.permission_audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id),
  permission text not null,
  action text not null check (action in ('granted', 'revoked', 'expired')),
  granted_by uuid references public.users(id),
  reason text,
  created_at timestamptz not null default now()
);

-- Enable RLS
alter table public.api_permissions enable row level security;
alter table public.permission_audit_log enable row level security;

-- RLS Policies for api_permissions
create policy "Users can view own permissions"
  on public.api_permissions for select
  using (auth.uid() = user_id or exists(
    select 1 from public.users where id = auth.uid() and role in ('super_admin', 'dept_lead')
  ));

create policy "Only admins can grant permissions"
  on public.api_permissions for insert
  with check (exists(
    select 1 from public.users where id = auth.uid() and role = 'super_admin'
  ));

create policy "Only admins can revoke permissions"
  on public.api_permissions for delete
  using (exists(
    select 1 from public.users where id = auth.uid() and role = 'super_admin'
  ));

-- RLS Policies for permission_audit_log
create policy "Admins can view audit log"
  on public.permission_audit_log for select
  using (exists(
    select 1 from public.users where id = auth.uid() and role = 'super_admin'
  ));

create policy "System can insert audit logs"
  on public.permission_audit_log for insert
  with check (true);

-- Index for performance
create index if not exists idx_api_permissions_user_id on public.api_permissions(user_id);
create index if not exists idx_api_permissions_permission on public.api_permissions(permission);
create index if not exists idx_permission_audit_user on public.permission_audit_log(user_id);
