create table if not exists public.org_settings (
  id uuid primary key default gen_random_uuid(),
  org_name text not null default 'BLW Canada Sub-Region',
  timezone text not null default 'America/Toronto',
  logo_url text,
  updated_at timestamptz default now(),
  updated_by uuid references auth.users(id)
);

insert into public.org_settings (org_name, timezone) values ('BLW Canada Sub-Region', 'America/Toronto')
on conflict do nothing;

alter table public.org_settings enable row level security;

create policy "All authenticated users can read org settings"
  on public.org_settings
  for select
  using (auth.role() = 'authenticated');

create policy "Super admin can update"
  on public.org_settings
  for update
  using (
    exists (
      select 1
      from public.users
      where public.users.id = auth.uid() and public.users.role = 'super_admin'
    )
  );

create table if not exists public.deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  requested_at timestamptz default now(),
  processed boolean default false
);

alter table public.deletion_requests enable row level security;

create policy "Users can view own deletion requests"
  on public.deletion_requests
  for select
  using (auth.uid() = user_id);

create policy "Super admin can view all deletion requests"
  on public.deletion_requests
  for select
  using (
    exists (
      select 1
      from public.users
      where public.users.id = auth.uid() and public.users.role = 'super_admin'
    )
  );

create policy "Users can insert own deletion requests"
  on public.deletion_requests
  for insert
  with check (auth.uid() = user_id);
