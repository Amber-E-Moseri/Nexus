-- One row per CSV/CMP line in an import batch.
-- raw_payload contains the original source data — gated to write-capable tiers only.
-- changes_preview is the server-computed authority decision (never client-computed).

create table public.icplc_import_rows (
  id              uuid primary key default gen_random_uuid(),
  batch_id        uuid not null references public.icplc_import_batches(id) on delete cascade,
  row_number      int not null,
  raw_payload     jsonb not null default '{}',  -- original source values; write-tier RLS only
  participant_id  uuid references public.icplc_participants(id) on delete set null,
  match_status    text not null default 'unmatched'
    check (match_status in ('auto', 'manual', 'persistent', 'unmatched', 'error')),
  identity_key    text,  -- normalized identity key used for matching
  -- Server-computed authority decisions — browser renders this, never recomputes it.
  -- Format per field: { "registration_status": { "decision": "update", "current": "unknown",
  --   "incoming": "registered", "reason": "..." }, ... }
  changes_preview jsonb not null default '{}',
  apply_status    text
    check (apply_status in ('kept', 'updated', 'protected', 'skipped', 'error')),
  error_detail    text,
  created_at      timestamptz not null default now()
);

create index icplc_import_rows_batch_idx on public.icplc_import_rows(batch_id);
create index icplc_import_rows_participant_idx on public.icplc_import_rows(participant_id)
  where participant_id is not null;

alter table public.icplc_import_rows enable row level security;

-- raw_payload is sensitive CSV data; only write-capable tiers may read it.
create policy "icplc_import_rows_read"
  on public.icplc_import_rows for select to authenticated
  using (public.icplc_can_write_participants());

create policy "icplc_import_rows_write"
  on public.icplc_import_rows for all to authenticated
  using (public.icplc_can_write_participants())
  with check (public.icplc_can_write_participants());
