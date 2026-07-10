-- Double opt-in setting and contact confirmation flow
-- Allows the subscribe function to optionally require email confirmation before
-- activating a new contact. Admins toggle double_opt_in_enabled via SQL (or
-- later, an admin UI). Default is false (immediate subscription).

create table if not exists public.communication_settings (
  id                      uuid primary key default gen_random_uuid(),
  double_opt_in_enabled   boolean not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- Ensure only one settings row exists (via constraint, not a trigger).
alter table public.communication_settings
  add constraint only_one_settings check (id = '00000000-0000-0000-0000-000000000001'::uuid);

-- Insert the default settings row on first migration.
insert into public.communication_settings (id, double_opt_in_enabled)
  values ('00000000-0000-0000-0000-000000000001'::uuid, false)
  on conflict do nothing;

-- Extend communication_contacts for the confirmation flow.
alter table public.communication_contacts
  add column if not exists confirm_token text unique,
  add column if not exists confirmed_at timestamptz,
  add column if not exists status text not null default 'active' check (status in ('active', 'pending'));
