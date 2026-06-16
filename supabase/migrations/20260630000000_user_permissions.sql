create table if not exists public.user_permissions (
  user_id uuid not null references public.users(id) on delete cascade,
  permission text not null,
  granted_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  primary key (user_id, permission)
);

create table if not exists public.available_permissions (
  key text primary key,
  label text not null,
  description text,
  area text not null
);

insert into public.available_permissions (key, label, description, area)
values
  ('calendar:write', 'Edit Ministry Calendar', 'Create, edit, and delete calendar events', 'Calendar'),
  ('people:view_all', 'View All Members', 'See members across all departments', 'People'),
  ('people:invite', 'Send Invitations', 'Send new user invitations', 'People'),
  ('people:manage', 'Manage Members', 'Edit user profiles and department assignments', 'People'),
  ('communications:access', 'Access Communications', 'Access the communications page and BLW Mail', 'Communications'),
  ('ministry:announcements', 'Post Announcements', 'Post org-wide ministry announcements', 'Ministry'),
  ('ministry:reports', 'View Reports', 'View cross-department reports', 'Ministry'),
  ('automations:manage', 'Manage Automations', 'Create and edit automation rules', 'Automations'),
  ('sprints:manage', 'Manage Sprints', 'Create and manage sprints outside own department', 'Sprints'),
  ('api:manage', 'Manage API Keys', 'Generate and revoke API keys', 'API')
on conflict (key) do update
set
  label = excluded.label,
  description = excluded.description,
  area = excluded.area;

drop function if exists public.has_permission(text);
create or replace function public.has_permission(p_permission text)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if (auth.jwt() ->> 'user_role') = 'super_admin' then
    return true;
  end if;

  return exists (
    select 1
    from public.user_permissions
    where user_id = auth.uid()
      and permission = p_permission
  );
end;
$$;

grant execute on function public.has_permission(text) to authenticated;

alter table public.user_permissions enable row level security;
alter table public.available_permissions enable row level security;

drop policy if exists "user_permissions_select" on public.user_permissions;
drop policy if exists "user_permissions_manage" on public.user_permissions;

create policy "user_permissions_select"
on public.user_permissions
for select
to authenticated
using (
  user_id = auth.uid()
  or (auth.jwt() ->> 'user_role') = 'super_admin'
);

create policy "user_permissions_manage"
on public.user_permissions
for all
to authenticated
using ((auth.jwt() ->> 'user_role') = 'super_admin')
with check ((auth.jwt() ->> 'user_role') = 'super_admin');

drop policy if exists "available_permissions_select" on public.available_permissions;
drop policy if exists "available_permissions_manage" on public.available_permissions;

create policy "available_permissions_select"
on public.available_permissions
for select
to authenticated
using (true);

create policy "available_permissions_manage"
on public.available_permissions
for all
to authenticated
using ((auth.jwt() ->> 'user_role') = 'super_admin')
with check ((auth.jwt() ->> 'user_role') = 'super_admin');

drop policy if exists "calendar_events_write" on public.calendar_events;
create policy "calendar_events_write"
on public.calendar_events
for all
to authenticated
using (
  (auth.jwt() ->> 'user_role') in ('super_admin', 'dept_lead')
  or public.has_permission('calendar:write')
  or created_by = auth.uid()
)
with check (
  (auth.jwt() ->> 'user_role') in ('super_admin', 'dept_lead')
  or public.has_permission('calendar:write')
  or created_by = auth.uid()
);
