-- Import batch tracking for ICPLC.
-- Each CSV/CMP upload creates one batch; the batch moves through a status machine
-- from pending → matching → matched → previewing → previewed → applying → applied (or failed).
-- CAS on status prevents double-apply (previewed → applying is atomic).

create table public.icplc_import_batches (
  id                  uuid primary key default gen_random_uuid(),
  event_id            uuid not null references public.event_configs(id) on delete restrict,
  source              text not null
    check (source in ('csv', 'cmp_registrations', 'cmp_flights')),
  source_identifier   text,           -- original filename or CMP batch ID
  mapping_version     text not null default 'v1',
  status              text not null default 'pending'
    check (status in (
      'pending', 'matching', 'matched', 'previewing', 'previewed',
      'applying', 'applied', 'failed'
    )),
  preview_computed_at timestamptz,    -- set when previewed; used to detect stale previews
  imported_at         timestamptz,
  imported_by         uuid references public.users(id) on delete set null,
  total_rows          int not null default 0,
  matched_rows        int not null default 0,
  unmatched_rows      int not null default 0,
  error_rows          int not null default 0,
  metadata            jsonb not null default '{}',
  created_at          timestamptz not null default now()
);

create index icplc_import_batches_event_idx on public.icplc_import_batches(event_id);

alter table public.icplc_import_batches enable row level security;

create policy "icplc_import_batches_read"
  on public.icplc_import_batches for select to authenticated
  using (public.icplc_can_read_participants());

create policy "icplc_import_batches_write"
  on public.icplc_import_batches for all to authenticated
  using (public.icplc_can_write_participants())
  with check (public.icplc_can_write_participants());
