-- =============================================================================
-- Dashboard preferences and role defaults
-- =============================================================================

-- -------------------------------------------------------------------------
-- dashboard_preferences (per-user overrides)
-- -------------------------------------------------------------------------
create table if not exists public.dashboard_preferences (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  widget_key  text not null,
  visible     boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (user_id, widget_key)
);

alter table public.dashboard_preferences enable row level security;

create policy "dash_prefs_select" on public.dashboard_preferences
  for select to authenticated using (user_id = auth.uid());

create policy "dash_prefs_insert" on public.dashboard_preferences
  for insert to authenticated with check (user_id = auth.uid());

create policy "dash_prefs_update" on public.dashboard_preferences
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "dash_prefs_delete" on public.dashboard_preferences
  for delete to authenticated using (user_id = auth.uid());

-- -------------------------------------------------------------------------
-- dashboard_role_defaults (system defaults per role)
-- -------------------------------------------------------------------------
create table if not exists public.dashboard_role_defaults (
  role        text not null,
  widget_key  text not null,
  visible     boolean not null default true,
  sort_order  integer not null default 0,
  primary key (role, widget_key)
);

alter table public.dashboard_role_defaults enable row level security;

create policy "dash_role_defaults_select" on public.dashboard_role_defaults
  for select to authenticated using (true);

create policy "dash_role_defaults_write" on public.dashboard_role_defaults
  for all to authenticated
  using (auth.jwt() ->> 'user_role' = 'super_admin')
  with check (auth.jwt() ->> 'user_role' = 'super_admin');

-- -------------------------------------------------------------------------
-- Seed default widget layouts per role
-- -------------------------------------------------------------------------
insert into public.dashboard_role_defaults (role, widget_key, visible, sort_order) values
  ('super_admin', 'upcoming_events',    true, 1),
  ('super_admin', 'sprint_progress',    true, 2),
  ('super_admin', 'overdue_by_member',  true, 3),
  ('super_admin', 'member_activity',    true, 4),
  ('super_admin', 'completion_rate',    true, 5),
  ('super_admin', 'my_tasks_summary',   true, 6),
  ('super_admin', 'quick_actions',      true, 7),

  ('dept_lead',   'upcoming_events',    true, 1),
  ('dept_lead',   'sprint_progress',    true, 2),
  ('dept_lead',   'overdue_by_member',  true, 3),
  ('dept_lead',   'member_activity',    true, 4),
  ('dept_lead',   'completion_rate',    true, 5),
  ('dept_lead',   'my_tasks_summary',   true, 6),
  ('dept_lead',   'quick_actions',      true, 7),

  ('pastor',      'upcoming_events',    true, 1),
  ('pastor',      'sprint_progress',    true, 2),
  ('pastor',      'overdue_by_member',  true, 3),
  ('pastor',      'member_activity',    true, 4),
  ('pastor',      'my_tasks_summary',   true, 5),

  ('member',      'upcoming_events',    true, 1),
  ('member',      'sprint_progress',    true, 2),
  ('member',      'my_tasks_summary',   true, 3),
  ('member',      'completion_rate',    true, 4)

on conflict (role, widget_key) do nothing;
