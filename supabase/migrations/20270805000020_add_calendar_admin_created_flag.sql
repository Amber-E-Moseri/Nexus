-- Repair deployments where the regional calendar migration was not applied.
alter table public.calendar_events
  add column if not exists is_admin_created boolean not null default false;
