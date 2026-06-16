-- Add show_in_sidebar flag to external_integrations.
-- Controls whether an integration appears in the left sidebar.
-- Keeps this separate from `enabled` (which controls Integrations page visibility).

alter table public.external_integrations
  add column if not exists show_in_sidebar boolean not null default false;

-- Foundation School and CAN Map stay in the sidebar.
update public.external_integrations
set show_in_sidebar = true
where name in ('Foundation School', 'CAN Map');

-- Canva and Google Drive are removed from the sidebar per product decision.
update public.external_integrations
set show_in_sidebar = false
where name in ('Canva', 'Google Drive');
