-- Add identity-tracking columns to automation_run_log so every run records
-- what triggered it and which automation owner is responsible.
alter table public.automation_run_log
  add column if not exists triggered_by text,
  add column if not exists automation_owner_id uuid references public.users(id);

create index if not exists idx_automation_run_log_owner
  on public.automation_run_log(automation_owner_id);
