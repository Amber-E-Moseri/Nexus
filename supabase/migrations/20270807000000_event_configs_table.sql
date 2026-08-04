-- event_configs: one row per event (or template).
-- Exactly one row may have is_active = true at a time (partial unique index).
-- super_admin: full CRUD. Everyone else: read the active row only (including anon, for the public share page).

create table public.event_configs (
  id                    uuid          primary key default gen_random_uuid(),

  -- Identity
  event_name            text          not null,
  sprint_pattern        text          not null,

  -- Lifecycle
  is_active             boolean       not null default false,
  is_template           boolean       not null default false,
  template_name         text,
  template_description  text,
  cloned_from_id        uuid          references public.event_configs(id) on delete set null,

  -- Finance
  early_cutoff_at       timestamptz,
  early_fee             numeric(8,2)  not null default 250,
  standard_fee          numeric(8,2)  not null default 350,

  -- Local fellowship detection
  local_detection_regex text          not null default 'manitoba|winnipeg',
  exempt_fellowships    text[]        not null default '{}',

  -- Tab overrides: [{key, hidden?, label?}]. Omitted tabs use component defaults.
  tab_config            jsonb         not null default '[]'::jsonb,

  -- Team permission tiers: {unscoped_edit, finance_only, scoped_edit_all, scoped_edit_reg, scoped_view_reg}
  team_permissions      jsonb         not null default '{}'::jsonb,

  -- Team name substrings that grant /registration nav access in Sidebar
  sidebar_teams         text[]        not null default '{}',

  -- Key in registration_config where the public share token is stored
  public_token_key      text          not null default 'tii2_public_token',

  -- Metadata
  created_by            uuid          references public.users(id) on delete set null,
  created_at            timestamptz   not null default now(),
  updated_at            timestamptz   not null default now()
);

-- Enforce at most one active config at a time
create unique index event_configs_one_active
  on public.event_configs (is_active)
  where is_active = true;

alter table public.event_configs enable row level security;

-- super_admin: full CRUD (read templates, inactive configs, write, delete)
create policy "super_admin full access on event_configs"
  on public.event_configs for all
  using  (current_user_role() = 'super_admin')
  with check (current_user_role() = 'super_admin');

-- Authenticated non-admins: read the active config only
create policy "authenticated users read active event config"
  on public.event_configs for select
  to authenticated
  using (is_active = true);

-- Anon: read active config only (needed by RegistrationPublicPage and the public RPC)
create policy "anon read active event config"
  on public.event_configs for select
  to anon
  using (is_active = true);
