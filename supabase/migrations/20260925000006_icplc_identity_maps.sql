-- Persistent confirmed identity mappings for ICPLC imports.
-- Keyed by (event_id, source_type, source_key) — source_type prevents cross-source
-- collisions (a CSV row and a CMP row with the same key are different people).
-- Fuzzy matches are suggestions only; only confirmed maps are stored here.

create table public.icplc_identity_maps (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.event_configs(id) on delete restrict,
  source_type    text not null
    check (source_type in ('csv', 'cmp_registrations', 'cmp_flights', 'registration')),
  source_key     text not null,   -- normalized: lowercase, trimmed, collapsed whitespace
  participant_id uuid not null references public.icplc_participants(id) on delete cascade,
  confirmed_by   uuid references public.users(id) on delete set null,
  confirmed_at   timestamptz not null default now(),
  -- source_type is part of the unique key — same name in CSV ≠ same name in CMP
  unique(event_id, source_type, source_key)
);

create index icplc_identity_maps_participant_idx
  on public.icplc_identity_maps(participant_id);

alter table public.icplc_identity_maps enable row level security;

create policy "icplc_identity_maps_read"
  on public.icplc_identity_maps for select to authenticated
  using (public.icplc_can_read_participants());

create policy "icplc_identity_maps_write"
  on public.icplc_identity_maps for all to authenticated
  using (public.icplc_can_write_participants())
  with check (public.icplc_can_write_participants());
