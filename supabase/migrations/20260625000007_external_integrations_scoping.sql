-- Add scoping columns to external_integrations table
-- Allows integrations to be scoped to departments and/or individual users

alter table public.external_integrations
  add column if not exists scope text default 'global'
    check (scope in ('global', 'departments', 'users'));

alter table public.external_integrations
  add column if not exists department_ids uuid[] default array[]::uuid[];

alter table public.external_integrations
  add column if not exists user_id uuid references public.users(id) on delete set null;

alter table public.external_integrations
  add column if not exists user_ids uuid[] default array[]::uuid[];

-- Create indexes for faster lookups
create index if not exists external_integrations_scope_idx
  on public.external_integrations(scope);

create index if not exists external_integrations_department_ids_idx
  on public.external_integrations using gin (department_ids);

create index if not exists external_integrations_user_ids_idx
  on public.external_integrations using gin (user_ids);

-- Migrate existing data
-- Integrations with department_id get scope='departments'
update public.external_integrations
set scope = 'departments',
    department_ids = case when department_id is not null then array[department_id] else array[]::uuid[] end
where department_id is not null and scope = 'global';

-- Integrations with user_id (if any) get scope='users'
update public.external_integrations
set scope = 'users',
    user_ids = case when user_id is not null then array[user_id] else array[]::uuid[] end
where user_id is not null and scope = 'global';

-- Add comments
comment on column public.external_integrations.scope is
  'Integration visibility scope: global (all users), departments (specific depts), or users (specific users)';

comment on column public.external_integrations.department_ids is
  'Array of department IDs this integration is visible to (when scope=''departments'')';

comment on column public.external_integrations.user_ids is
  'Array of user IDs this integration is visible to (when scope=''users'')';
