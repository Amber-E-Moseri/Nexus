-- Stores user-editable config for the registration ecosystem (This Is It 2.0).
-- Unlike app_settings (service-role only), this table has open read RLS
-- and write access gated to admins/pastors — same roles that can access /registration.

create table if not exists public.registration_config (
  key          text primary key,
  value        jsonb not null,
  updated_at   timestamptz default now()
);

alter table public.registration_config enable row level security;

-- Anyone authenticated can read (the page already gates non-permitted users out)
create policy "Authenticated users can read registration config"
  on public.registration_config for select
  using (auth.uid() is not null);

-- Admins, pastors, dept_leads can write
create policy "Admins can manage registration config"
  on public.registration_config for all
  using (current_user_role() in ('super_admin', 'dept_lead', 'pastor'));
