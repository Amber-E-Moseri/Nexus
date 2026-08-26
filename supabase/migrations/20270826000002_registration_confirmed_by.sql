-- Audit trail for manual confirmation: who clicked "Confirm" and when. Previously
-- manually_confirmed was a bare boolean with no record of who set it or when, so a
-- disputed/wrong confirmation couldn't be traced back to a person or a time.
alter table public.registrations
  add column if not exists confirmed_by uuid references public.users(id) on delete set null,
  add column if not exists confirmed_at timestamptz;

comment on column public.registrations.confirmed_by is
  'User who last set manually_confirmed = true via the Confirm button. Cleared when '
  'manually_confirmed is toggled back off.';
comment on column public.registrations.confirmed_at is
  'Timestamp of the manual confirmation named in confirmed_by.';

create index if not exists idx_registrations_confirmed_by on public.registrations(confirmed_by);
