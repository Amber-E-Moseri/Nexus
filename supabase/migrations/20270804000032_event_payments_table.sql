-- Payment tracking for This Is It 2.0 event registrations.
-- Accessible only to regional_secretary and users with finance_data_access grant.

create table if not exists public.event_payments (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  full_name     text not null default '',
  subgroup      text not null default '',
  amount_expected numeric(8,2) not null default 0,
  amount_paid     numeric(8,2) not null default 0,
  payment_date    date,
  payment_notes   text,
  recorded_by     uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.event_payments enable row level security;

-- Only regional_secretary and finance grant holders can read
create policy "event_payments_select"
on public.event_payments for select to authenticated
using (
  (select role from public.users where id = auth.uid()) in ('regional_secretary', 'super_admin')
  or exists (
    select 1 from public.user_grants
    where user_id = auth.uid() and grant_type = 'finance_data_access'
  )
);

create policy "event_payments_upsert"
on public.event_payments for insert to authenticated
with check (
  (select role from public.users where id = auth.uid()) in ('regional_secretary', 'super_admin')
  or exists (
    select 1 from public.user_grants
    where user_id = auth.uid() and grant_type = 'finance_data_access'
  )
);

create policy "event_payments_update"
on public.event_payments for update to authenticated
using (
  (select role from public.users where id = auth.uid()) in ('regional_secretary', 'super_admin')
  or exists (
    select 1 from public.user_grants
    where user_id = auth.uid() and grant_type = 'finance_data_access'
  )
);

create index if not exists event_payments_email_idx on public.event_payments (email);
create index if not exists event_payments_subgroup_idx on public.event_payments (subgroup);

-- Explicit grants so PostgREST exposes the table to the authenticated role
grant select, insert, update on public.event_payments to authenticated;

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';
