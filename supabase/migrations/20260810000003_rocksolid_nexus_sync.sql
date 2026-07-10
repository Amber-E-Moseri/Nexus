-- Mapping table: Rock Solid admins → Nexus users
create table if not exists public.rocksolid_admin_mappings (
  id uuid primary key default gen_random_uuid(),
  admin_email text not null unique,
  nexus_user_id uuid not null references public.users(id) on delete cascade,
  group_id text,
  subgroup_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Audit log: which Rock Solid tasks → Nexus tasks
create table if not exists public.rocksolid_task_links (
  id uuid primary key default gen_random_uuid(),
  rocksolid_type text not null,
  rocksolid_payload jsonb not null,
  nexus_task_id uuid not null references public.tasks(id) on delete cascade,
  nexus_user_id uuid not null references public.users(id),
  created_at timestamptz not null default now()
);

-- RLS: admins can only see their own mappings
alter table public.rocksolid_admin_mappings enable row level security;
create policy "admins_read_own_mappings" on public.rocksolid_admin_mappings
  for select using (auth.uid() = nexus_user_id or current_setting('request.jwt.claims')::jsonb->>'user_role' = 'super_admin');

create policy "super_admin_manage_mappings" on public.rocksolid_admin_mappings
  for all using (current_setting('request.jwt.claims')::jsonb->>'user_role' = 'super_admin');

-- RLS: task links are read-only for admins, written by service role
alter table public.rocksolid_task_links enable row level security;
create policy "admins_read_their_links" on public.rocksolid_task_links
  for select using (nexus_user_id = auth.uid() or current_setting('request.jwt.claims')::jsonb->>'user_role' = 'super_admin');

create policy "service_role_write_links" on public.rocksolid_task_links
  for insert with check (true);
