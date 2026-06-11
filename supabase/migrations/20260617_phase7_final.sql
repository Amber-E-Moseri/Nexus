-- ============================================================
-- PHASE 7 - FINAL
-- ============================================================

create table if not exists public.zoom_config (
  id uuid primary key default gen_random_uuid(),
  account_id text,
  client_id text,
  webhook_secret text,
  enabled boolean not null default false,
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.external_integrations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  type text not null
    check (type in ('foundation_school', 'zoom', 'canva', 'google_drive', 'custom')),
  launch_url text not null,
  description text,
  icon_emoji text,
  visible_to text not null default 'all'
    check (visible_to in ('all', 'super_admin', 'dept_lead')),
  sort_order integer not null default 0,
  enabled boolean not null default true,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

insert into public.external_integrations
  (name, type, launch_url, description, icon_emoji, visible_to, sort_order)
values
  ('Foundation School', 'foundation_school',
   'https://foundation.blwcanada.org',
   'Student portal, teacher dashboard, and admin tools',
   '🎓', 'all', 1),
  ('CAN Map', 'custom',
   '/map',
   '358 Canadian post-secondary campuses — outreach tracking',
   '🗺', 'all', 2),
  ('Canva', 'canva',
   'https://canva.com',
   'Design graphics for ministry events and social media',
   '🎨', 'all', 3),
  ('Google Drive', 'google_drive',
   'https://drive.google.com',
   'Shared files and ministry documents',
   '📁', 'all', 4)
on conflict (name) do update
set
  type = excluded.type,
  launch_url = excluded.launch_url,
  description = excluded.description,
  icon_emoji = excluded.icon_emoji,
  visible_to = excluded.visible_to,
  sort_order = excluded.sort_order,
  enabled = true;

alter table public.zoom_config enable row level security;
alter table public.external_integrations enable row level security;

drop policy if exists "zoom_config_admin" on public.zoom_config;
create policy "zoom_config_admin" on public.zoom_config
  for all to authenticated
  using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');

drop policy if exists "external_integrations_select" on public.external_integrations;
create policy "external_integrations_select" on public.external_integrations
  for select to authenticated
  using (
    enabled = true and (
      visible_to = 'all'
      or visible_to = public.current_user_role()
      or public.current_user_role() = 'super_admin'
    )
  );

drop policy if exists "external_integrations_write" on public.external_integrations;
create policy "external_integrations_write" on public.external_integrations
  for all to authenticated
  using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');

alter table public.calendar_events
  add column if not exists zoom_join_url text;

