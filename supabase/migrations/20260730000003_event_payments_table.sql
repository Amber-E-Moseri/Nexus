-- event_payments: per-registrant payment tracking for This Is It 2.0.
-- Finance team members are granted read/write access via the
-- 'finance_data_access' user grant (super_admin assigns manually).
-- Regional secretary and super_admin always have access via role check.

create table if not exists public.event_payments (
  id              uuid primary key default gen_random_uuid(),
  email           text not null unique,
  full_name       text not null default '',
  subgroup        text not null default '',
  amount_expected numeric(10,2) not null default 0,
  amount_paid     numeric(10,2) not null default 0,
  payment_date    date,
  payment_notes   text not null default '',
  recorded_by     uuid references public.users(id) on delete set null,
  updated_at      timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

alter table public.event_payments enable row level security;

-- Finance access: super_admin, regional_secretary, or finance_data_access grant
create policy "event_payments_select"
on public.event_payments for select to authenticated
using (
  public.current_user_role() in ('super_admin', 'regional_secretary')
  or public.user_has_grant(auth.uid(), 'finance_data_access', null)
);

create policy "event_payments_write"
on public.event_payments for all to authenticated
using (
  public.current_user_role() in ('super_admin', 'regional_secretary')
  or public.user_has_grant(auth.uid(), 'finance_data_access', null)
)
with check (
  public.current_user_role() in ('super_admin', 'regional_secretary')
  or public.user_has_grant(auth.uid(), 'finance_data_access', null)
);

create index if not exists event_payments_email_idx on public.event_payments (email);
create index if not exists event_payments_subgroup_idx on public.event_payments (subgroup);

-- Auto-stamp updated_at
create or replace function public.set_event_payments_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger event_payments_updated_at
  before update on public.event_payments
  for each row execute function public.set_event_payments_updated_at();

-- Note: grant 'finance_data_access' to Finance team members via:
-- insert into user_grants (user_id, grant_type) values (<user_id>, 'finance_data_access');
