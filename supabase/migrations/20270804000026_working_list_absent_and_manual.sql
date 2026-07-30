-- Extend working_list with absent tracking and manually-added flag.
-- absent: registration team marks a person as confirmed absent (won't attend)
-- absent_reason: free-text reason supplied by the team
-- manually_added: row was added via the UI, not synced from Google Sheets
--   → preserved across Sheet re-imports so manually-added entries aren't wiped

alter table public.working_list
  add column if not exists absent boolean not null default false,
  add column if not exists absent_reason text,
  add column if not exists manually_added boolean not null default false;

create index if not exists working_list_manually_added_idx on public.working_list (manually_added);
create index if not exists working_list_absent_idx on public.working_list (absent);
