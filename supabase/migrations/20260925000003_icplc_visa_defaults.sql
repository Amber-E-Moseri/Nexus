-- Country-level visa requirement defaults for ICPLC.
-- Intentionally seeded empty — immigration rules change and cannot be assumed
-- in a migration. Admins configure country defaults via Settings > Visa Defaults.

create table public.icplc_visa_defaults (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid references public.event_configs(id) on delete cascade,
  -- null = org-wide default; non-null = event-specific override
  passport_country text not null,
  visa_requirement text not null
    check (visa_requirement in ('required', 'not_required', 'review')),
  notes            text,
  updated_at       timestamptz not null default now(),
  unique(event_id, passport_country)
);

create trigger icplc_visa_defaults_updated_at
  before update on public.icplc_visa_defaults
  for each row execute procedure public.set_updated_at();

alter table public.icplc_visa_defaults enable row level security;

-- Any authenticated user can read country defaults (needed to auto-populate new profiles).
create policy "icplc_visa_defaults_read"
  on public.icplc_visa_defaults for select to authenticated
  using (true);

-- Only super_admin / regional_secretary can manage country defaults.
create policy "icplc_visa_defaults_write"
  on public.icplc_visa_defaults for all to authenticated
  using (public.current_user_role() in ('super_admin', 'regional_secretary'))
  with check (public.current_user_role() in ('super_admin', 'regional_secretary'));
